// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { AudioTrack, HdrOnSdrFallback, QualityLevel, SubtitleTrack, IStreamSource} from '@nomercy-entertainment/nomercy-player-core';
import type { HtmlPreloadMode } from '../../types';
import type { StreamResolver } from './IVideoBackend';
import type { BackendEventPayload, BackendState, IVideoBackend, SubtitleCue, SubtitleCueChange } from './IVideoBackend';
import {
	abrCeiling,
	appendAuthTokenParam,
	createAuthorizationXhrSetup,
	destroyHlsInstance,
	detectDisplayHdr,
	hdrDecision,
	isHls,
	MediaElementBackend,
	MediaFormatError,
	mediaFormatError,
	panePixels,
	resetMediaElement,
	sizeAbrCeiling,
	supportsNativeHls,
} from '@nomercy-entertainment/nomercy-player-core';
import { isMediaAbsentStatus, MEDIA_ABSENT, SOURCE_OUTAGE_BACKOFF_MS, sourceOutageRetryLimit } from './source-outage';

interface HlsLevel {
	attrs?: { 'CODECS'?: string; 'VIDEO-RANGE'?: string };
	bitrate?: number;
	height?: number;
	width?: number;
	frameRate?: number;
	name?: string;
}

interface HlsAudioTrack {
	lang?: string;
	name?: string;
	default?: boolean;
}

interface HlsSubtitleTrack {
	name?: string;
	lang?: string;
	default?: boolean;
	forced?: boolean;
	url?: string;
}

interface HlsConstructor {
	new(config?: Record<string, unknown>): HlsInstance;
	isSupported?(): boolean;
	Events: Record<string, string>;
	ErrorTypes: Record<string, string>;
}

interface HlsInstance {
	levels: HlsLevel[];
	audioTracks: HlsAudioTrack[];
	subtitleTracks: HlsSubtitleTrack[];
	audioTrack: number;
	subtitleTrack: number;
	currentLevel: number;
	/**
	 * Level being loaded right now. Populated earlier than `currentLevel`
	 *  (set when ABR picks; `currentLevel` only updates after the fragment
	 *  finishes loading). Used as a fallback for `currentLevel === -1`.
	 */
	loadLevel: number;
	/**
	 * Forces the next segment fetch to the given level index regardless of
	 * what ABR would have chosen. Setting to `-1` returns to ABR control.
	 * Used for HDR → SDR emergency switching when the display changes.
	 */
	nextLevel: number;
	/**
	 * Caps the maximum level ABR is allowed to auto-select. `-1` means
	 * uncapped (all levels eligible). Used to restrict ABR to SDR-only
	 * levels when the active display cannot render HDR.
	 *
	 * Note: when HDR and SDR levels are interleaved by index (e.g. Cosmos
	 * Laundromat: 0=SDR-2M, 1=HDR-2M, 2=SDR-4M, …), capping by max index
	 * alone is insufficient. `_applyAbrConstraints` supplements this with a
	 * `nextLevel` force-switch when the current level is an HDR variant.
	 *
	 * Written from exactly one place, `_applyAbrConstraints`, which merges the
	 * dynamic-range ceiling and the pane-size ceiling before it assigns. Two
	 * writers would race on the first resize.
	 */
	autoLevelCapping: number;

	/**
	 * hls.js's own EWMA throughput estimate, in bits per second. Recomputed
	 * on every fragment load (`abr-controller`'s fast/slow EWMA blend).
	 * Populated from `abrEwmaDefaultEstimate` before the first fragment
	 * lands, so it is always a number once the instance exists — never
	 * `undefined` mid-stream.
	 */
	bandwidthEstimate?: number;

	on(event: string, fn: (event: string, data: any) => void): void;
	attachMedia(el: HTMLVideoElement): void;
	loadSource(url: string): void;
	detachMedia(): void;
	destroy(): void;
	startLoad(): void;
	stopLoad(): void;
	recoverMediaError(): void;
}

const CODEC_LABELS: Array<[RegExp, string]> = [
	[/avc1|h264/i, 'H.264'],
	[/hvc1|hev1|h265/i, 'H.265 (HEVC)'],
	[/av01/i, 'AV1'],
	[/vp09|vp9/i, 'VP9'],
	[/vp8/i, 'VP8'],
	[/mp4a\.40/i, 'AAC'],
	[/mp4a\.6b/i, 'MP3'],
	[/ac-3|ec-3/i, 'Dolby Audio'],
	[/opus/i, 'Opus'],
	[/flac/i, 'FLAC'],
];

function humanCodec(raw: string): string {
	const parts = raw.split(',').map(segment => segment.trim());
	const labels = parts.map((part) => {
		for (const [re, label] of CODEC_LABELS) {
			if (re.test(part))
				return label;
		}
		return part;
	});
	const unique = Array.from(new Set(labels));
	return unique.join(' + ');
}

/**
 * Default video backend. Wraps an `<HTMLVideoElement>` for transport.
 *
 * HLS support: native pass-through when `canPlayType` reports support
 * (Safari / iOS), otherwise dynamically imports `hls.js` (peer dep — not
 * bundled; IIFE build externalises it as `window.Hls`, ESM build resolves
 * it from the consumer's node_modules) and attaches it. MSE / WebCodecs
 * backends ship later.
 */
export class Html5VideoBackend
	extends MediaElementBackend<HTMLVideoElement, BackendEventPayload>
	implements IVideoBackend {
	readonly kind = 'html5' as const;

	private hls: HlsInstance | undefined;
	private currentUrl: string | undefined;
	private _state: BackendState = 'idle';
	private _hadError = false;
	private _ended = false;
	/**
	 * Listener attached to the active `TextTrack` so we can detach on track
	 * switch / dispose without rebuilding the rest of the listeners map.
	 */
	private cueChangeHandler: (() => void) | null = null;

	/**
	 * Codec → supported flag. Populated asynchronously after MANIFEST_PARSED.
	 *  Keys are CODECS attribute strings from HLS level attributes.
	 */
	private _capabilityCache = new Map<string, boolean>();

	// ── HLS error-recovery state ──
	/**
	 * Retry count for the current fatal network-error sequence. Reset on
	 *  successful playback resume.
	 */
	private _netRetryCount = 0;
	/**
	 * Timestamp (ms) when the first media-error recovery was attempted.
	 *  Used to detect a second media error within the 5-second escalation window.
	 */
	private _mediaRecoveryStartMs = 0;
	/** Timer handle for exponential back-off retries. Cleared on unload/dispose. */
	private _retryTimer: ReturnType<typeof setTimeout> | undefined;
	/**
	 * Whether this outage already failed below the HTTP layer, which is what
	 * tells a restarting server's 404 apart from a video that is genuinely gone.
	 */
	private _sawConnectionFailure = false;
	/**
	 * True while the ladder is riding out a source the server stopped serving.
	 *
	 * The backend is the first thing a consumer has that learns the origin is
	 * gone: it asks for bytes constantly, while a realtime socket through the
	 * same tunnel can stay up long after the server behind it died. An app
	 * watches this to raise its own server-offline screen on the player's
	 * evidence rather than waiting for a socket that may never drop.
	 */
	private _recoveringFromOutage = false;
	/** Retries the moment the device has a route again, rather than waiting out a rung. */
	private _onlineHandler: (() => void) | undefined;

	// ── Web Audio graph ──────────────────────────────────────────────────────
	private _sourceNode?: MediaElementAudioSourceNode;
	private _sourceCtx?: AudioContext;
	private _analyserNode?: AnalyserNode;
	private _outputGain?: GainNode;

	// ── HDR-aware ABR state ──
	/**
	 * Dynamic-range constraint strategy for HLS.js ABR.
	 *
	 * On manifests that carry both SDR and HDR (PQ/HLG) level variants —
	 * e.g. Cosmos Laundromat (7 resolution tiers × SDR + HDR = 14 levels) —
	 * HLS.js ABR is oblivious to display capability and can freely pick a PQ
	 * variant on an SDR display (colours look washed out). This block wires
	 * three responses:
	 *
	 *   1. Constraint on load  — after MANIFEST_PARSED, if the display is SDR
	 *      the highest-SDR-level index is stored in `autoLevelCapping` so ABR
	 *      never selects above it. For interleaved manifests (HDR index < SDR
	 *      index at the same resolution) `nextLevel` force-switches away from
	 *      any currently-playing HDR variant to its SDR peer.
	 *
	 *   2. Live display flip   — matchMedia `change` listener (wired in the
	 *      constructor, torn down in dispose). On SDR→HDR: lift the cap and
	 *      optionally prefer a PQ peer at the same resolution. On HDR→SDR:
	 *      cap + force-switch the playing level if it is a PQ variant.
	 *
	 *   3. Audio continuity    — switching levels via `nextLevel` is seamless
	 *      when the new level shares the same audio group ID, which HLS.js
	 *      ensures for well-formed manifests (same resolution tier). No extra
	 *      audio continuity guard is needed here.
	 */
	/** Whether the active display reported HDR capability at the last check. */
	private _displayHdr: boolean = false;
	/**
	 * Per-level SDR/HDR classification. Populated after each MANIFEST_PARSED.
	 * Index matches `hls.levels[i]`. `true` = HDR (PQ or HLG), `false` = SDR.
	 */
	private _levelIsHdr: boolean[] = [];
	/**
	 * matchMedia query for display HDR capability. Tracked so we can remove
	 *  the listener on dispose without leaking the closure.
	 */
	private _hdrMql: MediaQueryList | undefined;
	/**
	 * Bound listener for `_hdrMql` change events. Stored so we can call
	 *  `removeEventListener` with the same reference on dispose.
	 */
	private _hdrMqlListener: (() => void) | undefined;
	/**
	 * Consumer policy for an all-HDR item on an SDR display, pushed in by
	 * `NMVideoPlayer` via `setHdrOnSdrFallback`. `undefined` until then —
	 * `hdrDecision`'s own default (`'play'`) applies at read time.
	 */
	private _hdrOnSdrFallback: HdrOnSdrFallback | undefined;
	/**
	 * Observer on the media element, so the ceiling follows a window drag, a
	 * fullscreen toggle and an orientation change. The facade's own observer
	 * feeds the `videoRect` event on `NMVideoPlayer` and the backend holds no
	 * reference to the facade, so the size signal is re-derived here.
	 */
	private _paneObserver: ResizeObserver | undefined;
	/**
	 * Pending coalesced re-apply. A drag fires the observer on every frame and
	 * every `autoLevelCapping` write is a decision ABR has to react to, so the
	 * burst collapses into one apply.
	 */
	private _paneReapplyTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(container: HTMLElement) {
		const existing = container.querySelector<HTMLVideoElement>('video');
		let element: HTMLVideoElement;
		let ownsElement: boolean;
		if (existing) {
			element = existing;
			ownsElement = false;
		}
		else {
			element = container.ownerDocument.createElement('video');
			container.appendChild(element);
			ownsElement = true;
		}
		super(element, ownsElement, 'html5');
		this.wireElementEvents();
		this._wireHdrMatchMedia();
		this._wirePaneResizeObserver();
	}

	// ── Lifecycle ──

	/**
	 * `startTime` is consumed natively (declared via `canStartAt`): the hls.js
	 * path maps it to `startPosition` so the FIRST fragment fetched is the one
	 * containing the offset — fragment 0 is never requested. The native /
	 * progressive path sets `element.currentTime` once metadata arrives.
	 */
	readonly canStartAt: boolean = true;

	async load(url: string, opts?: { preload?: HtmlPreloadMode; startTime?: number }): Promise<void> {
		this.currentUrl = url;
		this._hadError = false;
		this._ended = false;
		this._state = 'loading';
		this.emit('loadstart');

		if (opts?.preload)
			this.element.preload = opts.preload;

		const hlsUrl = isHls(url);
		const nativeHls = supportsNativeHls(this.element);

		// Tear down any previous Hls instance BEFORE wiring a new source.
		// Without this, every load() leaks an Hls that keeps polling segment 0
		// against the same media element — symptom: thousands of identical
		// fragment requests after a single playlist switch.
		if (this.hls) {
			destroyHlsInstance(this.hls);
			this.hls = undefined;
			this.hlsInstance = undefined;
		}

		// Clear cues from every existing TextTrack on the element. The
		// HTML5 textTracks list survives `src` changes — HLS.js / native
		// renderers keep adding cues on top of whatever was already there,
		// so without this the second load() through Nth load() see a cue
		// stream that's the union of every previous item's subtitles.
		// Symptom: subtitle cues from a previously-loaded item appear
		// when watching a different item. Removing cues here keeps each
		// load's text-track state clean.
		const tt = this.element.textTracks;
		if (tt) {
			for (let i = 0; i < tt.length; i++) {
				const track = tt[i]!;
				const cues = track.cues;
				if (!cues)
					continue;
				// removeCue mutates the live list — snapshot first.
				const snap = Array.from(cues);
				for (const cue of snap) {
					try { track.removeCue(cue); }
					catch { /* defensive — some browsers refuse for active cues */ }
				}
			}
		}

		// Pause and drop the src so the element resets to HAVE_NOTHING before
		// the new MSE pipeline is wired. `element.load()` on a srcless element
		// forces the browser to synchronously reset its internal state machine
		// (clearing the `ended` flag, draining any queued "load" tasks from the
		// previous detachMedia + removeAttribute pair) without causing the
		// black-frame gap — that gap only occurs when load() is called while
		// the element still holds the previous src. Here the src is already
		// gone, so `load()` is a clean reset with no visible side-effect.
		// Without this reset, Chrome defers `sourceopen` on the new MediaSource
		// until its internal "ended" cleanup task runs — that deferred task is
		// what produces the ~8 s stall on auto-advance.
		resetMediaElement(this.element);

		performance.mark('nm:backend:load:start');
		const headerValue = this._authHeaderProvider?.(url);

		// A consumer's factory is asked first, because the branches below cover
		// only HLS and whatever the element itself decodes. Nothing registered
		// means nothing returned, and the built-in path runs untouched.
		if (this._customSource) {
			this._customSource.destroy();
			this._customSource = undefined;
		}

		const customSource = this._streamResolver?.(url);
		if (customSource) {
			this._customSource = customSource;
			await customSource.attach(this.element);
			this._state = 'ready';
			performance.mark('nm:backend:load:end');
			return;
		}

		if (hlsUrl && !nativeHls) {
			const { default: Hls } = await import('hls.js');

			if (!Hls?.isSupported?.()) {
				this._state = 'error';
				throw new MediaFormatError({
					code: 'core:media/hls-unsupported',
					severity: 'error',
					scope: { kind: 'backend', id: 'html5' },
					message: 'Html5VideoBackend: HLS playback unsupported in this environment.',
					suggestion: 'Use a Chromium-based browser, Safari, or Firefox 119+ for HLS support.',
				});
			}
			const hlsInstance: HlsInstance = new Hls({
				autoStartLoad: true,
				enableWorker: true,
				lowLatencyMode: false,
				enableCEA708Captions: true,
				startPosition: typeof opts?.startTime === 'number' && opts.startTime > 0 ? opts.startTime : -1,
				startFragPrefetch: true,
				xhrSetup: createAuthorizationXhrSetup(this._authHeaderProvider),
			});
			this.hls = hlsInstance;
			this.hlsInstance = hlsInstance;
			hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
				performance.mark('nm:backend:manifest-parsed');
				this._emitHlsTrackLists();
			});

			performance.mark('nm:backend:loadSource');
			hlsInstance.loadSource(url);
			performance.mark('nm:backend:attachMedia');
			hlsInstance.attachMedia(this.element);
			this._attachHlsErrorHandler(Hls, url);
			this._attachHlsLevelSwitchedHandler(Hls);
		}
		else {
			this.element.src = appendAuthTokenParam(url, headerValue);
			try { this.element.load(); }
			catch { /* defensive */ }
		}

		performance.mark('nm:backend:waitForLoadedMetadata:start');
		await this.waitForLoadedMetadata();
		performance.mark('nm:backend:waitForLoadedMetadata:end');

		// Native-HLS / progressive path: no hls.js startPosition available, so
		// position the element as soon as metadata is in. The browser then only
		// fetches data around the offset (range requests / native HLS engine).
		if (!this.hls && typeof opts?.startTime === 'number' && opts.startTime > 0) {
			try { this.element.currentTime = opts.startTime; }
			catch { /* defensive — some engines refuse pre-canplay seeks */ }
		}

		this._state = 'ready';
		this.emit('loadedmetadata', { url, kind: this.kind, duration: this.element.duration });
	}

	unload(): void {
		this._state = 'idle';
		this._ended = false;
		this._resetRecoveryState();
		// Drop any active subtitle textTrack listener — the new source
		// will repopulate `textTracks` and consumers will pick a track
		// again via `setSubtitleTrack`.
		this.detachActiveTextTrack();
		if (this.hls) {
			destroyHlsInstance(this.hls);
			this.hls = undefined;
			this.hlsInstance = undefined;
		}
		resetMediaElement(this.element);
		this.currentUrl = undefined;
		this.emitEmptySubtitleCue();
		this.emit('waiting');
	}

	dispose(): void {
		if (this._retryTimer !== undefined) {
			clearTimeout(this._retryTimer);
			this._retryTimer = undefined;
		}
		this._teardownHdrMatchMedia();
		this._teardownPaneResizeObserver();
		this._teardownAudioGraph();
		this.unload();
		this.detachDomBridges(this.element);
		if (this.ownsElement && this.element.parentNode) {
			this.element.parentNode.removeChild(this.element);
		}
	}

	private _teardownAudioGraph(): void {
		try { this._sourceNode?.disconnect(); }
		catch { /* defensive */ }
		try { this._analyserNode?.disconnect(); }
		catch { /* defensive */ }
		try { this._outputGain?.disconnect(); }
		catch { /* defensive */ }
		this._sourceNode = undefined;
		this._analyserNode = undefined;
		this._outputGain = undefined;
		this._sourceCtx = undefined;
	}

	// ── Transport, time, volume — inherited from MediaElementBackend ──
	// play / pause / stop / currentTime / duration / bufferedRanges / seekable /
	// playbackRate / volume / mute / unmute / captureStream / setSinkId /
	// getSinkId / mediaKeys / setMediaKeys / mediaElement / pauseLoader /
	// resumeLoader / loaderState / setAuthHeaderProvider

	private _streamResolver?: StreamResolver;
	private _customSource?: IStreamSource;

	/**
	 * Wire the lookup that asks the player's stream registry for a consumer's
	 * factory. Without it the backend keeps its own HLS and progressive handling
	 * and a registered factory is never consulted.
	 */
	setStreamResolver(resolver: StreamResolver): void {
		this._streamResolver = resolver;
	}

	// ── Time / position (video-specific: buffered uses currentTime walk) ──

	buffered(): number {
		const ranges = this.element.buffered;
		const currentTime = this.element.currentTime;
		for (let i = 0; i < ranges.length; i += 1) {
			if (currentTime >= ranges.start(i) && currentTime <= ranges.end(i))
				return ranges.end(i);
		}
		if (ranges.length === 0)
			return 0;
		// Past every range → clamp to the buffered max; in a gap or before the
		// first range → nothing is buffered ahead of the playhead.
		const lastEnd = ranges.end(ranges.length - 1);
		return currentTime > lastEnd ? lastEnd : currentTime;
	}

	// ── Video-specific ──

	videoWidth(): number {
		return this.element.videoWidth;
	}

	videoHeight(): number {
		return this.element.videoHeight;
	}

	audioTracks(): AudioTrack[] {
		// HLS-managed sources: hls.audioTracks gives language + name.
		if (this.hls?.audioTracks?.length) {
			return this.hls.audioTracks.map((hlsAudioTrack, index) => ({
				id: `audio-${index}`,
				language: hlsAudioTrack.lang ?? undefined,
				label: hlsAudioTrack.name ?? `Track ${index + 1}`,
				default: hlsAudioTrack.default === true,
			}));
		}
		// Native: HTMLMediaElement.audioTracks (Safari/Chrome with multi-audio).
		const nativeTracks = (this.element as unknown as { audioTracks?: { length: number; [k: number]: { id: string; language: string; label: string; enabled: boolean } } }).audioTracks;
		if (nativeTracks && nativeTracks.length > 0) {
			const out: AudioTrack[] = [];
			for (let i = 0; i < nativeTracks.length; i++) {
				const track = nativeTracks[i]!;
				out.push({
					id: track.id || `audio-${i}`,
					language: track.language || undefined,
					label: track.label || `Track ${i + 1}`,
					default: track.enabled,
				});
			}
			return out;
		}
		return [];
	}

	setAudioTrack(idx: number): void {
		if (this.hls && typeof idx === 'number') {
			this.hls.audioTrack = idx;
			return;
		}
		const nativeTracks = (this.element as unknown as { audioTracks?: { length: number; [k: number]: { enabled: boolean } } } /* non-standard HTMLMediaElement.audioTracks, absent from lib.dom */).audioTracks;
		if (nativeTracks) {
			for (let i = 0; i < nativeTracks.length; i++) {
				nativeTracks[i]!.enabled = i === idx;
			}
		}
	}

	subtitleTracks(): SubtitleTrack[] {
		if (this.hls?.subtitleTracks?.length) {
			return this.hls.subtitleTracks.map((hlsSubtitleTrack, index) => ({
				id: `subtitle-${index}`,
				language: hlsSubtitleTrack.lang ?? undefined,
				label: hlsSubtitleTrack.name ?? `Subtitles ${index + 1}`,
				kind: 'subtitles' as const,
				url: hlsSubtitleTrack.url ?? '',
				default: hlsSubtitleTrack.default === true,
			}));
		}
		const tt = this.element.textTracks;
		if (!tt || tt.length === 0)
			return [];
		const out: SubtitleTrack[] = [];
		for (let i = 0; i < tt.length; i++) {
			const track = tt[i]!;
			if (track.kind !== 'subtitles' && track.kind !== 'captions')
				continue;
			out.push({
				id: track.id || `subtitle-${i}`,
				language: track.language || undefined,
				label: track.label || `Subtitles ${i + 1}`,
				kind: track.kind === 'captions' ? 'captions' : 'subtitles',
				url: '',
				default: track.mode === 'showing',
			});
		}
		return out;
	}

	setSubtitleTrack(idx: number | null): void {
		// Detach any previous track listener regardless of new selection;
		// switching tracks (or to "off") must release the prior cuechange
		// hook so it doesn't keep emitting stale cues.
		this.detachActiveTextTrack();

		// Tell HLS.js which subtitle track to demux. `-1` disables the
		// HLS subtitle pipeline entirely (cues stop being fed into the
		// element's textTrack list).
		if (this.hls)
			this.hls.subtitleTrack = idx ?? -1;

		if (idx === null || idx < 0) {
			this.disableAllSubtitleTextTracks();
			this.emitEmptySubtitleCue();
			return;
		}

		// Resolve the matching `TextTrack`. For native HLS, HLS.js
		// drives `track.mode` — but we want the browser NOT to paint
		// natively (renderers consume `subtitleCue` events) so we hold
		// the active track at `mode: 'hidden'` (cues fire `cuechange`,
		// browser doesn't paint), and disable the rest.
		const target = this.resolveSubtitleTextTrack(idx);
		const tt = this.element.textTracks;
		if (tt) {
			for (let i = 0; i < tt.length; i++) {
				const track = tt[i]!;
				if (track.kind !== 'subtitles' && track.kind !== 'captions')
					continue;
				track.mode = track === target ? 'hidden' : 'disabled';
			}
		}
		if (!target) {
			// Track requested but no matching textTrack yet (HLS.js may
			// still be parsing the WebVTT manifest). Emit empty for now;
			// the cuechange listener will fire once cues arrive.
			this.emitEmptySubtitleCue();
			return;
		}

		const handler = (): void => this.emitActiveCues(target);
		target.addEventListener('cuechange', handler);
		this.cueChangeHandler = (): void => target.removeEventListener('cuechange', handler);

		// Paint the cues that are already active at this moment (cuechange
		// won't fire again until the next boundary).
		this.emitActiveCues(target);
	}

	/**
	 * Match the kit-facing subtitle index back to the underlying
	 * `TextTrack` instance.
	 *
	 * For HLS-managed tracks (`hls.subtitleTracks[idx]`), match against
	 * `element.textTracks` by `language + label`. The catch: HLS streams
	 * with CEA-608 / CEA-708 closed captions embedded in the MPEG-TS
	 * video (e.g. Apple's bipbop-advanced) get auto-extracted by HLS.js
	 * into a `kind: 'captions'` track that often shares the same
	 * `language` and `label` as the WebVTT subtitle track.  Match-by-
	 * lang+label alone ambiguously picks the FIRST one — usually the
	 * CEA captions, which are NOT the same as the WebVTT track the
	 * user selected.  Prefer `kind: 'subtitles'` (WebVTT) over
	 * `kind: 'captions'` (CEA) when both match.
	 *
	 * Native (non-HLS) sources index the textTrack list directly.
	 */
	private resolveSubtitleTextTrack(idx: number): TextTrack | null {
		const tt = this.element.textTracks;
		if (!tt || tt.length === 0)
			return null;

		if (this.hls?.subtitleTracks?.[idx]) {
			const want = this.hls.subtitleTracks[idx];
			let captionsFallback: TextTrack | null = null;
			for (let i = 0; i < tt.length; i++) {
				const track = tt[i]!;
				if (track.kind !== 'subtitles' && track.kind !== 'captions')
					continue;
				const langOk = !want.lang || track.language === want.lang;
				const labelOk = !want.name || track.label === want.name;
				if (!langOk || !labelOk)
					continue;
				if (track.kind === 'subtitles')
					return track;
				if (!captionsFallback)
					captionsFallback = track;
			}
			return captionsFallback;
		}

		// Native: walk subtitle/caption tracks in order and pick the Nth.
		let nth = -1;
		for (let i = 0; i < tt.length; i++) {
			const track = tt[i]!;
			if (track.kind !== 'subtitles' && track.kind !== 'captions')
				continue;
			nth++;
			if (nth === idx)
				return track;
		}
		return null;
	}

	private disableAllSubtitleTextTracks(): void {
		const tt = this.element.textTracks;
		if (!tt)
			return;
		for (let i = 0; i < tt.length; i++) {
			const track = tt[i]!;
			if (track.kind === 'subtitles' || track.kind === 'captions')
				track.mode = 'disabled';
		}
	}

	private detachActiveTextTrack(): void {
		const fn = this.cueChangeHandler;
		this.cueChangeHandler = null;
		if (fn)
			fn();
	}

	/**
	 * Read the active cues off a `TextTrack` and emit them through the
	 * backend's `subtitleCue` channel. Each `VTTCue` is normalised into
	 * the backend-agnostic `SubtitleCue` shape so renderers don't have
	 * to know whether the source was an HLS-fed VTT or a native track.
	 */
	private emitEmptySubtitleCue(): void {
		const change: SubtitleCueChange = { cues: [], language: undefined };
		this.emit('subtitleCue', change);
	}

	private emitActiveCues(tt: TextTrack): void {
		const active = tt.activeCues;
		const cues: SubtitleCue[] = [];
		if (active && active.length > 0) {
			for (let i = 0; i < active.length; i++) {
				cues.push(normaliseVttCue(active[i] as VTTCue));
			}
		}
		const change: SubtitleCueChange = { cues, language: tt.language || undefined };
		this.emit('subtitleCue', change);
	}

	qualityLevels(): QualityLevel[];
	qualityLevels(opts: { includeUnsupported: true }): QualityLevel[];
	qualityLevels(opts?: { includeUnsupported?: true }): QualityLevel[] {
		if (!this.hls?.levels?.length)
			return [];

		type QL = QualityLevel & { supported: boolean };

		const all: QL[] = this.hls.levels.map((level, index) => {
			const codec: string = level.attrs?.CODECS ?? '';
			const cached = this._capabilityCache.get(codec);
			const videoRange: string = (level.attrs?.['VIDEO-RANGE'] ?? '').toUpperCase();
			const dynamicRange: 'sdr' | 'hdr' = (videoRange === 'PQ' || videoRange === 'HLG') ? 'hdr' : 'sdr';
			return {
				bitrate: level.bitrate ?? 0,
				height: level.height ?? undefined,
				width: level.width ?? undefined,
				label: level.name ?? `${level.height ?? '?'}p`,
				index,
				supported: cached ?? true,
				dynamicRange,
			};
		});

		if (opts?.includeUnsupported)
			return all;

		return all.filter(level => level.supported);
	}

	private async _probeCodecCapabilities(): Promise<void> {
		if (!this.hls?.levels?.length)
			return;
		if (typeof navigator?.mediaCapabilities?.decodingInfo !== 'function')
			return;

		const seen = new Set<string>();
		for (const level of this.hls.levels) {
			const codec: string = level.attrs?.CODECS ?? '';
			if (!codec || seen.has(codec) || this._capabilityCache.has(codec))
				continue;
			seen.add(codec);

			const height: number = level.height ?? 1080;
			const width: number = level.width ?? 1920;
			const bitrate: number = level.bitrate ?? 4_000_000;
			const framerate: number = level.frameRate ?? 30;

			try {
				const result = await navigator.mediaCapabilities.decodingInfo({
					type: 'media-source',
					video: {
						contentType: `video/mp4; codecs="${codec}"`,
						width,
						height,
						bitrate,
						framerate,
					},
				});
				this._capabilityCache.set(codec, result.supported);
			}
			catch {
				this._capabilityCache.set(codec, true);
			}
		}
	}

	setQuality(idx: number | 'auto'): void {
		if (!this.hls)
			return;
		this.hls.currentLevel = idx === 'auto' ? -1 : idx;
	}

	currentLevel(): number {
		if (!this.hls)
			return -1;
		// hls.currentLevel returns the variant being played. It can be -1 in
		// the brief window between manifest parse and the first fragment
		// landing; loadLevel is populated earlier (it's the level being
		// fetched right now) so it covers the gap.
		const current = this.hls.currentLevel;
		if (current >= 0)
			return current;
		const loading = this.hls.loadLevel;
		return typeof loading === 'number' ? loading : -1;
	}

	/**
	 * Live throughput estimate in bits per second, read straight off the
	 * active hls.js instance's own EWMA estimator. `0` when no HLS instance
	 * is bound (native/progressive playback, or before `load()` has attached
	 * one) — the kit's public `bandwidth()` treats `0` as "no estimate yet",
	 * so this never reports a stale or fabricated number.
	 */
	bandwidthEstimate(): number {
		return this.hls?.bandwidthEstimate ?? 0;
	}

	// ── State ──

	state(): BackendState {
		if (this._hadError)
			return 'error';
		if (!this.currentUrl)
			return 'idle';
		if (this._state === 'loading')
			return 'loading';
		if (!this.element.paused && !this.element.ended)
			return 'playing';
		if (this.element.paused && this.element.readyState >= 2 && !this._ended)
			return 'paused';
		if (this.element.readyState >= 1)
			return 'ready';
		return this._state;
	}

	// ── Capability surface ──
	// captureStream / setSinkId / getSinkId / mediaKeys / setMediaKeys /
	// mediaElement / pauseLoader / resumeLoader / loaderState
	// — all inherited from MediaElementBackend

	outputProtectionState(): 'unrestricted' | 'restricted' | 'unsupported' {
		// Real HDCP probing requires DRM platform-specific keys. Default
		// 'unrestricted' so plugins can probe without throwing; the DRM
		// plugin overrides this once a key system is wired.
		return 'unrestricted';
	}

	// ── Web Audio graph tap ───────────────────────────────────────────────────

	/**
	 * Returns the tail of the backend's Web Audio graph (a `GainNode` whose
	 * output flows to `ctx.destination` by default). Mirrors
	 * `AudioElementBackend.outputNode` exactly. The graph is built lazily on
	 * first call so backends that are never tapped pay zero Web Audio cost and
	 * the autoplay policy is never triggered ahead of user interaction.
	 *
	 * `AudioGraphPlugin` disconnects the baseline `outputGain → destination`
	 * routing and rewires through its effect chain on `use()`.
	 */
	outputNode(ctx: AudioContext): AudioNode {
		this._ensureAudioGraph(ctx);
		return this._outputGain!;
	}

	/**
	 * Returns the raw `MediaElementAudioSourceNode` — the pre-volume source —
	 * so that `AudioGraphPlugin` can tap the `AnalyserNode` upstream of the
	 * volume fader and produce volume-independent spectrum/FFT magnitudes.
	 */
	analysisNode(ctx: AudioContext): AudioNode {
		this._ensureAudioGraph(ctx);
		return this._sourceNode!;
	}

	/**
	 * Build the minimal Web Audio signal chain lazily:
	 * `MediaElementAudioSourceNode → AnalyserNode → GainNode → destination`.
	 *
	 * Idempotent for the same `ctx`. If called with a different context the old
	 * graph is disconnected and rebuilt (the consumer swapped AudioContext).
	 * The graph mirrors `AudioElementBackend.ensureSourceGraph` so `AudioGraphPlugin`
	 * can treat both backends identically.
	 */
	private _ensureAudioGraph(ctx: AudioContext): void {
		if (this._sourceNode && this._sourceCtx === ctx)
			return;

		if (this._sourceNode && this._sourceCtx !== ctx) {
			try { this._sourceNode.disconnect(); }
			catch { /* defensive */ }
			try { this._analyserNode?.disconnect(); }
			catch { /* defensive */ }
			try { this._outputGain?.disconnect(); }
			catch { /* defensive */ }
		}

		this._sourceCtx = ctx;
		this._sourceNode = ctx.createMediaElementSource(this.element);
		this._analyserNode = ctx.createAnalyser();
		this._outputGain = ctx.createGain();

		this._sourceNode.connect(this._analyserNode);
		this._analyserNode.connect(this._outputGain);

		// Baseline routing: outputGain → destination so audio is audible without
		// any plugin. AudioGraphPlugin disconnects this and re-routes through its
		// effect chain when it takes ownership via outputNode(ctx).
		this._outputGain.connect(ctx.destination);
	}

	// ── Events ──
	// `on`, `off`, `once`, `emit`, `hasListeners` are inherited from
	// `EventEmitter<BackendEventPayload>` — no per-class storage, no
	// per-method casts. The map is generic over the payload map so
	// every call site narrows automatically.

	// ── Internals ──

	/**
	 * Wire video-specific DOM events onto the element, tracking each handler
	 * in `this.domHandlers` (inherited from `MediaElementBackend`) so
	 * `detachDomBridges()` removes them cleanly on dispose.
	 *
	 * Video adds `resize`, `emptied`, `loadeddata`, and error-code mapping
	 * on top of the standard 13 events handled by `attachDomBridgesTo`.
	 * Rather than calling the base helper (which would add state-mutation
	 * handlers appropriate for the audio path), video wires its own full
	 * event set here to keep the custom `ended`/`error` side-effects intact.
	 */
	private wireElementEvents(): void {
		const track = (event: keyof HTMLVideoElementEventMap, handler: EventListener): void => {
			this.element.addEventListener(event, handler);
			this.domHandlers.push({ event, handler });
		};

		track('loadstart', event => this.emit('loadstart', event));
		track('loadeddata', event => this.emit('loadeddata', event));
		track('canplay', event => this.emit('canplay', event));
		track('emptied', event => this.emit('emptied', event));
		track('play', event => this.emit('play', event));
		track('playing', event => this.emit('playing', event));
		track('pause', event => this.emit('pause', event));
		track('timeupdate', event => this.emit('timeupdate', event));
		track('waiting', event => this.emit('waiting', event));
		track('stalled', event => this.emit('stalled', event));
		track('ratechange', event => this.emit('ratechange', event));
		track('resize', event => this.emit('resize', event));
		track('encrypted', (event) => {
			// `MediaKeyMessageEvent` widens to `Event` for the channel —
			// EME consumers cast at the listener if they need the keys.
			this.emit('encrypted', event);
		});
		track('ended', (event) => {
			this._ended = true;
			this.emit('ended', event);
		});
		track('error', (event) => {
			this._hadError = true;
			this._state = 'error';
			// Attach MediaError metadata to the event object so upstream
			// consumers receive the browser's error code without a second
			// element read.
			const mediaErr = this.element.error;
			if (mediaErr !== null) {
				const code = mediaErr.code;
				// Map MediaError.code → v2 typed error code.
				//   1 MEDIA_ERR_ABORTED   → media/aborted
				//   2 MEDIA_ERR_NETWORK   → media/network
				//   3 MEDIA_ERR_DECODE    → media/decode-fatal-variant (try next rendition)
				//   4 MEDIA_ERR_SRC_NOT_SUPPORTED → media/decode-fatal-all
				let v2Code: string;
				switch (code) {
					case 1:
						v2Code = 'media/aborted';
						break;
					case 2:
						v2Code = 'media/network';
						break;
					case 3:
						v2Code = 'media/decode-fatal-variant';
						break;
					default:
						v2Code = 'media/decode-fatal-all';
						break;
				}
				(event as Event & { mediaErrorCode?: number; v2ErrorCode?: string }).mediaErrorCode = code;
				(event as Event & { mediaErrorCode?: number; v2ErrorCode?: string }).v2ErrorCode = v2Code;
			}
			this.emit('error', event);
		});
	}

	// ── HLS error recovery ──

	/** Reset all recovery counters. Call on successful playback resume or unload. */
	private _resetRecoveryState(): void {
		if (this._retryTimer !== undefined) {
			clearTimeout(this._retryTimer);
			this._retryTimer = undefined;
		}
		this._netRetryCount = 0;
		this._mediaRecoveryStartMs = 0;
		this._sawConnectionFailure = false;
		this._recoveringFromOutage = false;
		if (this._onlineHandler !== undefined) {
			globalThis.removeEventListener?.('online', this._onlineHandler);
			this._onlineHandler = undefined;
		}
	}

	/**
	 * True while the ladder is riding out a source the server stopped serving —
	 * see `_recoveringFromOutage`. A consumer probes server reachability on this
	 * so its own offline screen rises from the evidence that arrives first.
	 */
	get isRecoveringFromOutage(): boolean {
		return this._recoveringFromOutage;
	}

	/**
	 * A server that went away is an outage to ride out, not a dead file.
	 *
	 * Escalating after three tries over seven seconds is what made a host
	 * restart read to a viewer as a broken film: the ladder was spent before
	 * the server had finished booting. The budget now matches how long a real
	 * restart takes, and how many rungs a failure earns depends on what it was
	 * — an origin-down status or a refused connection gets all of them, a cold
	 * 4xx gets five, because a URL that is genuinely gone answers the same way
	 * every time and a viewer should be told so rather than shown a spinner.
	 */
	private _rideOutNetworkError(data: { details: string; response?: { code?: number } }): void {
		const httpStatus = data.response?.code ?? 0;
		if (httpStatus === 0)
			this._sawConnectionFailure = true;

		const limit = sourceOutageRetryLimit(httpStatus, this._sawConnectionFailure);

		// The server answered that this item has no media. Waiting cannot change
		// that, and a consumer can act on it — offer the next item — but only if
		// it is told which failure this was, so it gets its own code rather than
		// the generic network one every outage ends with.
		if (isMediaAbsentStatus(httpStatus) && !this._sawConnectionFailure) {
			this._recoveringFromOutage = false;
			this._escalateHlsError(MEDIA_ABSENT, `media absent (HTTP ${httpStatus}): ${data.details}`);
			return;
		}

		if (this._netRetryCount >= limit) {
			// The ladder is spent, but a device that gets a route back later
			// still deserves its session rather than a dead error overlay.
			this._watchForConnectivityReturn();
			this._recoveringFromOutage = false;
			this._escalateHlsError(data.details, `HLS network error after ${limit} retries: ${data.details}`);
			return;
		}

		// An outage on THIS device's side is not evidence that the server is
		// gone, so it must not spend the budget — a two-minute Wi-Fi drop would
		// burn the whole ladder without a single attempt ever having a route to
		// try. Hold at the current rung and let the `online` event take over.
		const deviceOffline = globalThis.navigator?.onLine === false;
		const attempt = this._netRetryCount;
		if (!deviceOffline)
			this._netRetryCount = attempt + 1;
		this._watchForConnectivityReturn();

		this._recoveringFromOutage = true;
		this.emit('stream:recovering', { details: data.details, attempt: attempt + 1, maxAttempts: limit });
		this._retryTimer = setTimeout(() => {
			this._retryTimer = undefined;
			if (!this.hls)
				return;
			try { this.hls.startLoad(); }
			catch { this._escalateHlsError(data.details, `HLS startLoad failed: ${data.details}`); }
		}, SOURCE_OUTAGE_BACKOFF_MS[attempt]);
	}

	/**
	 * Retries the moment the device has a route again, so an outage longer than
	 * the ladder still ends in playback. Without it a Wi-Fi drop that outlasts
	 * the budget leaves the session unrecoverable until the viewer reloads.
	 */
	private _watchForConnectivityReturn(): void {
		if (this._onlineHandler !== undefined)
			return;

		this._onlineHandler = () => {
			// A fresh outage deserves the whole ladder: the attempts spent
			// waiting for the network to come back say nothing about whether
			// the server answers now.
			this._netRetryCount = 0;
			this._sawConnectionFailure = false;
			if (this._retryTimer !== undefined) {
				clearTimeout(this._retryTimer);
				this._retryTimer = undefined;
			}
			try { this.hls?.startLoad(); }
			catch { /* the ladder's next failure reports it; a throw here is not the viewer's problem */ }
		};
		globalThis.addEventListener?.('online', this._onlineHandler);
	}

	/**
	 * Escalate a fatal HLS error to a player-level error event.
	 *
	 * @param details - `HlsErrorData.details` string from hls.js
	 * @param message - Human-readable summary for the error payload
	 */
	private _escalateHlsError(details: string, message: string): void {
		this._hadError = true;
		this._state = 'error';
		this.emit('stream:error', { details, fatal: true });
		// Construct a synthetic error event so the `error` channel stays
		// typed as `Event` (BackendEventPayload contract). Consumers that
		// want the typed PlayerError should listen on `stream:error`.
		const syntheticError = new ErrorEvent('error', { message });
		(syntheticError as ErrorEvent & { hlsDetails?: string }).hlsDetails = details;
		this.emit('error', syntheticError as unknown as Event /* BackendEventPayload['error'] requires Event; ErrorEvent extends Event but emitter overloads narrow to Event */);
	}

	/**
	 * Subscribe to `Hls.Events.ERROR` on the current `this.hls` instance.
	 * Must be called after every HLS instance creation (including the CEA
	 * fallback reload) because hls.js event listeners are per-instance.
	 *
	 * Decision tree per hls.js error semantics:
	 * - Non-fatal → emit `stream:error` with `fatal: false`, no escalation.
	 * - Fatal NETWORK → ride the outage out on `SOURCE_OUTAGE_BACKOFF_MS`,
	 *   for as many rungs as the failure earns. If exhausted, escalate.
	 * - Fatal MEDIA → call `hls.recoverMediaError()`. If a second media
	 *   error fires within 5 s, escalate.
	 * - Fatal MUX / other → destroy + reload via `load()`. If that fails, escalate.
	 *
	 * @param Hls   - The hls.js constructor (carries static `Events` + `ErrorTypes`)
	 * @param url   - The manifest URL, needed for MUX destroy-reload.
	 */
	private _attachHlsErrorHandler(Hls: HlsConstructor, url: string): void {
		if (!this.hls)
			return;
		this.hls.on(Hls.Events.ERROR, (_e: unknown, data: {
			fatal: boolean;
			type: string;
			details: string;
			error?: Error;
			response?: { code?: number };
		}) => {
			if (!data.fatal) {
				if (data.details === 'bufferIncompatibleCodecsError') {
					const raw = data.error?.message ?? '';
					const codecMatch = /codecs=([^,;"]+(?:,[^,;"]+)*)/i.exec(raw);
					const rawCodec = codecMatch?.[1] ?? raw;
					const humanLabel = rawCodec ? humanCodec(rawCodec) : 'unknown codec';
					this.emit('stream:error', {
						details: 'media/codec-not-supported',
						fatal: false,
						message: `Your browser can't decode this video format (${humanLabel}).`,
						rawCodec,
					});
					return;
				}
				this.emit('stream:error', { details: data.details, fatal: false });
				return;
			}

			if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
				this._rideOutNetworkError(data);
			}
			else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
				const now = Date.now();
				if (this._mediaRecoveryStartMs > 0 && (now - this._mediaRecoveryStartMs) < 5_000) {
					// Second media error within 5 s — recovery didn't take, escalate.
					this._escalateHlsError(data.details, `HLS media error unrecoverable: ${data.details}`);
					return;
				}
				this._mediaRecoveryStartMs = now;
				this.emit('stream:recovering', { details: data.details, attempt: 1, maxAttempts: 1 });
				try { this.hls?.recoverMediaError?.(); }
				catch { this._escalateHlsError(data.details, `HLS recoverMediaError threw: ${data.details}`); }
			}
			else {
				// MUX_ERROR or unknown fatal — destroy + reload.
				this.emit('stream:recovering', { details: data.details, attempt: 1, maxAttempts: 1 });
				// Capture the playback position BEFORE the teardown wipes it so
				// the reload resumes where the error hit, not at 0.
				const resumeAt = this.element.currentTime;
				if (this.hls) {
					destroyHlsInstance(this.hls);
				}
				this.hls = undefined;
				this.hlsInstance = undefined;
				// Re-attach via the existing load path. If load() throws, escalate.
				this.load(url, resumeAt > 0 ? { startTime: resumeAt } : undefined).catch(() => {
					this._escalateHlsError(data.details, `HLS fatal after destroy-reload: ${data.details}`);
				});
			}
		});

		// Reset net-retry counter on any successful fragment load — the stream
		// is healthy again, so prior retry attempts shouldn't count toward the cap.
		this.hls.on(Hls.Events.FRAG_LOADED, () => {
			if (this._netRetryCount > 0)
				this._netRetryCount = 0;
		});
	}

	/**
	 * Emit `levels` and `audioTracks` backend events from the current HLS
	 * instance's live lists. Called after every `MANIFEST_PARSED` event so
	 * overlay plugins can update button visibility without polling.
	 *
	 * Also builds the per-level HDR classification table and immediately
	 * applies the ABR constraints for the current display and pane size.
	 */
	private _emitHlsTrackLists(): void {
		if (!this.hls)
			return;

		this._classifyHdrLevels();
		this._applyAbrConstraints(this._displayHdr);

		void this._probeCodecCapabilities().then(() => {
			const levels = this.qualityLevels();
			this.emit('levels', { levels });
		});

		const tracks = this.audioTracks();
		if (tracks.length > 0)
			this.emit('audioTracks', { tracks });
	}

	// ── Display- and pane-aware ABR helpers ──

	/**
	 * Consumer policy for an all-HDR item on an SDR display with no converter.
	 * Pushed once by `NMVideoPlayer` right after construction — see `IVideoBackend`.
	 */
	setHdrOnSdrFallback(fallback: HdrOnSdrFallback): void {
		this._hdrOnSdrFallback = fallback;
	}

	/**
	 * Wire a combined-query matchMedia listener once. The comma joins the two
	 * queries as an OR at the CSS level, so one listener catches a change in
	 * either signal; the boolean answer itself always comes from
	 * `detectDisplayHdr`, which asks them in priority order (video plane
	 * before page) rather than trusting whichever one the event fired for.
	 */
	private _wireHdrMatchMedia(): void {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
			return;

		const mql = window.matchMedia('(video-dynamic-range: high), (dynamic-range: high)');
		this._displayHdr = detectDisplayHdr();
		this._hdrMql = mql;

		const listener = (): void => {
			this._onDisplayHdrChange(detectDisplayHdr());
		};
		this._hdrMqlListener = listener;
		mql.addEventListener('change', listener);
	}

	/**
	 * Watch the media element's box so the pane ceiling follows the layout.
	 *
	 * The element rather than the container: `object-fit` letterboxing means the
	 * container can be wider than the picture, and the picture is what a
	 * rendition has to cover.
	 */
	private _wirePaneResizeObserver(): void {
		if (typeof ResizeObserver === 'undefined')
			return;

		const observer = new ResizeObserver(() => {
			this._schedulePaneReapply();
		});
		observer.observe(this.element);
		this._paneObserver = observer;
	}

	private _schedulePaneReapply(): void {
		if (this._paneReapplyTimer !== undefined)
			return;

		this._paneReapplyTimer = setTimeout(() => {
			this._paneReapplyTimer = undefined;
			this._applyAbrConstraints(this._displayHdr);
		}, 0);
	}

	/** Disconnect the pane observer and drop a pending re-apply. Called from `dispose()`. */
	private _teardownPaneResizeObserver(): void {
		if (this._paneReapplyTimer !== undefined) {
			clearTimeout(this._paneReapplyTimer);
			this._paneReapplyTimer = undefined;
		}
		this._paneObserver?.disconnect();
		this._paneObserver = undefined;
	}

	/** Remove the matchMedia listener. Called from `dispose()`. */
	private _teardownHdrMatchMedia(): void {
		if (this._hdrMql && this._hdrMqlListener) {
			this._hdrMql.removeEventListener('change', this._hdrMqlListener);
		}
		this._hdrMql = undefined;
		this._hdrMqlListener = undefined;
	}

	/**
	 * Build `_levelIsHdr[]` from the current HLS level list.
	 * A level is HDR when its VIDEO-RANGE attribute is `PQ` or `HLG`.
	 */
	private _classifyHdrLevels(): void {
		if (!this.hls?.levels?.length) {
			this._levelIsHdr = [];
			return;
		}
		this._levelIsHdr = this.hls.levels.map((level) => {
			const videoRange = (level.attrs?.['VIDEO-RANGE'] ?? '').toUpperCase();
			return videoRange === 'PQ' || videoRange === 'HLG';
		});
	}

	/**
	 * Constrain HLS.js ABR to what this display and this pane can actually show,
	 * per `hdrDecision` and `sizeAbrCeiling` — the oracles both native ports
	 * mirror. The only writer of `autoLevelCapping`.
	 *
	 * The pane ceiling applies on every branch, including the ones with no
	 * dynamic-range cap to make: an SDR item in a 740px player is the ordinary
	 * case, and it is the one that was pulling a 4K rendition.
	 *
	 * `as-is` (HDR display, or an ordinary SDR item with no HDR rungs to cap):
	 *   - `autoLevelCapping` falls back to the pane ceiling, or `-1` when the
	 *     pane is unmeasured or already as large as the ladder's best rung. If
	 *     the current level is SDR and an HDR peer exists at the same
	 *     resolution, prefer it via `nextLevel` (soft switch — the next fragment
	 *     boundary picks it up, no stutter). The peer shares the current level's
	 *     resolution, so it cannot violate the pane ceiling. A no-op on the
	 *     SDR-only case: there is no HDR peer to find.
	 *
	 * `cap-to` (SDR display, an SDR rung exists):
	 *   - Caps `autoLevelCapping` to the more restrictive of the dynamic-range
	 *     rung and the pane rung, by raw manifest index. For interleaved
	 *     manifests (HDR index < SDR index at the same resolution) the cap alone
	 *     is insufficient — `nextLevel` also forces off any currently-playing
	 *     HDR variant to its SDR peer.
	 *
	 * `tone-map` — never returned here; see `backendCanToneMap` below.
	 *
	 * `play-unconverted` — no SDR rung, no converter, consumer opted in: the
	 *   dynamic range goes unconstrained on purpose, the pane ceiling still
	 *   holds, no error.
	 *
	 * `refuse` — no SDR rung, no converter, consumer opted out: escalated
	 *   through the same fatal-error channel HLS stream errors use.
	 *
	 * Always re-emits `levels` so overlay plugins can update their menus.
	 */
	private _applyAbrConstraints(displayHdr: boolean): void {
		this._displayHdr = displayHdr;
		if (!this.hls || this._levelIsHdr.length === 0)
			return;

		const levels = this.qualityLevels();
		const pane = panePixels(this.element);
		const sizeCeiling = sizeAbrCeiling(levels, pane.widthPx, pane.heightPx);
		const sizeCapIndex = sizeCeiling === null ? -1 : sizeCeiling.index;

		// Neither hls.js nor any shipping <video> implementation performs an
		// HDR→SDR tone-map during decode — a platform fact, not unfinished work.
		const backendCanToneMap = false;
		const decision = hdrDecision(levels, displayHdr, backendCanToneMap, this._hdrOnSdrFallback ?? 'play');

		switch (decision.kind) {
			case 'as-is': {
				this.hls.autoLevelCapping = sizeCapIndex;

				const playingIdx = this.currentLevel();
				if (playingIdx >= 0 && !this._levelIsHdr[playingIdx]) {
					const currentHeight = this.hls.levels[playingIdx]?.height;
					const hdrPeerIdx = this.hls.levels.findIndex(
						(level, idx) => this._levelIsHdr[idx] && level.height === currentHeight,
					);
					if (hdrPeerIdx >= 0)
						this.hls.nextLevel = hdrPeerIdx;
				}
				break;
			}

			case 'cap-to': {
				const ceiling = abrCeiling(decision.level, sizeCeiling) ?? decision.level;
				this.hls.autoLevelCapping = ceiling.index;

				const playingIdx = this.currentLevel();
				if (playingIdx >= 0 && this._levelIsHdr[playingIdx]) {
					const currentHeight = this.hls.levels[playingIdx]?.height;
					const sdrPeerIdx = this.hls.levels.findIndex(
						(level, idx) => !this._levelIsHdr[idx] && level.height === currentHeight,
					);
					this.hls.nextLevel = sdrPeerIdx >= 0 ? sdrPeerIdx : ceiling.index;
				}
				break;
			}

			case 'tone-map': {
				// Unreachable while `backendCanToneMap` is false above — handled
				// explicitly so a backend that DOES gain a converter can't fall
				// through this switch unnoticed.
				break;
			}

			case 'play-unconverted': {
				this.hls.autoLevelCapping = sizeCapIndex;
				break;
			}

			case 'refuse': {
				const err = mediaFormatError(
					'video:media/hdr-unplayable',
					'Every rendition in this manifest is HDR and the active display cannot render HDR.',
				);
				this._escalateHlsError(err.code, err.message);
				break;
			}
		}

		// Re-emit the level list so overlay plugins can update their menus
		// to show or hide HDR variants without waiting for the next user action.
		void this._probeCodecCapabilities().then(() => {
			const levels = this.qualityLevels();
			this.emit('levels', { levels });
		});
	}

	/** Called by the matchMedia listener when the display's HDR capability changes. */
	private _onDisplayHdrChange(displayNowHdr: boolean): void {
		this._applyAbrConstraints(displayNowHdr);
	}

	/**
	 * Subscribe to HLS level-change signals on the current `this.hls` instance
	 * and forward them as the backend's `level-switched` event. Must be called
	 * after every HLS instance creation alongside `_attachHlsErrorHandler`.
	 *
	 * Listens to two HLS events for robustness:
	 *  - `LEVEL_SWITCHED` — the "official" level change. Fires reliably for
	 *    the initial pick and explicit setQuality() calls, but can go silent
	 *    for ABR-driven sub-switches that happen at fragment boundaries.
	 *  - `FRAG_CHANGED`   — every fragment swap. Carries `frag.level`, so when
	 *    a fragment lands on a different level than the previous one, that's
	 *    effectively a level switch. Catches the cases LEVEL_SWITCHED misses.
	 *
	 * Both paths dedupe through `lastLevel` so consumers never see two
	 * `level-switched` emissions for the same actual level.
	 */
	private _attachHlsLevelSwitchedHandler(Hls: HlsConstructor): void {
		if (!this.hls)
			return;
		let lastLevel = -1;
		const emitIfChanged = (level: number): void => {
			if (level < 0 || level === lastLevel)
				return;
			lastLevel = level;
			this.emit('level-switched', { level });
		};
		this.hls.on(Hls.Events.LEVEL_SWITCHED, (_e: unknown, data: { level: number }) => {
			emitIfChanged(data.level);
		});
		this.hls.on(Hls.Events.FRAG_CHANGED, (_e: unknown, data: { frag?: { level?: number } }) => {
			const level = data?.frag?.level;
			if (typeof level === 'number')
				emitIfChanged(level);
		});
	}

	private waitForLoadedMetadata(): Promise<void> {
		if (this.element.readyState >= 1 /* HAVE_METADATA */)
			return Promise.resolve();

		const METADATA_TIMEOUT_MS = 10_000;

		return new Promise<void>((resolve, reject) => {
			let timer: ReturnType<typeof setTimeout>;
			let onLoad: () => void;
			let onElementError: () => void;
			let onStreamError: (data?: BackendEventPayload['stream:error']) => void;

			const cleanup = (): void => {
				clearTimeout(timer);
				this.element.removeEventListener('loadedmetadata', onLoad);
				this.element.removeEventListener('error', onElementError);
				this.off('stream:error', onStreamError);
			};

			onLoad = (): void => { cleanup(); resolve(); };

			onElementError = (): void => {
				cleanup();
				reject(this.element.error ?? new Error('media element error'));
			};

			// HLS.js fatal errors (e.g. MANIFEST_INCOMPATIBLE_CODECS, network
			// exhaustion) are emitted on the backend's EventEmitter — they never
			// reach the DOM element's `error` event because they originate in the
			// HLS.js pipeline before any media element interaction. Without this
			// listener the waitForLoadedMetadata promise would hang indefinitely,
			// leaving load() suspended and the error invisible to the consumer.
			onStreamError = (data?: BackendEventPayload['stream:error']): void => {
				if (data?.fatal) {
					cleanup();
					reject(new Error(`HLS fatal: ${data.details}`));
				}
			};

			// Hard backstop: if neither loadedmetadata nor a fatal error arrives
			// within METADATA_TIMEOUT_MS, reject so load() never parks indefinitely.
			// This catches the case where HLS.js retries exhaust slowly (the default
			// three-retry back-off takes 7 s on manifest 404s) or where a non-fatal
			// error loop never escalates to fatal at all.
			timer = setTimeout(() => {
				cleanup();
				reject(new Error(`waitForLoadedMetadata timed out after ${METADATA_TIMEOUT_MS} ms`));
			}, METADATA_TIMEOUT_MS);

			this.element.addEventListener('loadedmetadata', onLoad, { once: true });
			this.element.addEventListener('error', onElementError, { once: true });
			this.on('stream:error', onStreamError);
		});
	}
}

// ─────────────────────────────────────────────────────────────────────────
// Cue normalisation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Tags renderers know how to draw safely. Everything else is stripped at
 *  parse time so consumers never need to re-sanitise downstream.
 */
const UNRECOGNISED_INLINE_TAG_RE = /<\/?(?:c(?:\.[^>]*)?|v(?:\s[^>]*)?|ruby|rt|lang(?:\.[^>]*)?)>/gi;
const TIMESTAMP_TAG_RE = /<\d{2}:\d{2}:\d{2}\.\d{3}>/g;
const ALL_TAG_RE = /<[^>]+>/g;

/**
 * Translate a native `VTTCue` into the backend-agnostic `SubtitleCue`
 * shape. Aligns with the kit's `parseVttSubtitles` payload so consumers
 * (overlays, debug widgets, accessibility tools) don't need to branch on
 * cue origin. `cue.line` is `'auto'` or a percent number; we drop the
 * `'auto'` case (renderers fall back to safe-area positioning). `cue.size`
 * defaults to 100 per the WebVTT spec.
 */
function normaliseVttCue(cue: VTTCue): SubtitleCue {
	const raw = cue.text ?? '';
	const safe = raw.replace(TIMESTAMP_TAG_RE, '').replace(UNRECOGNISED_INLINE_TAG_RE, '');
	const plain = safe.replace(ALL_TAG_RE, '').trim();

	// `cue.line` is either a number or 'auto'. `cue.snapToLines` decides
	// whether that number is a LINE INDEX (CEA-608 style: line:1 = top
	// row, line:15 = bottom row of a 15-row grid) or a PERCENT (WebVTT
	// `line:NN%` style: 0 = top, 100 = bottom).
	//
	// The kit's `SubtitleCue.line` is a percentage. Convert when needed:
	//
	//   - snapToLines:false → already a percent, pass through.
	//   - snapToLines:true with positive N → row N of the 15-row CEA-608
	//     grid; map to (N - 1) * 100 / 14 so line:1 → 0% (top), line:15
	//     → 100% (bottom). Anything outside 1–15 clamps to that range.
	//   - snapToLines:true with negative N → count from the bottom;
	//     line:-1 → 100% (last row), line:-15 → 0% (first row).
	let line: number | undefined;
	const rawLine = cue.line;
	if (typeof rawLine === 'number') {
		if (cue.snapToLines === false) {
			if (rawLine >= 0 && rawLine <= 100)
				line = rawLine;
		}
		else {
			const ROWS = 15;
			const row = rawLine >= 0
				? Math.max(1, Math.min(ROWS, rawLine))
				: Math.max(1, Math.min(ROWS, ROWS + 1 + rawLine));
			line = ((row - 1) * 100) / (ROWS - 1);
		}
	}

	let align: 'start' | 'center' | 'end' = 'center';
	const rawAlign = cue.align;
	if (rawAlign === 'start' || rawAlign === 'left')
		align = 'start';
	else if (rawAlign === 'end' || rawAlign === 'right')
		align = 'end';

	const size = typeof cue.size === 'number' ? cue.size : 100;

	// `cue.position` is `'auto'` (string) or a number 0–100. Surface
	// only when it's an explicit number so renderers can fall back to
	// align-derived defaults.
	let position: number | undefined;
	const rawPosition = cue.position;
	if (typeof rawPosition === 'number' && rawPosition >= 0 && rawPosition <= 100)
		position = rawPosition;

	return { text: safe, plainText: plain, line, align, size, position };
}
