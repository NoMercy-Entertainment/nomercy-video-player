// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type {
	ActionOptions,
	AriaLiveLevel,
	AudioTrack,
	AuthConfig,
	BasePlaylistItem,
	BufferState,
	CanPlayResult,
	CastState,
	CastTarget,
	Chapter,
	CurrentAudioTrackSelection,
	CurrentQualitySelection,
	CurrentSubtitleSelection,
	DeviceCapabilities,
	ICueParser,
	IPlatform,
	IPlayer,
	IPreloadStrategy,
	IStreamFactory, IStreamSource,
	ITransitionStrategy,
	IUrlResolver,
	TimeState as KitTimeState,
	LoadOptions,
	NetworkState,
	PlaybackMetrics,
	PlayerExperimental,
	PlayerPhase,
	Plugin,
	PluginCtorWithId,
	QualityLevel,
	ResolvedUrl,
	SetupState,
	SidecarSubtitleInput,
	SubtitleCueChange,
	SubtitleStyle,
	SubtitleTrack,
	Translations,
	UrlCategory,
	VisibilityState,
} from '@nomercy-entertainment/nomercy-player-core';
import type { BackendEventPayload, IVideoBackend, VideoBackendKind } from './adapters/video-backend/IVideoBackend';
import type { SubtitleChoice } from './player/track-language-memory';
import type { AudioTrackState, IVideoPlayer, PlayState, QualityState, RepeatState, SegmentBoundaryPayload, SegmentOptions, ShuffleState, Stretching, VideoEventMap, VideoPlayerConfig, VideoPlaylistItem, VideoRect, VolumeState } from './types';
import {
	bridgeBackendPlayState,
	BrowserPolicyError,
	composeMixins,
	EventEmitter,
	GaplessTransitionStrategy,
	initPlayerCoreState,
	NotImplementedError,
	playerCoreMethods,
	resolvePlayerConstructor,
} from '@nomercy-entertainment/nomercy-player-core';
import { Html5VideoBackend } from './adapters/video-backend/html5';
import { readItemImage } from './player/itemImage';
import { normalizeVideoPlaylistItem } from './player/normalize-item';
import { VideoPreloadStrategy } from './player/preload';
import { pickStartItem } from './player/start-selection';
import { matchSubtitleTrack, SUBTITLES_OFF, TrackLanguageMemory } from './player/track-language-memory';
import { titleTokenTranslations } from './plugins/desktop-ui/i18n/token-bundle';
import { containedRect, FullscreenState, PipState, SubtitleState, TheaterState } from './types';

export type { IChapterSource } from './adapters/chapter-source/IChapterSource';
export { VttChapterSource } from './adapters/chapter-source/vtt-chapters';

export type { ISubtitleStyleStore } from './adapters/subtitle-style-store/ISubtitleStyleStore';
export { StorageBackedSubtitleStyleStore } from './adapters/subtitle-style-store/storage-backed';
export type { IThumbnailSource, ThumbnailFrame } from './adapters/thumbnail-source/IThumbnailSource';

export { VttSpriteThumbnailSource } from './adapters/thumbnail-source/vtt-sprite';
export { Html5VideoBackend } from './adapters/video-backend/html5';

// Adapter ports + default implementations.
export type {
	BackendEvent,
	BackendEventPayload,
	BackendLoaderState,
	BackendState,
	IVideoBackend,
	SubtitleCue,
	SubtitleCueChange,
	VideoBackendKind,
} from './adapters/video-backend/IVideoBackend';
export { VideoPreloadStrategy } from './player/preload';

// Plugins re-exported from the main barrel for ergonomic imports.
export { KeyHandlerPlugin } from './plugins/key-handler';
export { OctopusPlugin } from './plugins/octopus';
export { V1VideoCompatPlugin } from './plugins/v1-compat';

export type {
	AudioTrackRef,
	ChapterRef,
	FontTrackRef,
	HtmlPreloadMode,
	IVideoPlayer,
	SegmentBoundaryPayload,
	SegmentEndBehaviour,
	SegmentOptions,
	Stretching,
	SubtitleTrackRef,
	VideoBackendFactory,
	VideoEventMap,
	VideoPlayerConfig,
	VideoPlaylistItem,
	VideoRect,
	WatchProgress,
} from './types';

export { containedRect } from './types';

export {
	AudioTrackState,
	FullscreenState,
	PipState,
	PlayState,
	QualityState,
	RepeatState,
	ShuffleState,
	SubtitleState,
	TheaterState,
	VolumeState,
} from './types';

export type { QualityLevel } from './types';
export type { AudioTrack, Chapter, SidecarSubtitleInput, SubtitleTrack } from '@nomercy-entertainment/nomercy-player-core';

const _instances: Map<string, NMVideoPlayer<BasePlaylistItem>> = new Map();

/**
 * Match a target language tag against a list of candidate tags.
 * Returns the index of the first exact match; falls back to the first
 * prefix match (e.g. `'en'` matches `'en-US'`, or vice-versa).
 * Returns `-1` when no match is found.
 */
function _matchLanguage(candidates: Array<string | undefined>, target: string): number {
	const lower = target.toLowerCase();
	let prefixMatch = -1;
	for (let i = 0; i < candidates.length; i++) {
		const lang = candidates[i]?.toLowerCase();
		if (!lang)
			continue;
		if (lang === lower)
			return i;
		if (prefixMatch < 0 && (lang.startsWith(`${lower}-`) || lower.startsWith(`${lang}-`))) {
			prefixMatch = i;
		}
	}
	return prefixMatch;
}

/**
 * Headless video player. Plugin-driven, event-driven, no UI in core.
 *
 * Shared player logic (lifecycle, transport, queue, state, volume, time,
 * plugins, i18n, cue parsers, baseUrl, audioContext, experimental override
 * surface) is composed onto the prototype from `playerCoreMethods` exported by
 * `@nomercy-entertainment/nomercy-player-core` — the LOGIC lives there, not
 * here. NMVideoPlayer adds only:
 *
 *  - The per-library registry (own `_instances` Map)
 *  - The three-form factory constructor + the `videoElement` field
 *  - Library-typed method declarations (so consumers see `PlayState`, etc.,
 *    not the kit's internal string token — runtime impl comes from the mixin)
 *  - Video-specific stubs (fullscreen, pip, theater, subtitle toggles, etc.)
 */
export class NMVideoPlayer<T extends VideoPlaylistItem = VideoPlaylistItem>
	extends EventEmitter<VideoEventMap<T>>
	implements IPlayer<VideoEventMap<T>>, IVideoPlayer<T> {
	playerId: string = '';
	container!: HTMLElement;
	videoElement: HTMLVideoElement | undefined;

	get id(): string {
		return this.playerId;
	}

	/**
	 * Phantom brand — never assigned at runtime. Declared explicitly here so
	 * `PlayerEventMap<NMVideoPlayer<T>>` resolves to `VideoEventMap<T>` without
	 * TypeScript having to walk the `EventEmitter` inheritance chain (which
	 * stalls in conditional-type inference for complex class hierarchies).
	 */
	declare readonly __eventMap__: VideoEventMap<T>;

	declare options: VideoPlayerConfig<T>;

	// Kit-managed state fields — set by initPlayerCoreState, declared here
	// so class methods can access them without casts.
	private declare _phase: string;
	private declare _playState: string;
	/** Bumped only by `item(target)` navigations — distinguishes a real consumer preselection from the queue's default cursor. */
	declare _currentEpoch: number | undefined;

	// ── Type-only declarations for the methods composed in from the kit's
	// `playerCoreMethods`. The bodies live in the kit; these declarations let
	// consumers see the video-typed contract without runtime cost.

	declare setup: (config: VideoPlayerConfig<T>) => this;
	declare ready: () => Promise<void>;
	declare dispose: () => Promise<void>;
	declare setupState: () => SetupState;
	declare phase: () => PlayerPhase;
	declare dispatching: () => ReadonlyArray<string>;
	declare platform: () => IPlatform;

	declare baseUrl: {
		(): string | undefined;
		(url: string): void;
	};

	declare audioContext: () => AudioContext | undefined;
	declare experimental: PlayerExperimental;

	declare t: {
		(key: string, vars?: Record<string, string>): string;
		(PluginClass: PluginCtorWithId, key: string, vars?: Record<string, string>): string;
	};

	declare language: {
		(): string;
		(lang: string): Promise<void>;
	};

	declare addTranslations: (bundle: Translations) => void;
	declare registerTitleTokens: (tokens: Record<string, string>) => void;
	declare translation: {
		(lang: string, key: string): string | undefined;
		(lang: string, key: string, value: string): void;
	};

	declare removeTranslations: (prefix: string, lang?: string) => void;

	declare registerCueParser: (parser: ICueParser, prepend?: boolean) => void;
	declare unregisterCueParser: (id: string) => void;
	declare resolveCueParser: (url: string) => ICueParser | undefined;

	declare play: (opts?: ActionOptions) => Promise<void>;
	declare pause: (opts?: ActionOptions) => Promise<void>;
	declare stop: (opts?: ActionOptions) => Promise<void>;
	declare togglePlayback: (opts?: ActionOptions) => Promise<void>;
	declare next: (opts?: LoadOptions) => Promise<void>;
	declare previous: (opts?: LoadOptions) => Promise<void>;
	declare rewind: (seconds?: number, opts?: ActionOptions) => Promise<void>;
	declare forward: (seconds?: number, opts?: ActionOptions) => Promise<void>;
	declare restart: (opts?: ActionOptions) => Promise<void>;

	declare time: {
		(): number;
		(seconds: number, opts?: ActionOptions): Promise<void>;
	};

	declare duration: () => number;
	declare buffered: () => number;
	declare bufferedRanges: () => TimeRanges;
	declare seekable: () => TimeRanges;
	declare timeData: () => KitTimeState;
	/** Seek to a position expressed as a percentage (0–100) of total duration. */
	declare seekByPercentage: (pct: number, opts?: ActionOptions) => void;
	/** @internal */
	declare private _checkItemEndingSoon: (currentTime: number, duration: number) => void;
	/** @internal */
	declare private _timeStateAt: (position: number) => KitTimeState;
	/** @internal */
	declare private _mediaIsStale: (() => boolean) | undefined;

	declare playbackRate: {
		(): number;
		(rate: number): Promise<void>;
	};

	declare playbackRates: () => number[];

	declare volume: {
		(): number;
		(level: number): Promise<void>;
	};

	declare mute: () => Promise<void>;
	declare unmute: () => Promise<void>;
	declare toggleMute: () => void;
	declare volumeUp: (step?: number) => void;
	declare volumeDown: (step?: number) => void;

	declare bumpActivity: () => void;
	declare activityTracking: {
		(): boolean;
		(enabled: boolean): void;
	};

	declare playState: () => PlayState;
	declare volumeState: () => VolumeState;
	declare repeatState: {
		(): RepeatState;
		(state: RepeatState): Promise<void>;
	};

	declare shuffleState: {
		(): ShuffleState;
		(state: ShuffleState | boolean): Promise<void>;
	};

	declare queue: {
		(): ReadonlyArray<T>;
		(items: T[], opts?: ActionOptions): void;
	};

	declare queueAppend: (item: T | T[], opts?: ActionOptions) => void;
	declare queuePrepend: (item: T | T[], opts?: ActionOptions) => void;
	declare queueInsert: (item: T | T[], index: number, opts?: ActionOptions) => void;
	declare queueRemove: (id: string | number, opts?: ActionOptions) => void;
	declare queueRemoveAt: (index: number, opts?: ActionOptions) => void;
	declare queueMove: (from: number, to: number, opts?: ActionOptions) => void;
	declare queueClear: (opts?: ActionOptions) => void;
	declare queueShuffle: (opts?: ActionOptions) => void;
	declare queueSort: (compare: (itemA: T, itemB: T) => number, opts?: ActionOptions) => void;
	declare peekNext: () => T | undefined;
	declare peekPrevious: () => T | undefined;
	declare queueLength: () => number;
	declare queueIndexOf: (id: string | number) => number;

	declare item: {
		(): T | undefined;
		(target: T | string | number, opts?: LoadOptions): void;
	};

	declare index: () => number;
	declare seekToIndex: (position: number, opts?: ActionOptions) => void;

	declare playItem: (
		target: BasePlaylistItem | string | number | ((item: BasePlaylistItem) => boolean),
		opts?: LoadOptions,
	) => void;

	declare playNow: (
		items: BasePlaylistItem[],
		start?: BasePlaylistItem | string | number | ((item: BasePlaylistItem) => boolean),
		opts?: LoadOptions,
	) => void;

	declare backlog: {
		(): ReadonlyArray<T>;
		(items: T[]): void;
	};

	declare backlogAppend: (item: T | T[]) => void;
	declare backlogRemove: (id: string | number) => void;
	declare backlogClear: () => void;

	declare addPlugin: <P extends Plugin<any, any, any>>(PluginClass: PluginCtorWithId & (new () => P), opts?: P['opts']) => this;
	declare getPlugin: <P extends object>(PluginClass: PluginCtorWithId & (new () => P)) => P | undefined;
	declare getPluginById: <P extends object = object>(id: string) => P | undefined;
	declare removePlugin: <P extends Plugin<any, any, any>>(PluginClass: PluginCtorWithId & (new () => P)) => void;
	declare removePluginById: (id: string) => void;
	declare plugins: () => ReadonlyArray<Plugin>;
	declare enabledPlugins: () => ReadonlyArray<Plugin>;

	constructor(id?: string | number) {
		super();
		const resolved = resolvePlayerConstructor(id, _instances, 'NMVideoPlayer');
		if (resolved.kind === 'existing') {
			return resolved.instance as unknown as this; /* mixin return-override: TS cannot narrow constructor return through the mixin chain */
		}

		initPlayerCoreState(this, { className: 'NMVideoPlayer' });
		this.playerId = resolved.id;
		this.container = resolved.div;
		_instances.set(resolved.id, this as unknown as NMVideoPlayer<BasePlaylistItem> /* registry stores the base generic; concrete T is narrowed at retrieval */);

		this.registerTitleTokens({
			S: 'plugin.desktop-ui.token.season',
			E: 'plugin.desktop-ui.token.episode',
		});

		this.on('item', (data) => {
			const item = data?.item;
			this._applyPosterForRaw(readItemImage(item));
		});

		// Apply the incoming item's poster BEFORE backend.load() clears the
		// element src — this ensures the browser shows the new poster image
		// during the blank window between the old source being removed and the
		// first frame of the new source painting.
		this.on('beforeLoad', (event) => {
			const item: unknown = event?.data?.item;
			const raw = item ? readItemImage(item) : undefined;
			this._applyPosterForRaw(raw);
		});

		// Auto-advance on natural end — enabled by default, disabled when an
		// external orchestrator (Cast sync, WebSocket) drives next() instead.
		this.on('ended', () => {
			if (this.options?.autoAdvance === false)
				return;
			performance.mark('nm:auto-advance:ended');
			void this.next({ source: 'auto-advance' }).catch((err: unknown) => {
				this.options?.logger?.warn?.('[autoAdvance] next() failed on ended', err);
			});
		});

		// Auto-select default subtitle / audio language tracks once the
		// backend has populated its track lists (signalled by mediaReady).
		this.on('mediaReady', () => {
			this._applyDefaultTracks();
			this._emitVideoRect();
		});

		// Record the chosen LANGUAGE, not the index — an index means a different
		// language on the next file. Fires for the viewer's own pick and for the
		// selection _applyDefaultTracks restores, which write the same value.
		this.on('audioTrack', ({ id }) => {
			if (id === null)
				return;
			this.languageMemory.rememberAudio(this.audioTracks()[id]?.language);
		});

		this.on('subtitle', ({ track }) => {
			this.languageMemory.rememberSubtitle(
				track === null ? SUBTITLES_OFF : this.subtitles()[track],
			);
		});

		// Re-emit videoRect on signals that change the displayed content rect.
		this.on('duration', () => { this._emitVideoRect(); });
		this.on('fullscreen', () => { this._emitVideoRect(); });

		// Apply defaultQuality once after the first manifest parse. Guarded
		// so that interactive quality changes persist across item transitions.
		this.on('levels', () => {
			if (this._defaultQualityApplied)
				return;
			const quality = this.options?.defaultQuality;
			if (quality === undefined)
				return;
			this._defaultQualityApplied = true;
			try {
				this.quality(quality);
			}
			catch { /* backend may not be ready yet — ignore */ }
		});
	}

	private _languageMemoryInstance: TrackLanguageMemory | undefined;

	/**
	 * Carries the viewer's chosen audio / subtitle language across items. Built
	 * on first use — `options` is not assigned yet when fields initialise.
	 */
	private get languageMemory(): TrackLanguageMemory {
		this._languageMemoryInstance ??= new TrackLanguageMemory(this.options?.storage);
		return this._languageMemoryInstance;
	}

	private _wantedPoster: string | null = null;
	private _defaultQualityApplied = false;

	/**
	 * Resolve a raw image URL to an absolute poster string and apply it.
	 *
	 * Sync first — the poster MUST be on the `<video>` element before the
	 * backend starts loading the new source, otherwise the user sees a black
	 * frame between source-clear and first-frame-paint. We prepend
	 * `baseImageUrl` (when set) for relative URLs immediately, then kick off
	 * `resolveUrl(raw, 'poster')` to upgrade to whatever a custom resolver
	 * returns — only writing the async result if it actually differs from
	 * the sync guess (avoids a redundant attribute set + repaint flash).
	 */
	private _applyPosterForRaw(raw: string | undefined): void {
		if (!raw) {
			this._wantedPoster = null;
			this._applyPoster();
			return;
		}

		const isAbsolute = /^[a-z][a-z\d+\-.]*:/iu.test(raw);
		if (isAbsolute) {
			this._wantedPoster = raw;
			this._applyPoster();
			return;
		}

		// Sync best-effort against baseImageUrl so the poster is on the element
		// the same tick beforeLoad fires.
		const base = this.options?.baseImageUrl ?? '';
		const syncGuess = base ? base + raw : raw;
		this._wantedPoster = syncGuess;
		this._applyPoster();

		// Then upgrade async — only commit if a custom urlResolver returned
		// something different from the basePath concat.
		void this.resolveUrl(raw, 'poster').then((resolved) => {
			if (resolved.href === syncGuess)
				return;
			this._wantedPoster = resolved.href;
			this._applyPoster();
		});
	}

	private _applyPosterFromCurrentItem(): void {
		const item: unknown = this.item();
		const raw = readItemImage(item);
		this._applyPosterForRaw(raw);
	}

	private _applyPoster(): void {
		const queried = this.container?.querySelector?.('video');
		if (!(queried instanceof HTMLVideoElement))
			return;
		const el = queried;
		const want = this._wantedPoster;
		if (want)
			el.setAttribute('poster', want);
		else
			el.removeAttribute('poster');
	}

	/**
	 * Auto-select the default subtitle and audio tracks from config options
	 * `defaultSubtitleLanguage` / `defaultAudioLanguage`. Called once after
	 * `mediaReady` fires so the backend's track lists are populated.
	 *
	 * Language matching: exact tag first, then prefix (e.g. `'en'` matches
	 * `'en-US'`). No match leaves an UNSELECTED slot alone, but where a track is
	 * already selected the slot is handed to the stream's own default rendition
	 * instead. No warning either way.
	 */
	private _applyDefaultTracks(): void {
		const remembered = this.languageMemory.subtitleChoice();
		const wanted: SubtitleChoice | undefined = remembered
			?? (this.options?.defaultSubtitleLanguage
				? { language: this.options.defaultSubtitleLanguage }
				: undefined);
		if (wanted === SUBTITLES_OFF) {
			this.subtitle(-1);
		}
		else if (wanted) {
			let tracks: SubtitleTrack[] = [];
			try { tracks = this.subtitles(); }
			catch { /* not yet available */ }
			const matchIdx = matchSubtitleTrack(tracks, wanted, _matchLanguage);
			if (matchIdx >= 0) {
				this.subtitle(matchIdx);
			}
		}

		const audioLang = this.languageMemory.audioLanguage() ?? this.options?.defaultAudioLanguage;
		const selectedIdx = this.audioTrack()?.index ?? null;

		// Nothing to honour and no selection that could have gone stale — leave
		// the backend alone rather than reading its track list for no reason.
		if (!audioLang && selectedIdx === null)
			return;

		let audioTracks: AudioTrack[] = [];
		try { audioTracks = this.audioTracks(); }
		catch { /* not yet available */ }
		const matchIdx = audioLang
			? _matchLanguage(audioTracks.map(audioTrack => audioTrack.language), audioLang)
			: -1;

		// With no language to honour, fall back to whichever rendition the stream
		// marks default. The selected index survives an item change, so a stale
		// one left alone ticks the previous item's track in the menu while the
		// stream plays its own default.
		const targetIdx = matchIdx >= 0
			? matchIdx
			: audioTracks.findIndex(audioTrack => audioTrack.default === true);

		if (matchIdx >= 0) {
			if (selectedIdx !== matchIdx)
				this.audioTrack(matchIdx);
		}
		// Nothing to honour: only correct a selection that actually disagrees.
		// Re-asserting the track already playing costs a switch for no change.
		else if (targetIdx >= 0 && selectedIdx !== null && selectedIdx !== targetIdx) {
			this.audioTrack(targetIdx);
		}
	}

	/** Test-only: clear the registry. Not part of the public API. */
	static _resetRegistry(): void {
		_instances.clear();
	}

	// ── Stream registration ── composed in via `streamRegistrationMethods` mixin.
	declare registerStream: (factory: IStreamFactory, prepend?: boolean) => this;
	declare resolveCustomStream: (url: string, contentType?: string) => IStreamSource | undefined;
	declare unregisterStream: (id: string) => this;
	declare streams: () => ReadonlyArray<string>;
	declare getStreamFactory: (id: string) => IStreamFactory | undefined;

	// ── Backend ──
	private _backend: IVideoBackend | undefined;

	backend(): IVideoBackend;
	backend(kind: VideoBackendKind): Promise<void>;
	backend(kind?: VideoBackendKind): IVideoBackend | Promise<void> {
		if (kind === undefined) {
			if (this._backend)
				return this._backend;
			return this._createBackend('html5');
		}

		return Promise.resolve().then(() => {
			if (this._backend) {
				this._backend.dispose();
				this._backend = undefined;
			}
			this._createBackend(kind);
			this.emit('backend:changed', { kind });
		});
	}

	/**
	 * Construct + fully wire an `IVideoBackend` instance for `kind`, then store
	 * it as the active backend. Only `'html5'` has a built-in implementation —
	 * other kinds require `options.backendFactory` to supply one. Called
	 * lazily by the `backend()` getter on first access, and again by the
	 * `backend(kind)` setter after disposing the previous instance.
	 */
	private _createBackend(kind: VideoBackendKind): IVideoBackend {
		const factory = this.options?.backendFactory;
		if (!factory && kind !== 'html5') {
			throw new NotImplementedError(
				`No built-in video backend for kind '${kind}'. Supply options.backendFactory to provide one.`,
				'video-backend',
			);
		}
		const instance = factory
			? factory(kind, this.options)
			: new Html5VideoBackend(this.container);
		this._backend = instance;
		this.videoElement = instance.mediaElement();

		// Authenticated media servers need the Authorization header on every
		// hls.js manifest/segment request. The provider reads the auth config
		// lazily so getter-style tokens (Vue refs, stores) stay live.
		// Read per request rather than captured, so a consumer whose token or
		// rule changes mid-session is not answered from a stale closure.
		// Live config, not `options.auth`: setup seeds it and `player.auth()`
		// updates it, so a rule set after setup reaches media requests too.
		instance.setAuthHeaderProvider?.((url: string) =>
			this.auth()?.mediaAuthorization?.(url));

		// Without this the stream registry is seeded and never asked, so
		// `registerStream` records a factory that no load path consults. Only
		// consumer-registered factories are offered: HLS and progressive files
		// stay on the backend's own path exactly as before.
		instance.setStreamResolver?.((url: string, contentType?: string) =>
			this.resolveCustomStream?.(url, contentType));

		// Consumer's HDR-on-SDR policy, read once here rather than normalized
		// into `options` — `hdrDecision`'s own default ('play') applies at the
		// point of use when this was never pushed at all.
		instance.setHdrOnSdrFallback?.(this.options?.hdrOnSdr ?? 'play');

		// Mount the ResizeObserver that keeps videoRect() fresh. Done here so
		// the observer sees the real video element immediately after backend init.
		this._mountVideoRectObserver();

		// Seed muted state from config before any play() call to satisfy
		// the browser's autoplay-with-sound policy. The consumer can
		// always call unmute() after the first user gesture.
		if (this.options?.muted) {
			instance.mute();
		}

		// Native <video controls> — useful when no UI plugin is loaded.
		// Note: loading DesktopUiPlugin or TvKeyHandlerPlugin alongside controls:true
		// results in doubled UI; disable one or the other.
		if (this.options?.controls) {
			instance.mediaElement().controls = true;
		}

		// Ensure _wantedPoster is resolved before applying. queue() pre-positions
		// the cursor without emitting 'current', so _wantedPoster can be null even
		// when a valid current item exists. Read the item directly here.
		if (this._wantedPoster === null) {
			this._applyPosterFromCurrentItem();
		}

		this._applyPoster();

		// Seed _aspectRatio from options.stretching when no explicit aspectRatio()
		// call has overridden it yet (i.e. still at the 'uniform' default).
		// This preserves any value the consumer set via player.aspectRatio(x)
		// before the first load — such calls store the value in _aspectRatio but
		// bail early because videoElement is not yet set.
		if (this.options?.stretching && this._aspectRatio === 'uniform') {
			this._aspectRatio = this.options.stretching;
		}
		this._applyObjectFit(this._aspectRatio);
		// Bridge backend element events to player-level phase transitions and
		// the `firstFrame` / `ended` events the player surface promises.
		let firstFrameEmitted = false;
		instance.on('canplay', () => {
			if (firstFrameEmitted)
				return;
			firstFrameEmitted = true;
			performance.mark('nm:player:firstFrame');
			if (this._phase === 'starting') {
				const from = this._phase;
				this._phase = 'playing';
				this.emit('phase', { from, to: 'playing' });
			}
			this.emit('firstFrame', undefined);
		});
		instance.on('ended', () => {
			const from = this._phase;
			if (from !== 'ended') {
				this._phase = 'ended';
				this.emit('phase', { from, to: 'ended' });
			}
			this.emit('ended', undefined);
		});

		// Sync `_playState` with the actual element. Without this, every
		// natural pause (buffering stall, end-of-media, source swap during
		// load()) leaves `_playState='playing'` lying — `togglePlayback`
		// then sees `playing` and silently calls `pause()` again, so the
		// next user "play" click is a no-op.
		//
		// `pauseGuard` suppresses the transition when the element already
		// reached `ended` — browsers fire `pause` immediately before `ended`
		// at natural completion, and without the guard that produces a
		// spurious `pause` event right before `ended`. `resetEvents` covers
		// both a new source starting to load (`loadstart`) and the current
		// source being cleared (`emptied` — HMR re-mount, manual unload).
		bridgeBackendPlayState<BackendEventPayload>(instance, {
			isPlaying: () => this._playState === 'playing',
			setPlaying: (playing) => {
				this._playState = playing ? 'playing' : 'paused';
			},
			onPlay: () => { this.emit('play', undefined); },
			onPlaying: () => { this.emit('playing', undefined); },
			onPause: () => { this.emit('pause', undefined); },
			onReset: () => { firstFrameEmitted = false; },
			pauseGuard: () => !instance.mediaElement().ended,
			resetEvents: ['loadstart', 'emptied'],
		});

		// Bridge backend subtitle cue stream to the player's event
		// surface. Renderers (overlay plugins, debug widgets, a11y
		// tooling) consume this single channel without caring whether
		// the cue originated from a native HLS textTrack, a sidecar
		// VTT (kit-driven), or a future MSE/WebCodecs backend.
		instance.on('subtitleCue', (data?: SubtitleCueChange) => {
			if (!data)
				return;
			this.emit('subtitleCue', data);
		});

		instance.on('timeupdate', () => {
			// Between a `next()` and the incoming item's mount, this element is
			// still the OUTGOING item's — the cursor already moved. Publishing
			// its position here hands every listener the previous item's
			// position stamped with the new item's identity. Optional call:
			// the dependency range admits a core that predates the reader, and
			// an older core must degrade to the old behaviour, not throw on
			// every tick.
			if (this._mediaIsStale?.())
				return;

			const currentTime = instance.currentTime();
			const duration = instance.duration();

			// The payload is core's full TimeState snapshot, built from the
			// backend's fresh position — the internal slot syncs FROM this event.
			this.emit('time', this._timeStateAt(currentTime));

			// Fire `itemEndingSoon` when the threshold is crossed. The helper is
			// idempotent per item — it latches internally and resets on each load.
			this._checkItemEndingSoon(currentTime, duration);

			// Poll dropped-frame counter from the media element on every timeupdate.
			// `getVideoPlaybackQuality()` is only available on HTMLVideoElement and
			// only when the element has an active source — guard defensively.
			const videoEl = instance.mediaElement();
			const quality = typeof videoEl.getVideoPlaybackQuality === 'function'
				? videoEl.getVideoPlaybackQuality()
				: undefined;
			if (quality !== undefined) {
				this.recordMetric('droppedFrames', quality.droppedVideoFrames);
			}
		});
		instance.on('loadedmetadata', (data?: { duration: number }) => {
			if (!data)
				return;
			this.emit('duration', { duration: data.duration });
		});

		// Bridge buffering / readiness signals so overlay plugins can
		// show/hide the spinner via typed player events.
		instance.on('waiting', () => { this.emit('waiting', undefined); });
		instance.on('stalled', () => { this.emit('stalled', undefined); });
		instance.on('canplay', () => { this.emit('canplay', undefined); });

		// Bridge track-list availability signals so overlay plugins can
		// update button visibility after the HLS manifest is parsed.
		instance.on('levels', (data) => {
			if (!data)
				return;
			this.emit('levels', data);
		});
		instance.on('level-switched', (data) => {
			if (!data)
				return;
			this.emit('level-switched', data);
		});
		instance.on('audioTracks', (data) => {
			if (!data)
				return;
			this.emit('audioTracks', data);
		});

		return instance;
	}

	// ── Loading ── composed in via `loadingMethods` mixin.
	declare load: (item: T, opts?: LoadOptions) => Promise<void>;
	declare loadQueue: (url: string, parser?: (raw: string) => T[]) => Promise<void>;

	// ── Shared state methods ── composed in via `playerStateMethods` mixin.
	declare bufferState: () => BufferState;
	declare networkState: () => NetworkState;
	declare streamState: () => string;
	declare visibilityState: () => VisibilityState;
	declare qualityMode: {
		(): QualityState;
		(target: number | 'auto'): void;
	};

	declare audioTrackMode: {
		(): AudioTrackState;
		(idx: number): void;
	};

	// ── Video-specific state ──

	private _fullscreenActive = false;

	fullscreen(): FullscreenState;
	fullscreen(state: FullscreenState | boolean): void;
	fullscreen(state?: FullscreenState | boolean): FullscreenState | void {
		const platform = this.platform();
		const ctrl = platform.fullscreen;
		if (state === undefined) {
			// Prefer browser truth when available; fall back to tracked state for
			// environments where requestFullscreen is rejected (headless, sandboxed).
			if (ctrl?.isActive())
				return FullscreenState.ON;
			return this._fullscreenActive ? FullscreenState.ON : FullscreenState.OFF;
		}
		const wantActive = typeof state === 'boolean' ? state : state === FullscreenState.ON;
		if (!ctrl) {
			throw new BrowserPolicyError({
				code: 'core:policy/fullscreenUnsupported',
				severity: 'error',
				scope: { kind: 'core' },
				message: 'Fullscreen controller not configured. Pass `setup({ platform })` with a fullscreen controller, or use the default `browserPlatform`.',
			});
		}
		this._fullscreenActive = wantActive;
		const action = wantActive
			? ctrl.enter(this.container)
			: ctrl.exit();
		void action.catch(() => { /* swallow — UI listens to fullscreen event */ });
		this.emit('fullscreen', { active: wantActive });
	}

	private _pipActive = false;

	pip(): PipState;
	pip(state: PipState | boolean): void;
	pip(state?: PipState | boolean): PipState | void {
		const platform = this.platform();
		const ctrl = platform.pip;
		if (state === undefined) {
			if (ctrl?.isActive())
				return PipState.ON;
			return this._pipActive ? PipState.ON : PipState.OFF;
		}
		const wantActive = typeof state === 'boolean' ? state : state === PipState.ON;
		if (!ctrl) {
			throw new BrowserPolicyError({
				code: 'core:policy/pipUnsupported',
				severity: 'error',
				scope: { kind: 'core' },
				message: 'PiP controller not configured. Pass `setup({ platform })` with a PiP controller, or use the default `browserPlatform`.',
			});
		}
		this._pipActive = wantActive;
		const action = wantActive ? ctrl.enter(this.videoElement as HTMLVideoElement) : ctrl.exit();
		void action.catch(() => { /* swallow */ });
		this.emit('pip', { active: wantActive });
	}

	private _theaterActive = false;

	theater(): TheaterState;
	theater(state: TheaterState | boolean): void;
	theater(state?: TheaterState | boolean): TheaterState | void {
		if (state === undefined) {
			return this._theaterActive ? TheaterState.ON : TheaterState.OFF;
		}
		const wantActive = typeof state === 'boolean' ? state : state === TheaterState.ON;
		this._theaterActive = wantActive;
		this.emit('theater', { active: wantActive });
	}

	/**
	 * Whether any subtitle track is currently active.
	 *
	 * The canonical answer comes from the kit's selection (`subtitle()`)
	 * because plugin-rendered subtitles (ASS via libass / Octopus, image-based
	 * VOBSUB / PGS, future formats) render to their own surfaces and never
	 * appear in `videoElement.textTracks`. Falls back to scanning `textTracks`
	 * for the case where a backend (HLS.js) toggled a native track without
	 * routing through `subtitle()`.
	 */
	subtitleState(): SubtitleState {
		const sel = this.subtitle();
		if (sel != null && typeof sel.index === 'number' && sel.index >= 0)
			return SubtitleState.ON;

		const tracks = this._backend?.mediaElement?.()?.textTracks;
		if (tracks) {
			for (let i = 0; i < tracks.length; i++) {
				if (tracks[i]!.mode === 'showing')
					return SubtitleState.ON;
			}
		}
		return SubtitleState.OFF;
	}

	// ── Video-specific actions ──
	toggleFullscreen(): void {
		const isActive = this.fullscreen() === FullscreenState.ON;
		this.fullscreen(!isActive);
	}

	togglePip(): void {
		const isActive = this.pip() === PipState.ON;
		this.pip(!isActive);
	}

	toggleTheater(): void {
		const isActive = this.theater() === TheaterState.ON;
		this.theater(!isActive);
	}

	cycleSubtitles(): void {
		let list: SubtitleTrack[] = [];
		try { list = this.subtitles(); }
		catch { /* tracks API not implemented yet — treat as empty */ }
		if (!list || list.length === 0)
			return;
		let current = -1;
		try {
			const sel = this.subtitle();
			if (sel != null && typeof sel.index === 'number' && sel.index >= 0)
				current = sel.index;
		}
		catch { /* state unavailable — start from off */ }
		// Walk: -1 (off) → 0 → 1 → ... → list.length-1 → -1 (off)
		const next = current >= list.length - 1 ? -1 : current + 1;
		this.subtitle(next === -1 ? null : next);
	}

	// cycleAudioTracks — composed in via `mediaTracksMethods` mixin (core, shared with music).

	private _aspectRatio: Stretching = 'uniform';

	private static readonly _OBJECT_FIT_MAP: Record<Stretching, string> = {
		uniform: 'contain',
		fill: 'fill',
		exactfit: 'cover',
		none: 'none',
	};

	aspectRatio(): Stretching;
	aspectRatio(value: Stretching): void;
	aspectRatio(value?: Stretching): Stretching | void {
		if (value === undefined)
			return this._aspectRatio;

		this._aspectRatio = value;
		this._applyObjectFit(value);
		this.emit('aspectRatio', { value });
	}

	cycleAspectRatio(): void {
		const order: Stretching[] = ['uniform', 'fill', 'exactfit', 'none'];
		const idx = order.indexOf(this._aspectRatio);
		const next = order[(idx + 1) % order.length]!;
		this._aspectRatio = next;
		this._applyObjectFit(next);
		this.emit('aspectRatio', { value: next });
	}

	private _applyObjectFit(value: Stretching): void {
		const el = this.videoElement;
		if (!el || !el.style)
			return;
		el.style.objectFit = NMVideoPlayer._OBJECT_FIT_MAP[value];
	}

	// ── Video geometry ──

	private _videoRectObserver: ResizeObserver | null = null;

	/**
	 * The displayed video content rectangle relative to the player container,
	 * computed from `object-fit: contain` geometry.
	 *
	 * Returns `null` when the video has no loaded metadata yet.
	 * Changes are signalled by the `'videoRect'` event — fired on `mediaReady`,
	 * `duration`, `fullscreen`, and a `ResizeObserver` on the container and
	 * video element.
	 */
	videoRect(): VideoRect | null {
		const video = this.videoElement;
		if (!video) {
			return null;
		}

		const container = this.container;
		const rect = containedRect(
			video.videoWidth,
			video.videoHeight,
			container.clientWidth,
			container.clientHeight,
		);

		return rect;
	}

	private _emitVideoRect(): void {
		const rect = this.videoRect();
		this.emit('videoRect', { rect });
	}

	private _mountVideoRectObserver(): void {
		if (this._videoRectObserver) {
			return;
		}

		if (typeof ResizeObserver === 'undefined') {
			return;
		}

		const observer = new ResizeObserver(() => { this._emitVideoRect(); });
		observer.observe(this.container);

		const video = this.videoElement;
		if (video) {
			observer.observe(video);
		}

		this._videoRectObserver = observer;
	}

	private _teardownVideoRectObserver(): void {
		this._videoRectObserver?.disconnect();
		this._videoRectObserver = null;
	}

	// ── Segment / window playback ──

	private _segmentUnlisten: (() => void) | null = null;

	/**
	 * Seek to `opts.startSec` and begin watching for `opts.endSec` on every
	 * `'time'` event. When the boundary is reached:
	 *
	 *   - `'segmentBoundary'` is always emitted first.
	 *   - `'loop'`    → seeks back to `startSec`.
	 *   - `'hold'`    → pauses at `endSec`.
	 *   - `'advance'` → no extra action; playback continues naturally.
	 *
	 * Replaces any previously active segment window immediately.
	 */
	playSegment(opts: SegmentOptions): void {
		this._clearSegmentInternal();

		const { startSec, endSec, onEnd } = opts;

		void this.time(startSec);

		const onTime = ({ time }: { time: number }): void => {
			if (time < endSec) {
				return;
			}

			const payload: SegmentBoundaryPayload = { startSec, endSec, onEnd };

			this.emit('segmentBoundary', payload);

			if (onEnd === 'loop') {
				void this.time(startSec);
			}
			else {
				if (onEnd === 'hold') {
					void this.pause();
				}
				this._clearSegmentInternal();
			}
		};

		this.on('time', onTime);

		this._segmentUnlisten = (): void => {
			this.off('time', onTime);
		};
	}

	/** Stop watching the active segment window without seeking or pausing. */
	clearSegment(): void {
		this._clearSegmentInternal();
	}

	private _clearSegmentInternal(): void {
		this._segmentUnlisten?.();
		this._segmentUnlisten = null;
	}

	/**
	 * Built-in wire-format adapter, called by the kit's queue ingest pipeline
	 * on every item. Accepts the v1 / NoMercy server playlist format (`file`,
	 * ms-based `chapters`, `{time, date}` progress, `tracks[]`) and reshapes
	 * to the canonical `VideoPlaylistItem` — idempotently, so canonical items
	 * pass through unchanged. Consumers reshape app-specific fields with the
	 * `transformPlaylistItem` config callback instead of overriding this.
	 */
	normalizePlaylistItem(item: BasePlaylistItem): BasePlaylistItem {
		return normalizeVideoPlaylistItem(item);
	}

	// ── Tracks / chapters / quality ── composed in via `mediaTracksMethods` mixin.
	declare subtitles: () => SubtitleTrack[];
	declare subtitle: {
		(): CurrentSubtitleSelection | null;
		(idx: number | null): Promise<void>;
	};

	/**
	 * Read or write the user's subtitle style. Read returns a copy of
	 * the current `SubtitleStyle`; write merges the patch onto the
	 * current style and emits `subtitleStyle` with the merged result.
	 * Persistence is the responsibility of preference plugins —
	 * `mediaTracksMethods` only owns the in-memory state + event.
	 */
	declare subtitleStyle: {
		(): SubtitleStyle;
		(patch: Partial<SubtitleStyle>): void;
	};

	/**
	 * Inject a sidecar subtitle track into the currently-playing item at
	 * runtime — no reload required. Idempotent by `url` + normalised
	 * `language`; `default: true` selects it immediately through the same
	 * cancellable `beforeSubtitle` path as `subtitle(idx)`. Composed in via
	 * `mediaTracksMethods` — see that mixin for the full contract.
	 */
	declare addSubtitleTrack: (track: SidecarSubtitleInput, opts?: ActionOptions) => SubtitleTrack;

	/** Remove a sidecar subtitle track added via `addSubtitleTrack()`, by id. */
	declare removeSubtitleTrack: (id: string, opts?: ActionOptions) => void;

	declare audioTracks: () => AudioTrack[];
	declare audioTrack: {
		(): CurrentAudioTrackSelection | null;
		(idx: number): Promise<void>;
	};

	/** Composed in via `mediaTracksMethods` — see that mixin for the full contract. */
	declare cycleAudioTracks: () => void;

	declare qualityLevels: {
		(): QualityLevel[];
		(opts: { includeUnsupported: true }): QualityLevel[];
	};

	declare quality: {
		(): CurrentQualitySelection | 'auto';
		(idx: number | 'auto'): void;
	};

	declare chapters: () => Chapter[];
	declare chapter: {
		(): Chapter | null;
		(idx: number): void;
	};

	declare seekToChapter: (idx: number, opts?: ActionOptions) => void;
	declare nextChapter: (opts?: ActionOptions) => void;
	declare previousChapter: (opts?: ActionOptions) => void;

	// ── Device capabilities ── composed in via `deviceMethods` mixin.
	declare isTv: () => boolean;
	declare isMobile: () => boolean;
	declare isDesktop: () => boolean;
	declare device: () => DeviceCapabilities;

	// ── MediaCapabilities + ABR ── composed in via `abrMethods` mixin.
	declare canPlay: (profile: { contentType: string; width?: number; height?: number; bitrate?: number; framerate?: number }) => Promise<CanPlayResult>;
	declare bandwidth: () => number;
	declare bandwidthEstimator: {
		(): (() => number) | undefined;
		(fn: () => number): void;
	};

	// ── Audio output device ── composed in via `audioOutputMethods` mixin.
	declare audioOutputs: () => Promise<MediaDeviceInfo[]>;
	declare selectAudioOutput: () => Promise<MediaDeviceInfo | null>;
	declare audioOutput: {
		(): Promise<string | null>;
		(deviceId: string): Promise<void>;
	};

	// ── Cast / handoff ── composed in via `castMethods` mixin.
	declare castState: () => CastState;
	declare transferTo: (target: CastTarget) => Promise<void>;

	// ── Auth runtime mutation ── composed in via `authMethods` mixin.
	declare auth: {
		(): Readonly<AuthConfig> | undefined;
		(config: AuthConfig): void;
		(partial: Partial<AuthConfig>): void;
		(clear: null): void;
	};

	declare refreshAuth: () => Promise<void>;
	declare resolveUrl: (url: string, category?: UrlCategory) => Promise<ResolvedUrl>;
	declare urlResolver: {
		(): IUrlResolver | undefined;
		(resolver: IUrlResolver | undefined): void;
	};

	// ── Performance metrics / clock / accessibility ── composed in via `metricsMethods` mixin.
	declare metrics: () => PlaybackMetrics;
	declare recordMetric: (name: string, value: number) => void;
	declare now: () => number;
	declare announce: (text: string, level?: AriaLiveLevel) => void;

	// ── Preload + transition strategies ── composed via `preloadStrategyMethods` mixin.
	declare setPreloadStrategy: (strategy: IPreloadStrategy) => void;
	declare setTransitionStrategy: (strategy: ITransitionStrategy) => void;
	declare preloadStrategy: () => IPreloadStrategy;
	declare transitionStrategy: () => ITransitionStrategy;

	_disposeBackend(): void {
		this._clearSegmentInternal();
		this._teardownVideoRectObserver();
		try { this._backend?.dispose?.(); }
		catch { /* defensive — kit must still finish disposing */ }
		this._backend = undefined;
		this.videoElement = undefined;
		_instances.delete(this.playerId);
	}
}

// Compose every shared player method onto the prototype. The kit's logic
// gets wired into the class here — no inheritance, no per-library duplication.
composeMixins(NMVideoPlayer.prototype, ...playerCoreMethods);

// Wrap the kit-composed `dispose` so the video backend (and any HLS
// instance it holds) tears down with the player. The kit's dispose
// is backend-agnostic by design — releasing IO surfaces is the player
// class's responsibility. Without this, every player.dispose() leaks
// an Hls instance that keeps polling fragments against the orphaned
// MediaSource, surfaced as `segment_0.ts` requested thousands of
// times after a single playlist switch in HMR-heavy dev sessions.
//
// The composed (kit) `dispose()` now dispatches the cancellable
// `beforeDispose` hook before it does anything else — a plugin may
// `preventDefault()` and leave the player fully alive. Backend teardown
// MUST wait until that dispatch has actually resolved AND the kit confirms
// it proceeded (phase reached 'disposed'); tearing the backend down
// unconditionally first (as before) would kill playback even when a
// plugin blocked the disposal.
{
	const composedDispose: () => Promise<void> = NMVideoPlayer.prototype.dispose;
	NMVideoPlayer.prototype.dispose = async function (this: NMVideoPlayer<BasePlaylistItem>): Promise<void> {
		// The container id is released before the first await, not after the
		// teardown resolves. Consumers re-create on the same container in the
		// same tick — a responsive view handing `#player1` from its desktop
		// variant to its mobile one does exactly that — and the registry still
		// held this player, so they were given back the very instance they had
		// just asked to dispose. `setup()` then threw `already-setup`, and the
		// throw left that player attached and playing with nobody holding a
		// reference to stop it.
		const claimedId: string = this.playerId;
		_instances.delete(claimedId);

		await composedDispose.call(this);

		if (this.phase() !== 'disposed') {
			// beforeDispose was prevented — the player is still alive, so it
			// takes its id back and the backend stays intact.
			_instances.set(claimedId, this);
			return;
		}

		this._disposeBackend();
	};
}

// Wrap setup() to re-seed the title-token translations into the translator
// immediately after _initTranslator() runs (which happens synchronously inside
// the composed setup). This guarantees %S/%E tokens resolve at queue ingest
// regardless of whether DesktopUiPlugin has been added, and regardless of
// which plugin translation bundles have loaded asynchronously.
{
	type _SetupFn<T extends VideoPlaylistItem> = (config: VideoPlayerConfig<T>) => NMVideoPlayer<T>;
	const composedSetup: _SetupFn<VideoPlaylistItem> = NMVideoPlayer.prototype.setup;
	NMVideoPlayer.prototype.setup = function (this: NMVideoPlayer<BasePlaylistItem>, config: VideoPlayerConfig<BasePlaylistItem>): NMVideoPlayer<BasePlaylistItem> {
		const result = composedSetup.call(this, config);
		this.addTranslations(titleTokenTranslations);
		return result;
	};
}

{
	// `quality` is an overloaded method; flatten it to one call signature to wrap it.
	type _KitQualityFn = (idx?: number | 'auto') => CurrentQualitySelection | 'auto' | void;
	const kitQuality = NMVideoPlayer.prototype.quality as _KitQualityFn;
	const wrapped: _KitQualityFn = function (this: NMVideoPlayer<BasePlaylistItem>, idx?: number | 'auto'): CurrentQualitySelection | 'auto' | void {
		if (idx === undefined) {
			return kitQuality.call(this);
		}
		kitQuality.call(this, idx);
		this.emit('quality:requested', { level: idx });
	};
	Object.defineProperty(NMVideoPlayer.prototype, 'quality', {
		value: wrapped,
		writable: true,
		configurable: true,
	});
}

// Wrap the kit-composed `setup` with the video-domain behavior every entry
// point must get — strategy defaults, autoPlay, theaterDefault. This lives on
// the class, not in a factory, so `nmplayer()` and `new NMVideoPlayer()`
// both behave identically.
{
	type _KitSetupFn = (config: VideoPlayerConfig<VideoPlaylistItem>) => NMVideoPlayer<VideoPlaylistItem>;
	const kitSetup: _KitSetupFn = NMVideoPlayer.prototype.setup;
	const wrappedSetup: _KitSetupFn = function (this: NMVideoPlayer<VideoPlaylistItem>, config: VideoPlayerConfig<VideoPlaylistItem>): NMVideoPlayer<VideoPlaylistItem> {
		// Video defaults to a hard cut between items (no crossfade) while still
		// preloading so the next item starts instantly. Consumer-supplied
		// strategies always win — only inject when absent.
		const leadSeconds = config.preloadLeadSeconds ?? 10;
		const enrichedConfig: VideoPlayerConfig<VideoPlaylistItem> = {
			crossfadeEnabled: false,
			...config,
			preloadLeadSeconds: leadSeconds,
			preloadStrategy: config.preloadStrategy ?? new VideoPreloadStrategy(leadSeconds),
			transitionStrategy: config.transitionStrategy ?? new GaplessTransitionStrategy(),
		};

		const result = kitSetup.call(this, enrichedConfig);

		// Every setup with a non-empty playlist primes the first item — loads
		// it so the player never mounts blank, regardless of autoPlay.
		// Progress-aware: items carrying `progress` resume at the most recent
		// position, >90% watched rolls over to the next item. autoPlay only
		// decides whether the primed item also plays; setup() only arms the
		// queue and play() does not lazy-load, so waiting for mediaReady here
		// would deadlock.
		const wantsAutoplay = enrichedConfig.autoPlay ?? false;
		void this.ready()
			.then(() => {
				const items = this.queue();
				if (items.length === 0)
					return;

				// A consumer that pre-picked an item between setup() and
				// ready() keeps its choice — no progress override. The
				// queue cursor DEFAULTS to item 0 the moment items exist,
				// so `item()` alone can't tell a real choice from the
				// default; only an explicit `item(target)` navigation
				// bumps `_currentEpoch`. Without this gate every session
				// "preselected" item 0 and resume never ran.
				const preselected = this._currentEpoch ? this.item() : undefined;
				if (preselected) {
					this.item(preselected, { autoplay: wantsAutoplay, source: 'auto-play' });
					return;
				}

				// `startAt` rides the load down to the backend (hls.js
				// `startPosition`), so resume begins AT the offset — the
				// old firstFrame-then-seek approach downloaded and decoded
				// the start of the stream just to discard it.
				const { index, resumeTime } = pickStartItem(items);
				this.item(index, { autoplay: wantsAutoplay, source: 'auto-play', startAt: resumeTime });
			})
			.catch(() => { /* setup failed — error surfaced via the 'error' event */ });

		if (enrichedConfig.theaterDefault) {
			this.theater(true);
		}

		return result;
	};
	Object.defineProperty(NMVideoPlayer.prototype, 'setup', {
		value: wrappedSetup,
		writable: true,
		configurable: true,
	});
}

/**
 * Create (or look up) a video player bound to a container element. Returns the
 * existing instance for a given id, or mounts a fresh one.
 *
 * ```ts
 * import nmplayer from '@nomercy-entertainment/nomercy-video-player';
 * nmplayer('my-div').setup({ ... });
 * ```
 */
export function nmplayer<T extends BasePlaylistItem = VideoPlaylistItem>(id?: string | number): NMVideoPlayer<T> {
	return new NMVideoPlayer<T>(id);
}

export default nmplayer;

export { NotImplementedError } from '@nomercy-entertainment/nomercy-player-core';

export type { SubtitleStyle } from '@nomercy-entertainment/nomercy-player-core';
