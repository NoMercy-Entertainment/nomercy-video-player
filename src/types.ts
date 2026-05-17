

import type { IVideoBackend, VideoBackendKind } from './adapters/video-backend/IVideoBackend';
import type {
	ActionOptions,
	AudioTrack as KitAudioTrack,
	AudioTrackState,
	BaseEventMap,
	BasePlayerConfig,
	BasePlaylistItem,
	Chapter as KitChapter,
	CurrentAudioTrackSelection,
	CurrentQualitySelection,
	CurrentSubtitleSelection,
	IPlayer,
	QualityLevel,
	SubtitleStyle,
	SubtitleTrack as KitSubtitleTrack,
} from '@nomercy-entertainment/nomercy-player-core';

export type { QualityLevel };

/** Re-export under domain names so video consumers don't reach into core. */
export type SubtitleTrackRef = KitSubtitleTrack;
export type AudioTrackRef = KitAudioTrack;
export type ChapterRef = KitChapter;

/**
 * A single font manifest entry for the `fonts` sidecar field on
 * `VideoPlaylistItem`. Each entry points to a fonts.json manifest URL or a
 * direct font file URL that the `OctopusPlugin` should pre-fetch for ASS
 * subtitle rendering.
 */
export interface FontTrackRef {
	/** URL of a `fonts.json` manifest or a direct font file URL. */
	file: string;
	/** Human-readable label (optional, for debugging). */
	label?: string;
}

export interface SkipperRange {
	start: number;
	end: number;
}

export interface SkipperData {
	intro?: SkipperRange;
	recap?: SkipperRange;
	credits?: SkipperRange;
}

/**
 * Continue-watching progress state for a playlist item. Consumers ship this
 * alongside each item so the playlist menu can render a watched-percentage bar
 * under the thumbnail without requiring the player to maintain watch history.
 */
export interface WatchProgress {
	/** Unix epoch milliseconds of the last watch session. Consumer formats for display. */
	timestamp: number;
	/** 0–100 percent watched (0 = unwatched, 100 = fully watched). */
	percentage: number;
}

export interface VideoPlaylistItem extends BasePlaylistItem {
	title?: string;
	url?: string;
	/**
	 * Cover art / poster URL. Surfaced on the `<video>` element's `poster`
	 * attribute and as MediaSession / cast metadata artwork. `image`,
	 * `poster`, and `thumbnail` are all accepted (read in that order) so
	 * consumers can use whichever field name their backend exposes.
	 */
	image?: string;
	poster?: string;
	thumbnail?: string;
	duration?: number;
	subtitles?: SubtitleTrackRef[];
	chapters?: ChapterRef[];
	previewSpriteUrl?: string;
	skippers?: SkipperData;
	/**
	 * Font manifests for ASS/SSA subtitle rendering via `OctopusPlugin`.
	 * Each entry is a `fonts.json` manifest URL or a direct font file URL.
	 * Canonical alternative to `tracks[].kind === 'fonts'`.
	 */
	fonts?: FontTrackRef[];
	/**
	 * Generic sidecar track list — escape hatch for track kinds without a
	 * typed field (`subtitles`, `chapters`, `previewSpriteUrl`, `fonts`
	 * cover all built-in cases).
	 *
	 * @deprecated Use the typed fields (`subtitles`, `chapters`,
	 * `previewSpriteUrl`, `fonts`) instead. `tracks` will be removed in a
	 * future major release.
	 */
	tracks?: Array<{ id?: number | string; kind?: string; file?: string; label?: string; language?: string }>;
	/** Series / show title displayed in the top-bar when season/episode are present. */
	show?: string;
	/** Season number (1-based). Combined with `episode` to render "S01E03" label. */
	season?: number;
	/** Episode number (1-based). */
	episode?: number;
	/**
	 * Continue-watching state for this item. Consumer-supplied — the player
	 * reads this to render the playlist menu progress bar. The player does not
	 * write to this field; persistence is the consumer's responsibility.
	 */
	progress?: WatchProgress;
}

/** Top-level playback state. Returned by `player.playState()`. */
export enum PlayState {
	IDLE = 'idle',
	LOADING = 'loading',
	PLAYING = 'playing',
	PAUSED = 'paused',
	STOPPED = 'stopped',
	ERROR = 'error',
}

/** Volume gain stage. Returned by `player.volumeState()`. */
export enum VolumeState {
	UNMUTED = 'unmuted',
	MUTED = 'muted',
}

/** Returned by `player.fullscreenState()`. */
export enum FullscreenState {
	OFF = 'off',
	ON = 'on',
}

/** Returned by `player.pipState()`. */
export enum PipState {
	OFF = 'off',
	ON = 'on',
}

/** Returned by `player.theaterState()`. */
export enum TheaterState {
	OFF = 'off',
	ON = 'on',
}

/** Returned by `player.subtitleState()`. */
export enum SubtitleState {
	OFF = 'off',
	ON = 'on',
}

/** Re-exported from kit — canonical definition lives in nomercy-player-core. */
export { AudioTrackState, QualityState } from '@nomercy-entertainment/nomercy-player-core';

/** Returned by `player.repeatState()`. */
export enum RepeatState {
	OFF = 'off',
	ALL = 'all',
	ONE = 'one',
}

/** Returned by `player.shuffleState()`. */
export enum ShuffleState {
	OFF = 'off',
	ON = 'on',
}

export interface VideoEventMap extends BaseEventMap {
	// Narrow the kit's BasePlaylistItem to the video-specific item type so
	// video plugins receive a typed item without casts.
	'current': { item: VideoPlaylistItem | undefined; index: number };

	'quality:requested': { level: number | 'auto' };
	chapter: { index: number; title: string };
	pip: { active: boolean };
	theater: { active: boolean };
	fullscreen: { active: boolean };
	mute: { muted: boolean };
	volume: { level: number };
	repeat: { state: RepeatState };
	shuffle: { state: ShuffleState };
	aspectRatio: { value: 'uniform' | 'fill' | 'exactfit' | 'none' };

	// Buffering / network-readiness signals forwarded from the HTML5 backend.
	// Overlay plugins use these to show / hide the spinner without polling.
	'waiting': void;
	'canplay': void;
	'stalled': void;

	// Track-list availability signals forwarded from the HTML5 backend.
	// Fires after HLS manifest parse — the list may not be populated at
	// `mediaReady` time, so overlay plugins subscribe here for button
	// visibility rather than polling the getter at startup.
	'levels': { levels: QualityLevel[] };
	'level-switched': { level: number };
	'audioTracks': { tracks: import('@nomercy-entertainment/nomercy-player-core').AudioTrack[] };

	// `subtitle` (track index) and `subtitleCue` (active cue stream) are
	// inherited from `BaseEventMap` — the kit owns those signals so any
	// consumer (overlay plugins, debug widgets, a11y tooling) can subscribe
	// without depending on a specific player package.

	// Navigation intent emitted by the DesktopUiPlugin back button.
	// The player itself has no navigation stack — consumers wire a listener
	// and handle routing (e.g. router.back(), close the player modal).
	// The back button in the UI is only visible when at least one listener
	// is registered (checked via `player.hasListeners('back')` at ready time).
	'back': void;
}

/**
 * Custom video-backend factory. Receives the resolved backend kind and the
 * player options; returns an `IVideoBackend` impl. Use this to inject
 * WebCodecs, native-shell `<video>` bridges, or experimental backends without
 * subclassing the player.
 */
export type VideoBackendFactory = (
	kind: VideoBackendKind,
	config: VideoPlayerConfig<BasePlaylistItem>,
) => IVideoBackend;

export interface VideoPlayerConfig<T extends BasePlaylistItem = VideoPlaylistItem> extends BasePlayerConfig {
	muted?: boolean;
	autoPlay?: boolean;
	controls?: boolean;
	stretching?: 'uniform' | 'fill' | 'exactfit' | 'none';
	playbackRates?: number[];
	preload?: 'auto' | 'metadata' | 'none';
	disableMediaControls?: boolean;
	disableControls?: boolean;
	/**
	 * Custom backend factory. Overrides the kit's default backend resolution
	 * (`html5` / `mse` / `webcodecs`). Receives the resolved kind so factories
	 * can branch on it.
	 */
	backendFactory?: VideoBackendFactory;
	/** Auto-select the subtitle track matching this language tag. */
	defaultSubtitleLanguage?: string;
	/** Auto-select the audio track matching this language tag. */
	defaultAudioLanguage?: string;
	/** Adaptive default — `'auto'` or a fixed level index. */
	defaultQuality?: 'auto' | number;
	/** Start in theater mode. */
	theaterDefault?: boolean;
	/**
	 * Base URL prepended to relative `image` / `poster` / `thumbnail` paths on
	 * playlist items. Useful when the item shape carries TMDB-style relative
	 * paths (`/abc.jpg`) — set this to `'https://image.tmdb.org/t/p/original'`
	 * (or your own CDN) and the player resolves the poster URL automatically.
	 * Absolute URLs (any scheme) pass through unchanged.
	 */
	imageBasePath?: string;
	/** Initial playlist — items inline OR a URL fetched and parsed at setup. */
	playlist?: T[] | string;
}

export type Stretching = NonNullable<VideoPlayerConfig['stretching']>;


/**
 * Typed contract for the video player's video-specific surface. Extends the
 * shared `IPlayer<VideoEventMap>` with every method that exists only on
 * `NMVideoPlayer`.
 *
 * Prefer typing plugin parameters and consumer functions against `IVideoPlayer`
 * rather than `NMVideoPlayer<any>` — the interface is stable across patch
 * versions; the concrete class is an implementation detail.
 */
export interface IVideoPlayer<T extends BasePlaylistItem = VideoPlaylistItem>
	extends IPlayer<VideoEventMap> {

	// ── Video element ──

	/** Raw `<video>` element. `undefined` until the first `backend()` call. */
	readonly videoElement: HTMLVideoElement | undefined;

	// ── Backend ──

	/** Returns the active `IVideoBackend` instance, constructing it on first call. */
	backend(): IVideoBackend;

	// ── Fullscreen / PiP / Theater ──

	fullscreenState(): FullscreenState;
	fullscreenState(state: FullscreenState | boolean): void;

	pipState(): PipState;
	pipState(state: PipState | boolean): void;

	theaterState(): TheaterState;
	theaterState(state: TheaterState | boolean): void;

	/** Whether any subtitle track is currently active. */
	subtitleState(): SubtitleState;

	toggleFullscreen(): void;
	togglePip(): void;
	toggleTheater(): void;

	/** Walk the subtitle track list: `off → 0 → … → N-1 → off`. */
	cycleSubtitles(): void;

	/** Walk the audio track list, wrapping around. */
	cycleAudioTracks(): void;

	// ── Aspect ratio ──

	aspectRatio(): 'uniform' | 'fill' | 'exactfit' | 'none';
	aspectRatio(value: 'uniform' | 'fill' | 'exactfit' | 'none'): void;

	/** Step through `['uniform', 'fill', 'exactfit', 'none']` in order. */
	cycleAspectRatio(): void;

	// ── Track selection ──

	subtitles(): KitSubtitleTrack[];

	currentSubtitle(): CurrentSubtitleSelection | null;
	currentSubtitle(idx: number | null): void;

	subtitleStyle(): SubtitleStyle;
	subtitleStyle(patch: Partial<SubtitleStyle>): void;

	audioTracks(): KitAudioTrack[];

	currentAudioTrack(): CurrentAudioTrackSelection | null;
	currentAudioTrack(idx: number): void;

	audioTrackState(): AudioTrackState;
	audioTrackState(idx: number): void;

	qualityLevels(): QualityLevel[];
	qualityLevels(opts: { includeUnsupported: true }): QualityLevel[];

	currentQuality(): CurrentQualitySelection | 'auto';
	currentQuality(idx: number | 'auto'): void;

	// ── Transport ──

	play(opts?: ActionOptions): Promise<void>;
	pause(opts?: ActionOptions): Promise<void>;
	stop(opts?: ActionOptions): Promise<void>;
	next(opts?: ActionOptions): Promise<void>;
	previous(opts?: ActionOptions): Promise<void>;

	// ── Queue ──

	current(): T | undefined;
	current(target: T | string | number, opts?: ActionOptions): void;
}
