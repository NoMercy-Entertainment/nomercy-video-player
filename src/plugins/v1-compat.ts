// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { ActionOptions, LoadOptions, PluginCtorWithId, Translations } from '@nomercy-entertainment/nomercy-player-core';
import type { NMVideoPlayer } from '../index';
import type { Stretching, VideoPlayerConfig, VideoPlaylistItem } from '../types';
import { NotImplementedError, Plugin, SetupState } from '@nomercy-entertainment/nomercy-player-core';
import { PlayState, VolumeState } from '../types';

interface V1SkipSegment {
	type: string;
	start: number;
	end: number;
}

interface V1SeasonSummary {
	season: number;
	episodes: number;
	seasonName?: string;
}

interface V1LegacyTrack {
	kind?: string;
	file?: string;
	label?: string;
	language?: string;
	type?: string;
}

interface V1TranslationEntry {
	key: string;
	value: string;
}

interface ItemWithTracks {
	tracks?: ReadonlyArray<V1LegacyTrack>;
}

function hasTracksField(value: unknown): value is ItemWithTracks {
	return typeof value === 'object' && value !== null && 'tracks' in value;
}

function isTranslationEntryList(value: Translations | ReadonlyArray<V1TranslationEntry>): value is ReadonlyArray<V1TranslationEntry> {
	return Array.isArray(value);
}

function snakeToCamel(value: string): string {
	return value.replace(/_([a-z0-9])/giu, (...groups: string[]) => (groups[1] ?? '').toUpperCase());
}

function spaceToCamel(value: string): string {
	return value.replace(/[ -]([a-z0-9])/giu, (...groups: string[]) => (groups[1] ?? '').toUpperCase());
}

declare module '@nomercy-entertainment/nomercy-video-player' {
	interface NMVideoPlayer<T extends VideoPlaylistItem = VideoPlaylistItem> {
		/** @deprecated v1 shim — no v2 equivalent. Gates `enterFullscreen()` only; `fullscreen()` itself is never gated. */
		allowFullscreen: boolean;
		/** @deprecated v1 shim — use `playState()`. */
		readonly isPlaying: boolean;
		/** @deprecated v1 shim — `cycleAspectRatio()` cycles this fixed order internally; no public v2 accessor. */
		stretchOptions: Stretching[];

		/** @deprecated v1 shim — use `time(seconds)`. */
		seek(seconds: number, opts?: ActionOptions): number;

		/** @deprecated v1 shim — use `playbackRate()`. */
		speed(): number;
		/** @deprecated v1 shim — use `playbackRate(rate)`. */
		speed(rate: number): void;
		/** @deprecated v1 shim — use `playbackRates()`. */
		speeds(): number[];
		/** @deprecated v1 shim — derive from `playbackRates().length > 1`. */
		hasSpeeds(): boolean;

		/** @deprecated v1 shim — use `volumeState() === VolumeState.MUTED`. */
		muted(): boolean;
		/** @deprecated v1 shim — use `mute()` / `unmute()`. */
		muted(state: boolean): void;
		/** @deprecated v1 shim — no v2 equivalent. Reads the applied `videoElement.volume`. */
		gain(): number;

		/** @deprecated v1 shim — use `fullscreen(true)`. */
		enterFullscreen(): void;
		/** @deprecated v1 shim — use `fullscreen(false)`. */
		exitFullscreen(): void;
		/** @deprecated v1 shim — no v2 equivalent. */
		setAllowFullscreen(allowed: boolean): void;

		/** @deprecated v1 shim — use `aspectRatio()`. */
		aspect(): Stretching;
		/** @deprecated v1 shim — use `aspectRatio(value)`. */
		aspect(value: Stretching): void;
		/** @deprecated v1 shim — use `aspectRatio(value)`. */
		setAspect(value: Stretching): void;

		/** @deprecated v1 shim — no-op. v2 tracks size via `ResizeObserver` automatically. */
		resize(): void;
		/** @deprecated v1 shim — read `container.clientWidth`. */
		width(): number;
		/** @deprecated v1 shim — read `container.clientHeight`. */
		height(): number;
		/** @deprecated v1 shim — use `container`. */
		element(): HTMLElement;
		/** @deprecated v1 shim — use `playState()`. */
		state(): string;

		/** @deprecated v1 shim — use `time()`. */
		currentTime(): number;
		/** @deprecated v1 shim — use `time(seconds)`. */
		currentTime(seconds: number, opts?: ActionOptions): void;
		/** @deprecated v1 shim — read `videoElement.currentSrc` / `videoElement.src`. */
		currentSrc(): string;

		/** @deprecated v1 shim — derive from `platform().pip`. */
		hasPIP(): boolean;
		/** @deprecated v1 shim — use `pip(active)`. */
		setFloatingPlayer(active: boolean): void;

		/** @deprecated v1 shim — use `subtitle()?.index`. */
		subtitleIndex(): number;
		/** @deprecated v1 shim — search `subtitles()` by `language`. */
		subtitleIndexBy(language: string): number;
		/** @deprecated v1 shim — derive from `subtitles().length > 0`. */
		hasSubtitles(): boolean;
		/** @deprecated v1 shim — no v2 equivalent. Add the track to the playlist item's `tracks` field instead. */
		subtitleFile(url: string, opts?: { language?: string; label?: string }): Promise<void>;

		/** @deprecated v1 shim — use `audioTrack()?.index`. */
		audioTrackIndex(): number;
		/** @deprecated v1 shim — derive from `audioTracks().length > 0`. */
		hasAudioTracks(): boolean;
		/** @deprecated v1 shim — search `audioTracks()` by `language`. */
		audioTrackIndexByLanguage(language: string): number;

		/** @deprecated v1 shim — derive from `qualityLevels().length > 0`. */
		hasQualities(): boolean;

		/** @deprecated v1 shim — no v2 equivalent. Add the chapters to the playlist item's `chapters` field instead. */
		chapterFile(url: string): Promise<void>;
		/** @deprecated v1 shim — use `chapter()?.title` / `chapters()[idx]?.title`. */
		chapterText(idx?: number): string;

		/** @deprecated v1 shim — no v2 data model for skip segments yet. Always empty. */
		skippers(): ReadonlyArray<V1SkipSegment>;
		/** @deprecated v1 shim — no v2 equivalent. Call `time(seconds)` at the boundary directly. */
		skip(): void;
		/** @deprecated v1 shim — no v2 equivalent. Fetch the file yourself and call `time(seconds)` at the boundaries. */
		skipFile(url: string): Promise<void>;

		/** @deprecated v1 shim — use `queue()`. */
		playlist(): ReadonlyArray<T>;
		/** @deprecated v1 shim — use `queue(items, opts)`. */
		playlist(items: T[], opts?: ActionOptions): void;
		/** @deprecated v1 shim — use `item()`. */
		playlistItem(): T | Record<string, never>;
		/** @deprecated v1 shim — use `index()`. */
		playlistIndex(): number;
		/** @deprecated v1 shim — use `item(target, { autoplay: true })`. */
		playVideo(target: T | string | number, opts?: LoadOptions): void;
		/** @deprecated v1 shim — use `queue(items, opts)`. */
		setPlaylist(items: T[], opts?: ActionOptions): void;
		/** @deprecated v1 shim — find the index in `queue()` and call `item(index)`. */
		setEpisode(season: number, episode: number, opts?: LoadOptions): void;
		/** @deprecated v1 shim — derive from `index() === 0`. */
		isFirstPlaylistItem(): boolean;
		/** @deprecated v1 shim — derive from `index() === queueLength() - 1`. */
		isLastPlaylistItem(): boolean;
		/** @deprecated v1 shim — derive from `queueLength() > 1`. */
		hasPlaylists(): boolean;
		/** @deprecated v1 shim — no v2 equivalent. Group `queue()` by the item's `season` field. */
		seasons(): ReadonlyArray<V1SeasonSummary>;
		/** @deprecated v1 shim — no v2 equivalent. Read the item's raw `tracks` field. */
		tracks(kind?: string): ReadonlyArray<V1LegacyTrack>;

		/** @deprecated v1 shim — emit `'display-message'` / `'remove-message'` directly. */
		displayMessage(text: string, ms?: number): void;
		/** @deprecated v1 shim — no v2 equivalent. Pure string utility. */
		snakeToCamel(value: string): string;
		/** @deprecated v1 shim — no v2 equivalent. Pure string utility. */
		spaceToCamel(value: string): string;
		/** @deprecated v1 shim — no v2 equivalent. Pure DOM utility. */
		doubleTap(el: HTMLElement, callback: () => void, thresholdMs?: number): void;
		/** @deprecated v1 shim — no v2 equivalent. Pure DOM utility. */
		appendScriptFilesToDocument(urls: ReadonlyArray<string>): Promise<void>;

		/** @deprecated v1 shim — use `t(key, vars)`. */
		localize(key: string, vars?: Record<string, string>): string;
		/** @deprecated v1 shim — use `translation(language(), key, value)`. */
		addTranslation(key: string, value: string): void;
		/** @deprecated v1 shim — no v2 equivalent. Writes `document.title` directly. */
		setTitle(title: string): void;

		/** @deprecated v1 shim — use `load({ id, url })`. */
		loadSource(url: string, opts?: LoadOptions): Promise<void>;
		/** @deprecated v1 shim — use `addPlugin(PluginClass, opts)`. */
		registerPlugin<P extends Plugin<any, any, any>>(PluginClass: PluginCtorWithId & (new () => P), opts?: P['opts']): NMVideoPlayer<T>;
		/** @deprecated v1 shim — use `addPlugin(PluginClass, opts)`. */
		usePlugin<P extends Plugin<any, any, any>>(PluginClass: PluginCtorWithId & (new () => P), opts?: P['opts']): NMVideoPlayer<T>;
		/** @deprecated v1 shim — use `getPluginById(id)`. */
		plugin<P extends object = object>(id: string): P | undefined;
	}
}

/**
 * Legacy API-surface shim for `nomercy-video-player` v1 consumers migrating to
 * v2. Attaches the old method names onto the player instance; every shim
 * delegates to the real v2 API and logs one deprecation line per call.
 *
 * Opt-in only — add via `player.addPlugin(V1VideoCompatPlugin)` before
 * `setup()`. Nothing here changes v2 behaviour for consumers that don't load
 * it. Delete this file (and its one export line in `src/index.ts`) once every
 * v1 consumer has migrated.
 */
export class V1VideoCompatPlugin extends Plugin<NMVideoPlayer> {
	static override readonly id: string = 'v1-video-compat';
	static override readonly version: string = '1.0.0';
	static override readonly description: string = 'Attaches the legacy v1 method surface onto the v2 player. Every shim delegates to the current API and logs a deprecation warning.';

	private _warn(method: string): void {
		this.logger.warn(`@deprecated player.${method}() is a v1 compatibility shim — migrate to the v2 API before it is removed.`);
	}

	override use(): void {
		this._installSetupShim();
		this._installTransportShims();
		this._installDisplayShims();
		this._installTrackShims();
		this._installSkipperShims();
		this._installPlaylistShims();
		this._installUtilityShims();
		this._installTranslationShims();
		this._installLifecycleShims();
		this._installEventBridges();
	}

	/**
	 * v1 allowed a second `setup({ playlist, autoPlay })` call to swap sources
	 * on a live player. v2's `setup()` guards against re-entry and throws.
	 * Once the player is past `NOT_SETUP`, a repeat call queues the incoming
	 * playlist and autoplays it instead of re-running the setup pipeline.
	 */
	private _installSetupShim(): void {
		const player = this.player;
		const warn = this._warn.bind(this);
		const originalSetup = player.setup.bind(player);

		player.setup = (config: VideoPlayerConfig<VideoPlaylistItem>): NMVideoPlayer<VideoPlaylistItem> => {
			if (player.setupState() === SetupState.NOT_SETUP) {
				return originalSetup(config);
			}

			warn('setup');

			if (Array.isArray(config.playlist)) {
				player.queue(config.playlist);
			}

			if (config.muted !== undefined) {
				if (config.muted)
					void player.mute();
				else void player.unmute();
			}

			if (config.autoPlay && player.queueLength() > 0) {
				player.item(0, { autoplay: true });
			}

			return player;
		};
	}

	private _installTransportShims(): void {
		const player = this.player;
		const warn = this._warn.bind(this);

		player.seek = (seconds: number, opts?: ActionOptions): number => {
			warn('seek');
			const duration = player.duration();
			const clamped = Number.isFinite(duration) && duration > 0
				? Math.max(0, Math.min(duration, seconds))
				: seconds;
			void player.time(clamped, opts);
			return clamped;
		};

		function speed(): number;
		function speed(rate: number): void;
		function speed(rate?: number): number | void {
			warn('speed');
			if (rate === undefined)
				return player.playbackRate();
			void player.playbackRate(rate);
		}
		player.speed = speed;

		player.speeds = (): number[] => {
			warn('speeds');
			return player.playbackRates();
		};

		player.hasSpeeds = (): boolean => {
			warn('hasSpeeds');
			return player.playbackRates().length > 1;
		};

		function muted(): boolean;
		function muted(state: boolean): void;
		function muted(state?: boolean): boolean | void {
			warn('muted');
			if (state === undefined)
				return player.volumeState() === VolumeState.MUTED;
			if (state)
				void player.mute();
			else void player.unmute();
		}
		player.muted = muted;

		player.gain = (): number => {
			warn('gain');
			return player.videoElement?.volume ?? 0;
		};

		Object.defineProperty(player, 'isPlaying', {
			configurable: true,
			enumerable: true,
			get: (): boolean => player.playState() === PlayState.PLAYING,
		});
	}

	private _installDisplayShims(): void {
		const player = this.player;
		const warn = this._warn.bind(this);

		player.allowFullscreen = true;

		player.setAllowFullscreen = (allowed: boolean): void => {
			warn('setAllowFullscreen');
			player.allowFullscreen = allowed;
		};

		player.enterFullscreen = (): void => {
			warn('enterFullscreen');
			if (player.allowFullscreen === false)
				return;
			player.fullscreen(true);
		};

		player.exitFullscreen = (): void => {
			warn('exitFullscreen');
			player.fullscreen(false);
		};

		player.stretchOptions = ['uniform', 'fill', 'exactfit', 'none'];

		function aspect(): Stretching;
		function aspect(value: Stretching): void;
		function aspect(value?: Stretching): Stretching | void {
			warn('aspect');
			if (value === undefined)
				return player.aspectRatio();
			player.aspectRatio(value);
		}
		player.aspect = aspect;

		player.setAspect = (value: Stretching): void => {
			warn('setAspect');
			player.aspectRatio(value);
		};

		player.resize = (): void => {
			warn('resize');
			player.videoRect();
		};

		player.width = (): number => {
			warn('width');
			return player.container.clientWidth;
		};

		player.height = (): number => {
			warn('height');
			return player.container.clientHeight;
		};

		player.element = (): HTMLElement => {
			warn('element');
			return player.container;
		};

		player.state = (): string => {
			warn('state');
			return player.playState();
		};

		function currentTime(): number;
		function currentTime(seconds: number, opts?: ActionOptions): void;
		function currentTime(seconds?: number, opts?: ActionOptions): number | void {
			warn('currentTime');
			if (seconds === undefined)
				return player.time();
			void player.time(seconds, opts);
		}
		player.currentTime = currentTime;

		player.currentSrc = (): string => {
			warn('currentSrc');
			return player.videoElement?.currentSrc || player.videoElement?.src || '';
		};

		player.hasPIP = (): boolean => {
			warn('hasPIP');
			return player.platform().pip?.isSupported() ?? false;
		};

		player.setFloatingPlayer = (active: boolean): void => {
			warn('setFloatingPlayer');
			player.pip(active);
		};
	}

	private _installTrackShims(): void {
		const player = this.player;
		const warn = this._warn.bind(this);

		player.subtitleIndex = (): number => {
			warn('subtitleIndex');
			return player.subtitle()?.index ?? -1;
		};

		player.subtitleIndexBy = (language: string): number => {
			warn('subtitleIndexBy');
			return player.subtitles().findIndex(track => track.language === language);
		};

		player.hasSubtitles = (): boolean => {
			warn('hasSubtitles');
			return player.subtitles().length > 0;
		};

		player.subtitleFile = async (url: string): Promise<void> => {
			warn('subtitleFile');
			throw new NotImplementedError(
				`Dynamic sidecar subtitle loading has no v2 API. Add "${url}" to the playlist item's tracks field instead.`,
				'v1/subtitleFile',
			);
		};

		player.audioTrackIndex = (): number => {
			warn('audioTrackIndex');
			return player.audioTrack()?.index ?? -1;
		};

		player.hasAudioTracks = (): boolean => {
			warn('hasAudioTracks');
			return player.audioTracks().length > 0;
		};

		player.audioTrackIndexByLanguage = (language: string): number => {
			warn('audioTrackIndexByLanguage');
			return player.audioTracks().findIndex(track => track.language === language);
		};

		player.hasQualities = (): boolean => {
			warn('hasQualities');
			return player.qualityLevels().length > 0;
		};

		player.chapterFile = async (url: string): Promise<void> => {
			warn('chapterFile');
			throw new NotImplementedError(
				`Dynamic chapter-file ingestion has no v2 API. Add "${url}" to the playlist item's chapters field instead.`,
				'v1/chapterFile',
			);
		};

		player.chapterText = (idx?: number): string => {
			warn('chapterText');
			if (idx === undefined)
				return player.chapter()?.title ?? '';
			return player.chapters()[idx]?.title ?? '';
		};
	}

	private _installSkipperShims(): void {
		const player = this.player;
		const warn = this._warn.bind(this);

		player.skippers = (): ReadonlyArray<V1SkipSegment> => {
			warn('skippers');
			return [];
		};

		player.skip = (): void => {
			warn('skip');
			throw new NotImplementedError(
				'Skip-segment playback has no v2 data model yet. Track intro/outro bounds separately and call time(seconds) directly.',
				'v1/skip',
			);
		};

		player.skipFile = async (url: string): Promise<void> => {
			warn('skipFile');
			throw new NotImplementedError(
				`Skip-segment ingestion has no v2 API. Fetch "${url}" yourself and call time(seconds) at the boundaries.`,
				'v1/skipFile',
			);
		};
	}

	private _installPlaylistShims(): void {
		const player = this.player;
		const warn = this._warn.bind(this);
		const originalLoad = player.load.bind(player);

		function playlist(): ReadonlyArray<VideoPlaylistItem>;
		function playlist(items: VideoPlaylistItem[], opts?: ActionOptions): void;
		function playlist(items?: VideoPlaylistItem[], opts?: ActionOptions): ReadonlyArray<VideoPlaylistItem> | void {
			warn('playlist');
			if (items === undefined)
				return player.queue();
			player.queue(items, opts);
		}
		player.playlist = playlist;

		player.playlistItem = (): VideoPlaylistItem | Record<string, never> => {
			warn('playlistItem');
			return player.item() ?? {};
		};

		player.playlistIndex = (): number => {
			warn('playlistIndex');
			return player.index();
		};

		player.playVideo = (target: VideoPlaylistItem | string | number, opts?: LoadOptions): void => {
			warn('playVideo');
			player.item(target, { ...opts, autoplay: true });
		};

		function load(items: VideoPlaylistItem[]): void;
		function load(item: VideoPlaylistItem, opts?: LoadOptions): Promise<void>;
		function load(itemsOrItem: VideoPlaylistItem[] | VideoPlaylistItem, opts?: LoadOptions): void | Promise<void> {
			warn('load');
			if (Array.isArray(itemsOrItem)) {
				player.queue(itemsOrItem);
				return;
			}
			return originalLoad(itemsOrItem, opts);
		}
		player.load = load;

		player.setPlaylist = (items: VideoPlaylistItem[], opts?: ActionOptions): void => {
			warn('setPlaylist');
			player.queue(items, opts);
		};

		player.setEpisode = (season: number, episode: number, opts?: LoadOptions): void => {
			warn('setEpisode');
			const index = player.queue().findIndex(item => item.season === season && item.episode === episode);
			if (index === -1)
				return;
			player.item(index, opts);
		};

		player.isFirstPlaylistItem = (): boolean => {
			warn('isFirstPlaylistItem');
			return player.index() === 0;
		};

		player.isLastPlaylistItem = (): boolean => {
			warn('isLastPlaylistItem');
			return player.index() === player.queueLength() - 1;
		};

		player.hasPlaylists = (): boolean => {
			warn('hasPlaylists');
			return player.queueLength() > 1;
		};

		player.seasons = (): ReadonlyArray<V1SeasonSummary> => {
			warn('seasons');
			const counts = new Map<number, V1SeasonSummary>();
			for (const item of player.queue()) {
				if (typeof item.season !== 'number')
					continue;
				const existing = counts.get(item.season);
				if (existing) {
					existing.episodes += 1;
					continue;
				}
				counts.set(item.season, { season: item.season, episodes: 1, seasonName: item.seasonName });
			}
			return Array.from(counts.values());
		};

		player.tracks = (kind?: string): ReadonlyArray<V1LegacyTrack> => {
			warn('tracks');
			const current = player.item();
			if (!hasTracksField(current))
				return [];
			const list = current.tracks ?? [];
			return kind ? list.filter(entry => entry.kind === kind) : list;
		};
	}

	private _installUtilityShims(): void {
		const player = this.player;
		const warn = this._warn.bind(this);

		player.displayMessage = (text: string, ms?: number): void => {
			warn('displayMessage');
			const displayEvent: string = 'display-message';
			player.emit(displayEvent, text);
			if (ms !== undefined) {
				this.timeout(() => {
					const removeEvent: string = 'remove-message';
					player.emit(removeEvent, text);
				}, ms);
			}
		};

		player.snakeToCamel = (value: string): string => {
			warn('snakeToCamel');
			return snakeToCamel(value);
		};

		player.spaceToCamel = (value: string): string => {
			warn('spaceToCamel');
			return spaceToCamel(value);
		};

		player.doubleTap = (el: HTMLElement, callback: () => void, thresholdMs = 300): void => {
			warn('doubleTap');
			let lastTap = 0;
			this.listen(el, 'click', () => {
				const now = Date.now();
				if (now - lastTap < thresholdMs)
					callback();
				lastTap = now;
			});
		};

		player.appendScriptFilesToDocument = async (urls: ReadonlyArray<string>): Promise<void> => {
			warn('appendScriptFilesToDocument');
			for (const url of urls) {
				await new Promise<void>((resolve, reject) => {
					const script = document.createElement('script');
					script.src = url;
					script.onload = (): void => resolve();
					script.onerror = (): void => reject(new Error(`Failed to load script: ${url}`));
					document.head.appendChild(script);
				});
			}
		};
	}

	private _installTranslationShims(): void {
		const player = this.player;
		const warn = this._warn.bind(this);
		const originalAddTranslations = player.addTranslations.bind(player);

		player.localize = (key: string, vars?: Record<string, string>): string => {
			warn('localize');
			return player.t(key, vars);
		};

		player.addTranslation = (key: string, value: string): void => {
			warn('addTranslation');
			player.translation(player.language(), key, value);
		};

		function addTranslations(bundle: Translations): void;
		function addTranslations(entries: ReadonlyArray<V1TranslationEntry>): void;
		function addTranslations(bundleOrEntries: Translations | ReadonlyArray<V1TranslationEntry>): void {
			warn('addTranslations');
			if (isTranslationEntryList(bundleOrEntries)) {
				const lang = player.language();
				for (const entry of bundleOrEntries) {
					player.translation(lang, entry.key, entry.value);
				}
				return;
			}
			originalAddTranslations(bundleOrEntries);
		}
		player.addTranslations = addTranslations;

		player.setTitle = (title: string): void => {
			warn('setTitle');
			if (typeof document !== 'undefined') {
				document.title = title;
			}
		};
	}

	private _installLifecycleShims(): void {
		const player = this.player;
		const warn = this._warn.bind(this);

		player.loadSource = (url: string, opts?: LoadOptions): Promise<void> => {
			warn('loadSource');
			return player.load({ id: url, url }, opts);
		};

		player.registerPlugin = <P extends Plugin<any, any, any>>(PluginClass: PluginCtorWithId & (new () => P), opts?: P['opts']): NMVideoPlayer<VideoPlaylistItem> => {
			warn('registerPlugin');
			return player.addPlugin(PluginClass, opts);
		};

		player.usePlugin = <P extends Plugin<any, any, any>>(PluginClass: PluginCtorWithId & (new () => P), opts?: P['opts']): NMVideoPlayer<VideoPlaylistItem> => {
			warn('usePlugin');
			return player.addPlugin(PluginClass, opts);
		};

		player.plugin = <P extends object = object>(id: string): P | undefined => {
			warn('plugin');
			return player.getPluginById<P>(id);
		};
	}

	private _installEventBridges(): void {
		const player = this.player;

		this.on('playbackRate', (data) => { player.emit('speed', data); });
		this.on('queue', (items) => { player.emit('playlist', items); });
	}
}
