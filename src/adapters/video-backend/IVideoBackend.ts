

import type { AudioTrack, QualityLevel, SubtitleTrack } from '@nomercy-entertainment/nomercy-player-core';

/**
 * Per-event payload map. Each backend event has a fixed payload shape so
 * `IVideoBackend.on(event, fn)` narrows the listener's parameter type
 * automatically — no `as any` at the call site.
 *
 * `Event` is a DOM-element forwarded event; `void` means the listener
 * receives no payload (still callable with the event-target Event arg —
 * we keep the `?` optional in the listener signature for that case).
 */
export interface BackendEventPayload {
	loadstart: Event;
	loadedmetadata: { url: string; kind: string; duration: number };
	loadeddata: Event;
	canplay: Event;
	play: Event;
	pause: Event;
	ended: Event;
	timeupdate: Event;
	waiting: Event;
	stalled: Event;
	ratechange: Event;
	resize: Event;
	encrypted: Event;
	error: Event;
	/** Element src cleared (manual unload, HMR remount). Listeners use
	 *  this to reset "we're playing" state — element is paused at
	 *  currentTime=0 after this fires. */
	emptied: Event;
	/** Active subtitle cues changed. Payload mirrors the kit's
	 *  `SubtitleCueChange`. Fires with `cues: []` when subtitles are
	 *  turned off / between cues. */
	subtitleCue: import('@nomercy-entertainment/nomercy-player-core').SubtitleCueChange;
	/**
	 * A non-fatal or escalated HLS error. `fatal: false` means the stream
	 * is continuing; `fatal: true` means recovery was attempted but all
	 * retries were exhausted and the player will emit a top-level `error`
	 * event next.
	 */
	'stream:error': { details: string; fatal: boolean; message?: string; rawCodec?: string };
	/**
	 * The backend is about to retry after a fatal HLS error. Consumers can
	 * use this to show a loading / reconnecting indicator.
	 * `attempt` is 1-based; `maxAttempts` is the ceiling for this error type.
	 */
	'stream:recovering': { details: string; attempt: number; maxAttempts: number };
	/**
	 * HLS quality levels became available (MANIFEST_PARSED + LEVEL_LOADED).
	 * Fires whenever the level list changes — initial manifest, after a
	 * CEA-608 fallback reload, or after a stream switch. Overlay plugins
	 * subscribe here instead of polling `qualityLevels()` at `mediaReady`
	 * because the list may not be populated until after the manifest is parsed.
	 */
	'levels': { levels: QualityLevel[] };
	/**
	 * HLS switched to a different quality level. `level` is the new index.
	 * Fires on every ABR-driven switch as well as on explicit `setQuality()` calls.
	 */
	'level-switched': { level: number };
	/**
	 * Audio track list became available. Fires after MANIFEST_PARSED when the
	 * manifest declares multiple audio renditions.
	 */
	'audioTracks': { tracks: AudioTrack[] };
}

/** Backend-internal events forwarded to the player's eventTarget. */
export type BackendEvent = keyof BackendEventPayload;

// `SubtitleCue` / `SubtitleCueChange` types are owned by the kit
// (`@nomercy-entertainment/nomercy-player-core`) so every backend +
// every consumer (overlay plugins, debug widgets, accessibility tools)
// shares one canonical shape regardless of source. Re-exported here
// for ergonomic access from backend implementations.
export type { SubtitleCue, SubtitleCueChange } from '@nomercy-entertainment/nomercy-player-core';

/** Backend lifecycle state. Returned by `state()`. */
export type BackendState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';

/** Loader state — used for backpressure when an upstream gate needs the buffer to drain. */
export type BackendLoaderState = 'running' | 'paused';

/** Video backend kind. */
export type VideoBackendKind = 'html5' | 'mse' | 'webcodecs';

/**
 * Contract every video backend implements. Parallels the audio backend
 * contract so cross-cutting orchestration plugins (transcoding, cast handoff,
 * sync, DRM) can target either backend uniformly.
 *
 * Method conventions match the player class:
 *  - **Stateful = overloaded function:** `volume()` / `volume(v)`
 *  - **Action = verb:** `play()`, `pause()`, `stop()`, `mute()`, `unmute()`
 *  - **Time / position uses `currentTime(t)` for seeking** — no `seek` method
 */
export interface IVideoBackend {
	readonly kind: VideoBackendKind;

	// Lifecycle
	load(url: string, opts?: { preload: 'auto' | 'metadata' | 'none' }): Promise<void>;
	unload(): void;
	dispose(): void;

	// Transport
	play(): Promise<void>;
	pause(): void;
	stop(): void;

	// Time / position
	currentTime(): number;
	currentTime(t: number): void;
	duration(): number;
	buffered(): number;
	bufferedRanges(): TimeRanges;
	seekable(): TimeRanges;
	playbackRate(): number;
	playbackRate(rate: number): void;

	// Volume
	volume(): number;
	volume(v: number): void;
	mute(): void;
	unmute(): void;

	// Video-specific
	videoWidth(): number;
	videoHeight(): number;
	audioTracks(): AudioTrack[];
	setAudioTrack(idx: number): void;
	subtitleTracks(): SubtitleTrack[];
	setSubtitleTrack(idx: number | null): void;
	qualityLevels(): QualityLevel[];
	qualityLevels(opts: { includeUnsupported: true }): QualityLevel[];
	setQuality(idx: number | 'auto'): void;
	/**
	 * The level index the backend is actually playing right now. Returns -1
	 * when no HLS source is bound, when no level has been selected yet, or
	 * when the backend isn't level-aware. UI plugins read this to surface the
	 * playing quality without waiting for the next `level-switched` event.
	 */
	currentLevel(): number;

	// State
	state(): BackendState;

	// Raw element access — cast SDKs and other low-level integrations bind here
	mediaElement(): HTMLVideoElement;

	// MediaStream capture — clip / record plugins consume this
	captureStream(): MediaStream;

	// Audio output device routing
	setSinkId(deviceId: string): Promise<void>;
	getSinkId(): string;

	// EME / DRM
	mediaKeys(): MediaKeys | undefined;
	setMediaKeys(keys: MediaKeys): Promise<void>;
	outputProtectionState(): 'unrestricted' | 'restricted' | 'unsupported';

	// Loader backpressure
	pauseLoader(): void;
	resumeLoader(): void;
	loaderState(): BackendLoaderState;

	// Events — generic on the event name so each listener gets the
	// correct payload type. Backends emit through the same map.
	on<E extends BackendEvent>(event: E, fn: (data?: BackendEventPayload[E]) => void): void;
	off<E extends BackendEvent>(event: E, fn: (data?: BackendEventPayload[E]) => void): void;
}
