// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { AudioTrack, AuthHeaderProvider, BackendLoaderState, BackendState, HdrOnSdrFallback, IStreamSource, MinimalBackendEventPayload, QualityLevel, SubtitleCueChange, SubtitleTrack } from '@nomercy-entertainment/nomercy-player-core';

import type { HtmlPreloadMode } from '../../types';

/**
 * Asks the player's stream registry whether a consumer registered a factory for
 * this URL. Returns a source to play it with, or `undefined` to let the backend
 * handle the URL the way it always has.
 */
export type StreamResolver = (url: string, contentType?: string) => IStreamSource | undefined;

/**
 * Per-event payload map. Each backend event has a fixed payload shape so
 * `IVideoBackend.on(event, fn)` narrows the listener's parameter type
 * automatically — no `as any` at the call site.
 *
 * `Event` is a DOM-element forwarded event; `void` means the listener
 * receives no payload (still callable with the event-target Event arg —
 * we keep the `?` optional in the listener signature for that case).
 *
 * Extends the kit's `MinimalBackendEventPayload` so the shared
 * `bridgeBackendPlayState` helper (and any other core primitive constrained
 * to the minimal contract) accepts this map directly.
 */
export interface BackendEventPayload extends MinimalBackendEventPayload {
	'loadstart': Event;
	'loadedmetadata': { url: string; kind: string; duration: number };
	'loadeddata': Event;
	'canplay': Event;
	'play': Event;
	/**
	 * Fires when media is actually rendering — after buffering resolves, not
	 * just on element.play(). Use this to hide buffering spinners.
	 */
	'playing': Event;
	'pause': Event;
	'ended': Event;
	'timeupdate': Event;
	'waiting': Event;
	'stalled': Event;
	'ratechange': Event;
	'resize': Event;
	'encrypted': Event;
	'error': Event;
	/**
	 * Element src cleared (manual unload, HMR remount). Listeners use
	 *  this to reset "we're playing" state — element is paused at
	 *  currentTime=0 after this fires.
	 */
	'emptied': Event;
	/**
	 * Active subtitle cues changed. Payload mirrors the kit's
	 *  `SubtitleCueChange`. Fires with `cues: []` when subtitles are
	 *  turned off / between cues.
	 */
	'subtitleCue': SubtitleCueChange;
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

export { BACKEND_LOADER_STATE, BACKEND_STATE } from '@nomercy-entertainment/nomercy-player-core';
export type { BackendLoaderState, BackendState };

export const VIDEO_BACKEND_KIND = {
	HTML5: 'html5',
	MSE: 'mse',
	WEBCODECS: 'webcodecs',
} as const;

/** Video backend kind. */
export type VideoBackendKind = typeof VIDEO_BACKEND_KIND[keyof typeof VIDEO_BACKEND_KIND];

/**
 * Contract every video backend implements. Parallels the audio backend
 * contract so cross-cutting orchestration plugins (transcoding, cast handoff,
 * sync, DRM) can target either backend uniformly.
 *
 * Method conventions match the player class:
 *  - **Stateful = overloaded function:** `volume()` / `volume(level)`
 *  - **Action = verb:** `play()`, `pause()`, `stop()`, `mute()`, `unmute()`
 *  - **Time / position uses `currentTime(seconds)` for seeking** — no `seek` method
 */
export interface IVideoBackend {
	readonly kind: VideoBackendKind;

	/** `true` when the backend consumes `startTime` natively (the kit then skips its post-load seek fallback). */
	readonly canStartAt?: boolean;

	// Lifecycle
	/** `opts.startTime` — begin playback at this offset (seconds); the engine fetches its first data AT the offset rather than seeking after the fact. */
	load(url: string, opts?: { preload?: HtmlPreloadMode; startTime?: number }): Promise<void>;
	unload(): void;
	dispose(): void;

	/**
	 * Wire the provider whose return value goes into the `Authorization`
	 * header of network requests the backend issues itself (hls.js
	 * manifests/segments). Optional — backends without their own network
	 * stack omit it.
	 */
	setAuthHeaderProvider?(provider: AuthHeaderProvider): void;

	/**
	 * Wire the lookup that asks the player's stream registry whether a consumer
	 * has registered a factory for a URL. The backend calls it before its own
	 * HLS and progressive handling, and falls through to that handling when the
	 * lookup returns nothing, so a player with no registered factory behaves
	 * exactly as it did before. Optional — backends with no registry omit it.
	 */
	setStreamResolver?(resolver: StreamResolver): void;

	/**
	 * Consumer policy for an all-HDR item on a display that can't show HDR and
	 * a backend that can't tone-map it. Optional — backends that never face the
	 * question (no HDR-aware ABR) omit it. `NMVideoPlayer` pushes `options.hdrOnSdr`
	 * here once, at backend construction; unset means the backend's own default.
	 */
	setHdrOnSdrFallback?(fallback: HdrOnSdrFallback): void;

	// Transport
	play(): Promise<void>;
	pause(): void;
	stop(): void;

	// Time / position
	currentTime(): number;
	currentTime(seconds: number): void;
	duration(): number;
	/**
	 * The absolute timeline position, in seconds, that buffered data reaches.
	 * Not a duration ahead of the playhead, and not a fraction: a scrubber
	 * draws its buffered bar as `buffered() / duration()`, the same frame of
	 * reference `currentTime()` and `duration()` use.
	 *
	 * Contiguous from the playhead. The frontier is the end of the range the
	 * playhead is inside, so a range on the far side of a hole does not count
	 * towards it — a seek back an hour leaves `[0, 90]` and `[3500, 3600]`
	 * with the playhead at 5, and a bar drawn to 3600 promises an hour of
	 * buffer over a stretch that holds none.
	 *
	 * When nothing is buffered ahead — the playhead sits in a hole, or before
	 * the first range — the answer is the playhead's own position, which draws
	 * no bar ahead of it. `0` when no data is buffered at all.
	 */
	buffered(): number;
	bufferedRanges(): TimeRanges;
	seekable(): TimeRanges;
	playbackRate(): number;
	playbackRate(rate: number): void;

	// Volume
	volume(): number;
	volume(level: number): void;
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

	/**
	 * Live throughput estimate in bits per second, as reported by the
	 * underlying stream engine (hls.js's EWMA `bandwidthEstimate`). Optional —
	 * native/progressive playback has no stream-engine estimate to report, so
	 * backends without one omit this method entirely. The kit's `bandwidth()`
	 * probes for it structurally and falls back to `0` when absent.
	 *
	 * Returns `0` (never `undefined`, never `NaN`) when the backend is
	 * present but has no live estimate yet — e.g. before an HLS instance has
	 * been constructed for the current load.
	 */
	bandwidthEstimate?(): number;

	// State
	state(): BackendState;

	// Raw element access — cast SDKs and other low-level integrations bind here
	mediaElement(): HTMLVideoElement;

	// MediaStream capture — clip / record plugins consume this
	captureStream(): MediaStream;

	// Audio output device routing
	setSinkId(deviceId: string): Promise<void>;
	getSinkId(): string;

	// Web Audio graph tap — mirrors IAudioBackend's outputNode / analysisNode.
	// Optional: only implemented when the consumer wants visualizer access.
	// The implementation is lazy (AudioContext created on first call), so
	// backends that are never tapped pay zero Web Audio cost.

	/**
	 * Returns the tail of the backend's Web Audio graph — a GainNode whose
	 * output flows to `ctx.destination` by default. `AudioGraphPlugin` disconnects
	 * this baseline routing and rewires it through its effect chain on `use()`.
	 *
	 * The returned node is in the same `AudioContext` as `analysisNode`.
	 * Create the graph lazily: first call builds it; subsequent calls with the
	 * same `ctx` return the cached node.
	 */
	outputNode?(ctx: AudioContext): AudioNode;

	/**
	 * Returns the raw audio source node BEFORE the volume GainNode.
	 *
	 * `AudioGraphPlugin` taps the `AnalyserNode` upstream of the volume control
	 * so that spectrum/FFT magnitudes are volume-independent. Optional — backends
	 * that do not maintain an explicit pre-volume source node omit this;
	 * `AudioGraphPlugin` falls back to `outputNode` when it is absent.
	 *
	 * The returned node must be in the same `AudioContext` as `outputNode`.
	 */
	analysisNode?(ctx: AudioContext): AudioNode;

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
