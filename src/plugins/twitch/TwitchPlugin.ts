// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { QualityLevel, Translations } from '@nomercy-entertainment/nomercy-player-core';
import type { NMVideoPlayer, VideoBackendKind, VideoPlaylistItem } from '@nomercy-entertainment/nomercy-video-player';
import type { ChannelGone } from './TwitchEmbedBackend';
import type { TwitchSource } from './url';
import { Plugin, translationsFromGlob } from '@nomercy-entertainment/nomercy-player-core';
import { Html5VideoBackend } from '@nomercy-entertainment/nomercy-video-player';
import { clipStreamFactory, lookUpClip } from './clip';
import { lookUpTitle } from './metadata';
import { lookUpLiveStream, proxiedUrl } from './stream';
import { TwitchEmbedBackend } from './TwitchEmbedBackend';
import { parseTwitchUrl } from './url';

const PERCENT = 100;
const MESSAGE_MS = 6000;
const CHOICE_KEY = 'twitch-use-own-player';

/** Options for {@link TwitchPlugin}. */
export interface TwitchPluginOptions {
	/** Client id sent to Twitch's web API when resolving a clip. */
	clientId?: string;
	/** Address of a live playlist proxy that you run yourself. When set, live plays in this player; without it, live uses Twitch's embed. No video passes through it. */
	proxyUrl?: string;
}

/** Events emitted by {@link TwitchPlugin}. */
export interface TwitchPluginEvents {
	/** A clip link was resolved to its playable file. */
	'clip:resolved': { slug: string; title: string; duration: number };
	/** A live link pointed at a channel that is not streaming. */
	'channel:offline': { channel: string };
	/** A live stream that was playing has ended. */
	'channel:ended': { channel: string };
}

/** Lets the video player play regular Twitch links: clips, VODs and live channels. */
export class TwitchPlugin extends Plugin<NMVideoPlayer, TwitchPluginOptions, TwitchPluginEvents> {
	static override readonly id: string = 'twitch';
	static override readonly version: string = '0.1.0';
	static override readonly description: string = 'Plays regular Twitch links: clips, VODs and live channels';
	static override readonly translations: Translations = translationsFromGlob('./i18n/*.ts');

	private muted = false;
	private sliderLevel: number | undefined;
	private itemIndex = 0;
	private rawChannel: string | undefined;
	private choosingLevel = false;
	private twitchPlayerChosen = false;

	/** Whether live channels play in Twitch's own player instead of this one. */
	usesTwitchPlayer(): boolean {
		return this.twitchPlayerChosen;
	}

	/** Lets the viewer pick Twitch's own player or this one for live channels. A playing channel restarts in the new one. */
	useTwitchPlayer(chosen: boolean): void {
		this.twitchPlayerChosen = chosen;
		void this.storage?.setJSON?.(CHOICE_KEY, chosen);

		const url = this.player.item()?.url;
		if (url && parseTwitchUrl(url)?.type === 'channel')
			this.player.item(this.player.index());
	}

	/** Installs the backend, claims clip links, and picks the right backend before every load. */
	override use(): void {
		this.twitchPlayerChosen = this.storage?.getJSON?.<boolean>(CHOICE_KEY) === true;
		this.installBackendFactory();
		this.installStreamResolver();
		this.player.registerStream(clipStreamFactory(slug => this.resolveClipFile(slug)));

		this.on('ready', () => this.skipPreloadOfTwitchItems());
		this.on('item', ({ index }) => {
			this.itemIndex = index;
		});
		this.on('activity', ({ active }) => {
			const backend = this.player.backend();
			if (backend instanceof TwitchEmbedBackend)
				backend.makeRoomForControls(active);
		});
		this.on('volume', ({ level }) => {
			this.sliderLevel = level;
		});
		this.on('mute', ({ muted }) => {
			this.muted = muted;
		});
		this.on('levels', ({ levels }) => this.holdTallestLevel(levels));
		this.on('ended', () => this.announceRawStreamEnd());
		this.on('beforeLoad', (event) => {
			const { item } = event.data;
			const source = item.url ? parseTwitchUrl(item.url) : undefined;
			const wanted = source && source.type !== 'clip' && !this.playsRaw(source) ? 'twitch' : 'html5';

			this.rawChannel = undefined;
			this.choosingLevel = false;

			if (source && (!item.title || item.title === item.url))
				event.delay(this.fillTitle(item, source));

			if (this.player.backend().kind !== wanted)
				event.delay(this.swapBackend(wanted));
		});
	}

	/** Twitch locks VOD video to its own site, so only live can play in this player without proxying video. */
	private playsRaw(source: TwitchSource): source is Extract<TwitchSource, { type: 'channel' }> {
		return Boolean(this.opts?.proxyUrl) && !this.twitchPlayerChosen && source.type === 'channel';
	}

	/** Turns a channel link into its HLS address, so the player's own engine and UI do everything. */
	private installStreamResolver(): void {
		const previous = this.player.urlResolver();

		this.player.urlResolver(async (url, context) => {
			const source = context.category === 'media' ? parseTwitchUrl(url) : undefined;
			const proxyUrl = this.opts?.proxyUrl;

			if (source && proxyUrl && this.playsRaw(source))
				return context.defaultResolve(proxiedUrl(proxyUrl, await this.findStream(source)));

			return previous ? previous(url, context) : context.defaultResolve(url);
		});
	}

	private async findStream({ channel }: Extract<TwitchSource, { type: 'channel' }>): Promise<string> {
		const stream = await lookUpLiveStream(channel, this.opts?.clientId, this.abortable().signal);

		if (!stream) {
			this.announceChannelGone({ channel, reason: 'offline' });

			return this.throw({ code: 'plugin:twitch/stream-unavailable', message: 'Twitch has no stream for this link', context: { channel } });
		}

		this.rawChannel = channel;
		this.choosingLevel = true;

		return stream;
	}

	/** Never let the adaptive engine start blurry. The viewer's own menu choice comes after this and is left alone. */
	private holdTallestLevel(levels: readonly QualityLevel[]): void {
		const tallest = [...levels].sort((first, second) => (second.height ?? 0) - (first.height ?? 0))[0];
		if (!this.choosingLevel || !tallest)
			return;

		this.choosingLevel = false;
		this.player.backend().setQuality(tallest.index);
	}

	private announceRawStreamEnd(): void {
		if (this.rawChannel)
			this.announceChannelGone({ channel: this.rawChannel, reason: 'stream-ended' });

		this.rawChannel = undefined;
	}

	/** Adds the `twitch` backend and keeps any factory the consumer already configured. */
	private installBackendFactory(): void {
		const { options, container } = this.player;
		const previous = options.backendFactory;

		options.backendFactory = (kind, config) => {
			if (kind === 'twitch')
				return new TwitchEmbedBackend(container, gone => this.announceChannelGone(gone), () => this.t('subtitle.enabled'));

			return previous ? previous(kind, config) : new Html5VideoBackend(container);
		};
	}

	/** A new backend starts at full volume, so it gets the slider level, which survives a mute. */
	private async swapBackend(kind: VideoBackendKind): Promise<void> {
		await this.player.backend(kind);

		const backend = this.player.backend();
		backend.volume((this.sliderLevel ?? this.player.volume()) / PERCENT);
		if (this.muted)
			backend.mute();
	}

	/** A Twitch link is not a file, so prefetching the next item would only fail. */
	private skipPreloadOfTwitchItems(): void {
		const strategy = this.player.preloadStrategy();
		const assetsToPreload = strategy.assetsToPreload.bind(strategy);

		strategy.assetsToPreload = item => item.url && parseTwitchUrl(item.url) ? [] : assetsToPreload(item);
	}

	/** A link alone tells a viewer nothing, so the real name is looked up. Playback never waits on a failure. */
	private async fillTitle(item: VideoPlaylistItem, source: TwitchSource): Promise<void> {
		try {
			item.title = await lookUpTitle(source, this.opts?.clientId, this.abortable().signal) ?? item.title;
			// eslint-disable-next-line player/no-raw-player-bus -- the UI drew this item before its title was known, and only `item` redraws it.
			this.player.emit('item', { item, index: this.itemIndex });
		}
		catch (cause) {
			this.report({ code: 'plugin:twitch/title-unavailable', message: 'The Twitch title lookup failed', cause });
		}
	}

	/** Tells the viewer and listeners, so a gone channel never leaves a silent black screen. */
	private announceChannelGone({ channel, reason }: ChannelGone): void {
		const key = reason === 'offline' ? 'offline' : 'ended';

		// eslint-disable-next-line player/no-raw-player-bus -- display-message is the player's own message event, as in key-handler.
		this.player.emit('display-message', { text: this.t(`channel.${key}`, { channel }), ms: MESSAGE_MS });
		this.emit(`channel:${key}`, { channel });
	}

	/** Finds the clip's file and announces it. */
	private async resolveClipFile(slug: string): Promise<string> {
		const clip = await lookUpClip(slug, this.opts?.clientId, this.abortable().signal);

		if (!clip) {
			return this.throw({
				code: 'plugin:twitch/clip-unavailable',
				message: this.t('error.clip-unavailable', { slug }),
				context: { slug },
			});
		}

		this.emit('clip:resolved', { slug, title: clip.title, duration: clip.duration });

		return clip.url;
	}
}
