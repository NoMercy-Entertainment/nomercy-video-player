// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { BackendState, QualityLevel, SubtitleTrack } from '@nomercy-entertainment/nomercy-player-core';
import type { BackendEventPayload, IVideoBackend } from '@nomercy-entertainment/nomercy-video-player';
import { MediaElementBackend } from '@nomercy-entertainment/nomercy-player-core';
import { parseTwitchUrl } from './url';

const SDK_URL = 'https://player.twitch.tv/js/embed/v1.js';
const POLL_MS = 250;
const TOP_LAYER = '1000';
// The same speed the player's own control bars slide at.
const RESIZE_TRANSITION = 'top 0.25s ease, bottom 0.25s ease, right 0.25s ease';
const RAISE_SETTLE_MS = 500;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

type TwitchPlayerEvent = 'playing' | 'pause' | 'ended' | 'offline';
type BackendSignal = 'play' | 'playing' | 'pause' | 'ended' | 'timeupdate';

interface TwitchQuality {
	group: string;
	name: string;
	height: number;
	width: number;
	bitrate: number;
}

interface TwitchPlayerOptions {
	width: string;
	height: string;
	autoplay: boolean;
	muted: boolean;
	controls: boolean;
	parent: readonly string[];
	video?: string;
	time?: string;
	channel?: string;
}

interface TwitchPlayer {
	play: () => void;
	pause: () => void;
	seek: (seconds: number) => void;
	setVolume: (volume: number) => void;
	setMuted: (muted: boolean) => void;
	getCurrentTime: () => number;
	getDuration: () => number;
	getQuality: () => string;
	getQualities: () => TwitchQuality[];
	setQuality: (quality: string) => void;
	addEventListener: (event: TwitchPlayerEvent, handler: () => void) => void;
	enableCaptions: () => void;
	disableCaptions: () => void;
}

interface TwitchSdk {
	Player: {
		new (element: HTMLElement, options: TwitchPlayerOptions): TwitchPlayer;
		PLAYING: 'playing';
		PAUSE: 'pause';
		ENDED: 'ended';
		OFFLINE: 'offline';
	};
}

/** Why a live channel stopped being playable. */
export interface ChannelGone {
	channel: string;
	reason: 'offline' | 'stream-ended';
}

declare global {
	interface Window { Twitch?: TwitchSdk }
}

let sdkLoading: Promise<TwitchSdk> | undefined;

/** Loads Twitch's SDK once per page. */
function loadSdk(): Promise<TwitchSdk> {
	sdkLoading ??= new Promise<TwitchSdk>((resolve, reject) => {
		const script = document.createElement('script');
		script.src = SDK_URL;
		script.onload = () => window.Twitch ? resolve(window.Twitch) : reject(new Error('The Twitch SDK loaded without its player'));
		script.onerror = () => reject(new Error('The Twitch SDK failed to load'));
		document.head.appendChild(script);
	});

	return sdkLoading;
}

/** Twitch refuses to load unless every site framing it is named, so ancestors count too. */
function embeddingHosts(): string[] {
	// Firefox has no `ancestorOrigins`.
	const ancestors = Array.from(location.ancestorOrigins ?? [], origin => new URL(origin).hostname);

	return [...new Set([location.hostname, ...ancestors])];
}

/** Formats seconds as the `1h2m3s` form the SDK's `time` option expects. */
function clockParam(seconds: number): string {
	const whole = Math.floor(seconds);
	const hours = Math.floor(whole / SECONDS_PER_HOUR);
	const minutes = Math.floor(whole / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE;

	return `${hours}h${minutes}m${whole % SECONDS_PER_MINUTE}s`;
}

/** Plays VODs and live channels through Twitch's official SDK. */
export class TwitchEmbedBackend extends MediaElementBackend<HTMLVideoElement, BackendEventPayload> implements IVideoBackend {
	readonly kind = 'twitch' as const;

	private readonly mount: HTMLDivElement;
	private readonly container: HTMLElement;
	private readonly menuWatcher: MutationObserver;
	private readonly captionsLabel: () => string;
	private readonly onChannelGone: ((gone: ChannelGone) => void) | undefined;
	private channel: string | undefined;
	private hasPlayed = false;
	private chosenGroup: string | undefined;
	private reportedLevels = '';
	private reportedLevel = -1;
	private player: TwitchPlayer | undefined;
	private poller: number | undefined;
	private sliceStart = 0;
	private sliceLength = 0;
	private reportedDuration = 0;
	private loadedUrl = '';
	private wantedVolume = 1;
	private wantedMuted = false;
	private endedOnce = false;
	private loadAttempt = 0;
	private backendState: BackendState = 'idle';

	/** The element is a stand-in: the base class and the player want one, the picture lives in the iframe. */
	constructor(container: HTMLElement, onChannelGone?: (gone: ChannelGone) => void, captionsLabel: () => string = () => 'Enabled') {
		super(document.createElement('video'), true, 'video');
		this.onChannelGone = onChannelGone;
		this.captionsLabel = captionsLabel;
		this.element.style.display = 'none';
		this.mount = document.createElement('div');
		// The mouse passes through to the player's own controls, and a click cannot pull keyboard focus into the iframe.
		this.mount.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
		if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
			this.mount.style.transition = RESIZE_TRANSITION;
		this.mount.dataset.twitchEmbed = '';
		this.container = container;
		container.append(this.element, this.mount);
		this.menuWatcher = new MutationObserver(() => this.makeRoomForMenu());
		this.menuWatcher.observe(container, { attributes: true, attributeFilter: ['class'], subtree: true });
	}

	/** Twitch pauses when anything covers the embed, so it shrinks to sit between the visible control bars. */
	makeRoomForControls(controlsShown: boolean): void {
		this.mount.style.top = `${controlsShown ? this.barHeight('.top-bar') : 0}px`;
		this.mount.style.bottom = `${controlsShown ? this.barHeight('.bottom-bar') : 0}px`;
	}

	/** Starts a VOD or live channel link in a new embed, muted so autoplay is allowed. */
	async load(url: string): Promise<void> {
		const source = parseTwitchUrl(url);
		if (source?.type !== 'video' && source?.type !== 'channel')
			throw new Error(`The Twitch embed cannot play ${url}`);

		this.unload();
		this.sliceStart = source.type === 'video' && source.length > 0 ? source.start : 0;
		this.sliceLength = source.type === 'video' ? source.length : 0;
		this.endedOnce = false;
		this.reportedDuration = 0;
		this.loadedUrl = url;
		this.channel = source.type === 'channel' ? source.channel : undefined;
		this.hasPlayed = false;
		this.chosenGroup = undefined;
		this.reportedLevels = '';
		this.reportedLevel = -1;
		this.backendState = 'loading';
		this.raiseEmbed();

		const attempt = ++this.loadAttempt;
		const sdk = await loadSdk();
		if (attempt !== this.loadAttempt)
			return;

		const player = new sdk.Player(this.mount, {
			...(source.type === 'video' ? { video: source.video, time: clockParam(source.start) } : { channel: source.channel }),
			width: '100%',
			height: '100%',
			autoplay: true,
			muted: true,
			controls: false,
			parent: embeddingHosts(),
		});

		this.player = player;
		player.addEventListener(sdk.Player.PLAYING, () => this.onPlaying());
		player.addEventListener(sdk.Player.PAUSE, () => this.onPause());
		player.addEventListener(sdk.Player.ENDED, () => this.channel ? this.closeChannel() : this.finish());
		player.addEventListener(sdk.Player.OFFLINE, () => this.closeChannel());
		this.reportDuration();
		this.emit('subtitleTracks', { tracks: this.subtitleTracks() });
		this.poller = window.setInterval(() => this.tick(), POLL_MS);
	}

	/** Removes the embed and stops polling it. */
	unload(): void {
		window.clearInterval(this.poller);
		this.player = undefined;
		this.mount.replaceChildren();
		this.backendState = 'idle';
	}

	/** Removes everything this backend added to the page. */
	dispose(): void {
		this.unload();
		this.menuWatcher.disconnect();
		this.mount.remove();
		this.element.remove();
	}

	/** Puts the embed on top first, because Twitch refuses to play while it reads as covered. */
	override async play(): Promise<void> {
		this.raiseEmbed();
		await new Promise<void>(resolve => window.setTimeout(resolve, RAISE_SETTLE_MS));
		this.player?.play();
	}

	/** Pauses and lowers the embed so the player's controls can show. */
	override pause(): void {
		this.player?.pause();
		this.mount.style.zIndex = '';
	}

	/** Pauses and removes the embed. */
	override stop(): void {
		this.player?.pause();
		this.unload();
	}

	/** Reads or sets the position. Inside a slice it is relative to the start of the slice. */
	override currentTime(): number;
	override currentTime(seconds: number): void;
	override currentTime(seconds?: number): number | void {
		if (seconds === undefined)
			return Math.max(0, (this.player?.getCurrentTime() ?? this.sliceStart) - this.sliceStart);

		this.player?.seek(this.sliceStart + seconds);
		this.endedOnce = false;
	}

	/** Length of the slice, or of the whole VOD. */
	override duration(): number {
		return this.sliceLength || (this.player?.getDuration() ?? 0);
	}

	/** Reads or sets the volume on the 0 to 1 scale. */
	override volume(): number;
	override volume(value: number): void;
	override volume(value?: number): number | void {
		if (value === undefined)
			return this.wantedVolume;

		this.wantedVolume = value;
		this.applyVolume();
	}

	/** Mutes the embed. */
	override mute(): void {
		this.wantedMuted = true;
		this.applyVolume();
	}

	/** Unmutes the embed. */
	override unmute(): void {
		this.wantedMuted = false;
		this.applyVolume();
	}

	/** Current lifecycle state. */
	state(): BackendState {
		return this.backendState;
	}

	/** The SDK has no buffer reading, so the position stands in. */
	buffered(): number { return this.currentTime(); }
	/** Width of the embed on the page. */
	videoWidth(): number { return this.mount.clientWidth; }
	/** Height of the embed on the page. */
	videoHeight(): number { return this.mount.clientHeight; }
	/** The SDK exposes no audio tracks. */
	audioTracks(): [] { return []; }
	/** The SDK exposes no audio tracks. */
	setAudioTrack(): void {}
	/** Twitch draws its own captions inside the embed and never lists them, so one on/off track stands for them. */
	subtitleTracks(): SubtitleTrack[] {
		return this.player
			? [{ id: 'twitch-captions', label: this.captionsLabel(), kind: 'captions', url: '', default: false }]
			: [];
	}

	/** Any track means captions on, because the embed has only the one. */
	setSubtitleTrack(index: number | null): void {
		if (index === null || index < 0)
			this.player?.disableCaptions();
		else
			this.player?.enableCaptions();
	}

	/** The renditions Twitch offers, tallest first. */
	qualityLevels(): QualityLevel[] {
		return this.renditions().map(({ name, height, width, bitrate }, index) => ({ index, label: name, height, width, bitrate }));
	}

	/** Holds one rendition. `auto` means the highest, because Twitch's own auto drops to a blurry one. */
	setQuality(level: number | 'auto'): void {
		this.chosenGroup = level === 'auto' ? undefined : this.renditions()[level]?.group;
	}

	/** Index of the rendition playing now, or -1 before Twitch reports one. */
	currentLevel(): number {
		const playing = this.player?.getQuality();

		return this.renditions().findIndex(rendition => rendition.group === playing);
	}

	/** The SDK reports no output protection. */
	outputProtectionState(): 'unsupported' { return 'unsupported'; }

	/** The menu must not cover the embed, and the embed must not cover the menu, so they sit side by side. */
	private makeRoomForMenu(): void {
		const menu = this.container.querySelector('.menu-frame.open');
		const width = menu ? this.container.getBoundingClientRect().right - menu.getBoundingClientRect().left : 0;

		this.mount.style.right = `${width}px`;
	}

	private barHeight(selector: string): number {
		return this.container.querySelector<HTMLElement>(selector)?.offsetHeight ?? 0;
	}

	// Squared like the html5 backend, so one slider position is equally loud on both.
	private applyVolume(): void {
		this.player?.setVolume(this.wantedVolume ** 2);
		this.player?.setMuted(this.wantedMuted);
	}

	// Twitch plays only while nothing covers the iframe, so it stays above the player's UI until a real pause.
	// The SDK also reports PAUSE during a seek; lowering then would make Twitch refuse to continue.
	private raiseEmbed(): void {
		this.mount.style.zIndex = TOP_LAYER;
	}

	// Twitch's own offline card would cover the player, so the embed goes before the item ends.
	private closeChannel(): void {
		if (!this.channel || this.endedOnce)
			return;

		this.endedOnce = true;
		this.onChannelGone?.({ channel: this.channel, reason: this.hasPlayed ? 'stream-ended' : 'offline' });
		this.unload();
		this.signal('ended');
	}

	private onPlaying(): void {
		this.hasPlayed = true;
		this.applyVolume();
		this.backendState = 'playing';
		this.signal('play');
		this.signal('playing');
	}

	private onPause(): void {
		this.backendState = 'paused';
		this.signal('pause');
	}

	// Twitch's list has an `auto` entry with no height, which is not a rendition.
	private renditions(): TwitchQuality[] {
		return (this.player?.getQualities() ?? [])
			.filter(quality => quality.height > 0)
			.sort((first, second) => second.height - first.height || second.bitrate - first.bitrate);
	}

	// Twitch's auto mode drops to a blurry rendition, so the wanted one is requested again whenever it slips.
	private holdQuality(): void {
		const wanted = this.chosenGroup ?? this.renditions()[0]?.group;

		if (wanted && this.player?.getQuality() !== wanted)
			this.player?.setQuality(wanted);
	}

	// The list arrives some time after the embed starts, so the menu is told when it appears or changes.
	private reportQuality(): void {
		const levels = this.qualityLevels();
		const signature = levels.map(level => level.label).join();
		if (signature !== this.reportedLevels) {
			this.reportedLevels = signature;
			this.emit('levels', { levels });
		}

		const level = this.currentLevel();
		if (level >= 0 && level !== this.reportedLevel) {
			this.reportedLevel = level;
			this.emit('level-switched', { level });
		}
	}

	// The player learns a length only from `loadedmetadata`, and the SDK knows it only after the embed has started.
	private reportDuration(): void {
		const duration = this.duration();
		if (duration === this.reportedDuration)
			return;

		this.reportedDuration = duration;
		this.emit('loadedmetadata', { url: this.loadedUrl, kind: this.kind, duration });
	}

	private tick(): void {
		this.holdQuality();
		this.reportQuality();
		this.reportDuration();
		this.signal('timeupdate');

		if (this.sliceLength > 0 && this.currentTime() >= this.sliceLength)
			this.finish();
	}

	private finish(): void {
		if (this.endedOnce)
			return;

		this.endedOnce = true;
		this.player?.pause();
		this.backendState = 'idle';
		this.signal('ended');
	}

	private signal(name: BackendSignal): void {
		this.emit(name, new Event(name));
	}
}
