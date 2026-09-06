// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type {
	ActionOptions,
	AudioTrack,
	AudioTrackState,
	BaseEventMap,
	BasePlayerConfig,
	BasePlaylistItem,
	CurrentAudioTrackSelection,
	CurrentQualitySelection,
	CurrentSubtitleSelection,
	IPlayer,
	AudioTrack as KitAudioTrack,
	Chapter as KitChapter,
	SubtitleTrack as KitSubtitleTrack,
	LoadOptions,
	PlayState,
	QualityLevel,
	SidecarSubtitleInput,
	SubtitleStyle,
	VolumeState,
} from '@nomercy-entertainment/nomercy-player-core';
import type { IVideoBackend, VideoBackendKind } from './adapters/video-backend/IVideoBackend';

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
	/** Playback position in seconds, used to resume where the last session left off. */
	time?: number;
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
	/** Short description or synopsis displayed in the playlist episode card. */
	description?: string;
	duration?: number;
	subtitles?: SubtitleTrackRef[];
	chapters?: ChapterRef[];
	previewSpriteUrl?: string;
	/**
	 * Font manifests for ASS/SSA subtitle rendering via `OctopusPlugin`.
	 * Each entry is a `fonts.json` manifest URL or a direct font file URL.
	 * Canonical alternative to `tracks[].kind === 'fonts'`.
	 */
	fonts?: FontTrackRef[];
	/** Series / show title displayed in the top-bar when season/episode are present. */
	show?: string;
	/** Season number. `0` means extras. Rendered unpadded: `S1E3` in the top bar, `S1: E3` on the playlist card. */
	season?: number;
	/** Episode number (1-based). */
	episode?: number;
	/**
	 * Continue-watching state for this item. Consumer-supplied — the player
	 * reads this to render the playlist menu progress bar. The player does not
	 * write to this field; persistence is the consumer's responsibility.
	 */
	progress?: WatchProgress;

	// ── Consumer-supplied application fields ────────────────────────────────────
	// These are not used by the player core — they are preserved so that consumer
	// code passing application-specific playlist items compiles without casts.

	/** Human-readable season label (e.g. `"Season 1"`). Consumer-supplied display field. */
	seasonName?: string;
	/** Stable item UUID. Consumer-supplied and carried through untouched; nothing in this package reads it. */
	uuid?: string;
	/** Channel or network logo URL. Consumer-supplied display field. */
	logo?: string;
	/** Content rating label (e.g. `"PG-13"`, `"TV-MA"`). Consumer-supplied display field. */
	rating?: string | number;
	/** Audio track list from the consumer's API response. Consumer-supplied field. */
	audio?: unknown;
	/** Playlist type discriminator (e.g. `"episode"`, `"movie"`). Consumer-supplied field. */
	playlist_type?: string;
	/** Consumer-supplied TMDB identifier. */
	tmdb_id?: number | string;
	/** Consumer-supplied internal video record ID. */
	video_id?: number | string;
	/** Consumer-supplied media type discriminator (e.g. `"movie"`, `"tv"`). */
	video_type?: string;
	/** Media release year. Consumer-supplied display field. */
	year?: number;
}

/** Returned by `player.fullscreen()`. */
export enum FullscreenState {
	OFF = 'off',
	ON = 'on',
}

/** Returned by `player.pip()`. */
export enum PipState {
	OFF = 'off',
	ON = 'on',
}

/** Returned by `player.theater()`. */
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
export { AudioTrackState, PlayState, QualityState, RepeatState, ShuffleState, VolumeState } from '@nomercy-entertainment/nomercy-player-core';

/**
 * The displayed video content rectangle relative to the player container.
 * Computed from `object-fit: contain` geometry — the area actually painted
 * by the video inside the letterbox / pillarbox padding.
 *
 * All values are in CSS pixels. `scale` is the ratio of displayed width to
 * native video width (useful for converting pixel offsets between coordinate
 * spaces, e.g. subtitle positioning).
 *
 * `null` when the video has no loaded metadata yet (videoWidth / videoHeight
 * are both 0) or when the container dimensions are unknown.
 */
export interface VideoRect {
	/** Left offset of the video content area inside the container. */
	x: number;
	/** Top offset of the video content area inside the container. */
	y: number;
	/** Displayed width of the video content area in CSS pixels. */
	width: number;
	/** Displayed height of the video content area in CSS pixels. */
	height: number;
	/** Ratio of displayed width to native video width. */
	scale: number;
}

/**
 * Pure helper — compute the `object-fit: contain` displayed rect for a video
 * with native dimensions `videoW × videoH` inside a container of `containerW × containerH`.
 *
 * Returns `null` when any dimension is zero (pre-metadata or zero-size container).
 * This is the single implementation shared by `NMVideoPlayer.videoRect()`,
 * `SubtitleOverlayPlugin`, and consumer plugins that need the same geometry.
 */
export function containedRect(
	videoW: number,
	videoH: number,
	containerW: number,
	containerH: number,
): VideoRect | null {
	if (!videoW || !videoH || !containerW || !containerH) {
		return null;
	}

	const containerAR = containerW / containerH;
	const videoAR = videoW / videoH;
	let width: number;
	let height: number;

	if (videoAR > containerAR) {
		width = containerW;
		height = containerW / videoAR;
	}
	else {
		height = containerH;
		width = containerH * videoAR;
	}

	width = Math.round(width);
	height = Math.round(height);

	const x = Math.round((containerW - width) / 2);
	const y = Math.round((containerH - height) / 2);
	const scale = width / videoW;

	return { x, y, width, height, scale };
}

/**
 * The behaviour when a segment window's `endSec` is reached.
 *
 * - `'loop'`    — seek back to `startSec` and continue playing.
 * - `'hold'`    — pause at `endSec` (last frame stays visible).
 * - `'advance'` — emit `'segmentBoundary'` and let playback continue naturally.
 */
export type SegmentEndBehaviour = 'loop' | 'hold' | 'advance';

/**
 * Options for `NMVideoPlayer.playSegment()`.
 *
 * All time values are in seconds, matching `player.time()` and the `'time'`
 * event payload. The player seeks to `startSec` immediately and installs a
 * `'time'`-event watcher that fires when `currentTime >= endSec`.
 */
export interface SegmentOptions {
	/** Start of the playback window, in seconds. Player seeks here immediately. */
	startSec: number;
	/** End of the playback window, in seconds. Triggers `onEnd` behaviour. */
	endSec: number;
	/** What to do when `endSec` is reached. */
	onEnd: SegmentEndBehaviour;
}

/**
 * Payload emitted on the `'segmentBoundary'` event.
 *
 * Fired each time the `endSec` boundary of the active segment window is
 * reached — regardless of `onEnd` mode. Generic for intros, chapter loops, etc.
 */
export interface SegmentBoundaryPayload {
	/** The `startSec` value from the `playSegment()` call that reached its end. */
	startSec: number;
	/** The `endSec` value that was reached. */
	endSec: number;
	/** The `onEnd` mode that was applied after the boundary fired. */
	onEnd: SegmentEndBehaviour;
}

/**
 * Video-specific events on top of `BaseEventMap`.
 *
 * The generic `T` threads the concrete video-item type into every item-bearing
 * event payload inherited from `BaseEventMap`. Defaults to `VideoPlaylistItem`
 * so existing code that references `VideoEventMap` without a type argument is
 * unchanged.
 */
export interface VideoEventMap<T extends VideoPlaylistItem = VideoPlaylistItem> extends BaseEventMap<T> {
	'quality:requested': { level: number | 'auto' };
	'pip': { active: boolean };
	'theater': { active: boolean };
	'fullscreen': { active: boolean };
	'aspectRatio': { value: Stretching };

	// Fired whenever the displayed video content rectangle changes — driven by
	// mediaReady, duration, fullscreen, and ResizeObserver on container + videoElement.
	// Overlay plugins subscribe here instead of maintaining their own observers.
	'videoRect': { rect: VideoRect | null };

	// Fired when the active segment window's endSec is reached — regardless of
	// the onEnd mode applied. Generic for intros, chapter loops, etc.
	'segmentBoundary': SegmentBoundaryPayload;

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
	'audioTracks': { tracks: AudioTrack[] };

	// OSD toast request — plugins emit this instead of rendering text themselves.
	// The active UI plugin (DesktopUiPlugin, TvKeyHandlerPlugin) subscribes and renders.
	// `ms` is the display duration in milliseconds; omit for the UI's default.
	'display-message': { text: string; ms?: number };
	// Dismiss the active toast before its duration elapses (v1 surface).
	'remove-message': undefined;

	// Navigation intent emitted by the DesktopUiPlugin back button.
	// The player itself has no navigation stack — consumers wire a listener
	// and handle routing (e.g. router.back(), close the player modal).
	// The back button in the UI is only visible when at least one listener
	// is registered (checked via `player.hasListeners('back')` at ready time).
	'back': void;

	// Close intent emitted by the DesktopUiPlugin close button.
	// The player itself has no window/modal concept — consumers wire a listener
	// and handle dismissal (e.g. hide the player overlay).
	// The close button is only visible when at least one listener is registered
	// (checked via `player.hasListeners('close')` at ready time).
	'close': void;

	// Cast intent emitted by the DesktopUiPlugin top-bar cast button. The player
	// has no opinion on how a device gets picked or how playback gets handed
	// off; it only surfaces the click. Consumers wire a listener and open their
	// own device picker — never route it through `CastSenderPlugin` /
	// `session.loadMedia()`. Opt-in via `DesktopUiButtonOptions.cast` (default
	// off) — unlike back/close, visibility does NOT depend on listener presence.
	'cast': void;

	// Subtitle-size step request emitted by KeyHandlerPlugin's `+`/`-` bindings.
	// The active UI plugin (or an overlay renderer) subscribes and steps
	// `subtitleStyle().fontSize` — the key handler doesn't own the step size.
	'subtitle-size-up': void;
	'subtitle-size-down': void;
}

/**
 * Video aspect-ratio / object-fit mode passed to `player.aspectRatio()` and
 * the `stretching` config field. Values mirror the JW Player / Shaka Player
 * convention so existing configs migrate unchanged.
 *
 * - `'uniform'`  — letterbox / pillarbox to fit (CSS `object-fit: contain`).
 * - `'fill'`     — stretch to fill, ignoring aspect ratio (`object-fit: fill`).
 * - `'exactfit'` — cover-crop, preserving aspect ratio (`object-fit: cover`).
 * - `'none'`     — no scaling; native video dimensions.
 */
export type Stretching = 'uniform' | 'fill' | 'exactfit' | 'none';

/**
 * HTML `<video>` preload hint passed to the `preload` config field and the
 * backend `load()` call. Maps directly to the `HTMLMediaElement.preload`
 * attribute values defined in HTML 5.2.
 *
 * - `'auto'`     — browser decides how much to preload.
 * - `'metadata'` — preload dimensions + duration only.
 * - `'none'`     — no preloading until playback begins.
 */
export type HtmlPreloadMode = 'auto' | 'metadata' | 'none';

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
	stretching?: Stretching;
	playbackRates?: number[];
	preload?: HtmlPreloadMode;
	/**
	 * Disable only the hardware / OS media-key bindings (the play/pause, next
	 * and previous media keys) that `KeyHandlerPlugin` installs, while keeping
	 * every other keyboard shortcut active. Unrelated to the native
	 * `<video controls>` attribute, which is the `controls` field on
	 * `BasePlayerConfig`.
	 */
	disableMediaControls?: boolean;
	/**
	 * Master switch for `KeyHandlerPlugin`'s default keyboard shortcuts: when
	 * `true`, none are registered at all — playback, seeking, volume, media
	 * keys, chapters, fullscreen, speed, and the rest. Also unrelated to the
	 * native `<video controls>` attribute (`controls` on `BasePlayerConfig`).
	 */
	disableControls?: boolean;
	/**
	 * Stop a click or tap on the video from toggling playback. Read by every
	 * plugin that binds its own click handling — `DesktopUiPlugin` on the video
	 * element, `TouchZonesPlugin` on its overlay zones — so one setting covers
	 * a player that registers both. Either source switches it off: this field,
	 * or the same-named option on an individual plugin.
	 */
	disableClickToPause?: boolean;
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
	 * Automatically advance to the next queue item when the current item ends.
	 * Default `true`. Set to `false` when an external orchestrator (Cast sync,
	 * WebSocket) drives `next()` — duplicate advances would result otherwise.
	 */
	autoAdvance?: boolean;
	/**
	 * Base URL prepended to relative `image` / `poster` / `thumbnail` paths on
	 * playlist items. Useful when the item shape carries TMDB-style relative
	 * paths (`/abc.jpg`) — set this to `'https://image.tmdb.org/t/p/original'`
	 * (or your own CDN) and the player resolves the poster URL automatically.
	 * Absolute URLs (any scheme) pass through unchanged.
	 */
	baseImageUrl?: string;
	/** Initial playlist — items inline OR a URL fetched and parsed at setup. */
	playlist?: T[] | string;
}

/**
 * Typed contract for the video player's video-specific surface. Extends the
 * shared `IPlayer<VideoEventMap>` with every method that exists only on
 * `NMVideoPlayer`.
 *
 * Prefer typing plugin parameters and consumer functions against `IVideoPlayer`
 * rather than `NMVideoPlayer<any>` — the interface is stable across patch
 * versions; the concrete class is an implementation detail.
 */
export interface IVideoPlayer<T extends VideoPlaylistItem = VideoPlaylistItem>
	extends IPlayer<VideoEventMap<T>> {

	/**
	 * Phantom brand — mirrors the declaration on `NMVideoPlayer`. Declared
	 * directly on the interface so `PlayerEventMap<IVideoPlayer<T>>` resolves to
	 * `VideoEventMap<T>` without TypeScript having to walk the `extends
	 * IPlayer<VideoEventMap<T>>` generic-instantiation chain (which stalls in
	 * conditional-type inference for interface types).
	 */
	readonly __eventMap__: VideoEventMap<T>;

	// ── Video element ──

	/** Raw `<video>` element. `undefined` until the first `backend()` call. */
	readonly videoElement: HTMLVideoElement | undefined;

	// ── Video geometry ──

	/**
	 * The displayed video content rectangle relative to the player container,
	 * computed from `object-fit: contain` geometry. Returns `null` when video
	 * dimensions are not yet known (pre-metadata). Overlay plugins use this
	 * instead of computing their own letterbox math.
	 *
	 * Changes are signalled by the `'videoRect'` event.
	 */
	videoRect(): VideoRect | null;

	// ── Backend ──

	/** Returns the active `IVideoBackend` instance, constructing it on first call. */
	backend(): IVideoBackend;
	/**
	 * Swap the active backend. Disposes the current instance, constructs a
	 * fresh one for `kind`, and emits `backend:changed`. Only `'html5'` has a
	 * built-in implementation — other kinds require `options.backendFactory`.
	 */
	backend(kind: VideoBackendKind): Promise<void>;

	// ── Fullscreen / PiP / Theater ──

	fullscreen(): FullscreenState;
	fullscreen(state: FullscreenState | boolean): void;

	pip(): PipState;
	pip(state: PipState | boolean): void;

	theater(): TheaterState;
	theater(state: TheaterState | boolean): void;

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

	aspectRatio(): Stretching;
	aspectRatio(value: Stretching): void;

	/** Step through `['uniform', 'fill', 'exactfit', 'none']` in order. */
	cycleAspectRatio(): void;

	// ── Track selection ──

	subtitles(): KitSubtitleTrack[];

	subtitle(): CurrentSubtitleSelection | null;
	subtitle(idx: number | null): Promise<void>;

	subtitleStyle(): SubtitleStyle;
	subtitleStyle(patch: Partial<SubtitleStyle>): void;

	/**
	 * Inject a sidecar subtitle track into the currently-playing item at
	 * runtime — no reload. The player-side foundation for a "search and
	 * download subtitles during playback" feature; the app resolves the
	 * download and hands the kit a URL. Idempotent by `url` + normalised
	 * `language` — adding the same track twice returns the existing entry.
	 * Pass `default: true` to select it immediately via the same cancellable
	 * `beforeSubtitle` path as `subtitle(idx)`.
	 */
	addSubtitleTrack(track: SidecarSubtitleInput, opts?: ActionOptions): KitSubtitleTrack;

	/**
	 * Remove a sidecar subtitle track previously added via
	 * `addSubtitleTrack()`, by id. No-op when `id` is not found. Turns
	 * subtitles off first if the removed track was the active selection.
	 */
	removeSubtitleTrack(id: string, opts?: ActionOptions): void;

	audioTracks(): KitAudioTrack[];

	audioTrack(): CurrentAudioTrackSelection | null;
	audioTrack(idx: number): Promise<void>;

	audioTrackMode(): AudioTrackState;
	audioTrackMode(idx: number): void;

	qualityLevels(): QualityLevel[];
	qualityLevels(opts: { includeUnsupported: true }): QualityLevel[];

	quality(): CurrentQualitySelection | 'auto';
	quality(idx: number | 'auto'): void;

	// ── Playback ──
	// Already required on core's IPlayer — redundant re-declarations kept for
	// doc locality with the video surface.

	time(): number;
	time(seconds: number, opts?: ActionOptions): Promise<void>;

	duration(): number;

	playbackRate(): number;
	playbackRate(rate: number): Promise<void>;

	togglePlayback(opts?: ActionOptions): Promise<void>;
	toggleMute(): void;

	rewind(seconds?: number, opts?: ActionOptions): Promise<void>;
	forward(seconds?: number, opts?: ActionOptions): Promise<void>;

	// ── Playback state ──

	/** Top-level playback state (`'idle'`, `'playing'`, `'paused'`, `'buffering'`, `'ended'`). */
	playState(): PlayState;

	/** Volume gain stage (`'unmuted'`, `'muted'`). */
	volumeState(): VolumeState;

	/**
	 * Read or write the volume level.
	 * `volume()` — current level in [0, 100].
	 * `volume(level)` — set level, clamped to [0, 100].
	 */
	volume(): number;
	volume(level: number): Promise<void>;

	/**
	 * The absolute timeline position, in seconds, that buffered data reaches —
	 * the same frame of reference as `time()` and `duration()`. A scrubber
	 * draws its buffered bar as `buffered() / duration()`. `0` when no backend
	 * is active.
	 */
	buffered(): number;

	// ── Transport ──

	play(opts?: ActionOptions): Promise<void>;
	pause(opts?: ActionOptions): Promise<void>;
	stop(opts?: ActionOptions): Promise<void>;
	/** `opts.startAt` begins the incoming item at an offset (seconds) — the backend starts fetching there. */
	next(opts?: LoadOptions): Promise<void>;
	previous(opts?: LoadOptions): Promise<void>;

	// ── Queue ──

	item(): T | undefined;
	item(target: T | string | number, opts?: LoadOptions): void;

	/** What `next()` would load, without moving the cursor. */
	peekNext(): T | undefined;

	/** What `previous()` would load, without moving the cursor. */
	peekPrevious(): T | undefined;

	/** Number of items in the active queue. */
	queueLength(): number;

	/** Zero-based index of the currently active queue item. `-1` when no item is active. */
	index(): number;

	// ── Queue accessors ──

	/**
	 * Read or replace the queue.
	 * `queue()` — current items as a readonly array.
	 * `queue(items)` — replace queue contents.
	 */
	queue(): ReadonlyArray<T>;
	queue(items: T[], opts?: ActionOptions): void;

	/** Available playback rates exposed by this player instance. */
	playbackRates(): number[];

	// ── Chapters ──

	/** Jump to the chapter at `idx`. Emits `'chapter'`. */
	seekToChapter(idx: number, opts?: ActionOptions): void;

	// ── Segment / window playback ──

	/**
	 * Seek to `startSec` and play; watch for `endSec`, then apply `onEnd`:
	 *
	 * - `'loop'`    — seek back to `startSec`.
	 * - `'hold'`    — pause at `endSec`.
	 * - `'advance'` — emit `'segmentBoundary'` and let playback continue.
	 *
	 * `'segmentBoundary'` is always emitted when the boundary is reached,
	 * regardless of `onEnd` mode. Any previously active segment window is
	 * replaced immediately (no overlap). Call `clearSegment()` to stop
	 * watching without seeking or pausing.
	 *
	 * Designed for: disc-menu state windows (skipToMark equivalent), intro
	 * loops, chapter-range playback, and any other bounded-window use case.
	 * Not disc-specific — the primitive is generic.
	 */
	playSegment(opts: SegmentOptions): void;

	/**
	 * Stop watching the active segment window without seeking or pausing.
	 * A no-op when no segment window is active.
	 */
	clearSegment(): void;
}
