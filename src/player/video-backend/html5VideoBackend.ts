

import { BrowserPolicyError, EventEmitter, MediaFormatError } from '@nomercy-entertainment/nomercy-player-core';
import type { AudioTrack, QualityLevel, SubtitleTrack } from '@nomercy-entertainment/nomercy-player-core';
import type { BackendEventPayload, BackendLoaderState, BackendState, IVideoBackend, SubtitleCue, SubtitleCueChange } from './backend';

const HLS_EXT_RE = /\.m3u8(\?|$)/i;

const policy = (code: string, message: string): BrowserPolicyError => new BrowserPolicyError({
	code,
	severity: 'error',
	scope: { kind: 'backend', id: 'html5' },
	message,
});

/**
 * Default video backend. Wraps an `<HTMLVideoElement>` for transport.
 *
 * HLS support: native pass-through when `canPlayType` reports support
 * (Safari / iOS), otherwise dynamically imports `hls.js` (already a kit
 * dep) and attaches it. MSE / WebCodecs backends ship later.
 */
export class Html5VideoBackend extends EventEmitter<BackendEventPayload> implements IVideoBackend {
	readonly kind = 'html5' as const;

	private readonly element: HTMLVideoElement;
	private readonly ownsElement: boolean;
	/**
	 * Tracked element listeners. Stored at the DOM's lowest-common
	 * `EventListener` type (which every `HTMLVideoElementEventMap`
	 * entry satisfies) so add/remove pair by reference using a
	 * matching signature. The forwarding closures defined in
	 * `wireElementEvents` are typed as `EventListener` at declaration —
	 * not narrowed and re-cast — so this storage is the type's
	 * canonical home.
	 */
	private readonly elementListeners: Array<{ event: string; fn: EventListener }> = [];
	private hls: any | undefined;
	private currentUrl: string | undefined;
	private _state: BackendState = 'idle';
	private _hadError = false;
	private _ended = false;
	private _loaderState: BackendLoaderState = 'running';
	/** Currently-driving native `TextTrack`. Set by `setSubtitleTrack`
	 *  after we hide a track and start listening to its `cuechange`. */
	private activeTextTrack: TextTrack | null = null;
	/** Listener attached to `activeTextTrack` so we can detach on track
	 *  switch / dispose without rebuilding the rest of the listeners map. */
	private cueChangeHandler: (() => void) | null = null;

	// ── HLS error-recovery state ──
	/** Retry count for the current fatal network-error sequence. Reset on
	 *  successful playback resume. */
	private _netRetryCount = 0;
	/** Timestamp (ms) when the first media-error recovery was attempted.
	 *  Used to detect a second media error within the 5-second escalation window. */
	private _mediaRecoveryStartMs = 0;
	/** Timer handle for exponential back-off retries. Cleared on unload/dispose. */
	private _retryTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(container: HTMLElement) {
		super();
		const existing = container.querySelector('video') as HTMLVideoElement | null;
		if (existing) {
			this.element = existing;
			this.ownsElement = false;
		}
		else {
			this.element = container.ownerDocument.createElement('video');
			container.appendChild(this.element);
			this.ownsElement = true;
		}
		this.wireElementEvents();
	}

	// ── Lifecycle ──

	async load(url: string, opts?: { preload: 'auto' | 'metadata' | 'none' }): Promise<void> {
		this.currentUrl = url;
		this._hadError = false;
		this._ended = false;
		this._state = 'loading';
		this.emit('loadstart');

		if (opts?.preload) this.element.preload = opts.preload;

		const isHls = HLS_EXT_RE.test(url);
		const probe = this.element.canPlayType('application/vnd.apple.mpegurl');
		const nativeHls = probe === 'maybe' || probe === 'probably';

		// Tear down any previous Hls instance BEFORE wiring a new source.
		// Without this, every load() leaks an Hls that keeps polling segment 0
		// against the same media element — symptom: thousands of identical
		// fragment requests after a single playlist switch.
		if (this.hls) {
			try { this.hls.detachMedia(); }
			catch { /* defensive */ }
			try { this.hls.destroy(); }
			catch { /* defensive */ }
			this.hls = undefined;
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
				if (!cues) continue;
				// removeCue mutates the live list — snapshot first.
				const snap = Array.from(cues);
				for (const cue of snap) {
					try { track.removeCue(cue); }
					catch { /* defensive — some browsers refuse for active cues */ }
				}
			}
		}

		if (isHls && !nativeHls) {
			// Dynamic import keeps hls.js out of the initial bundle when not needed.
			// Indirect specifier sidesteps TS module resolution — hls.js is a
			// transitive dep via @nomercy-entertainment/nomercy-player-core.
			const hlsSpec = 'hls.js';
			const mod: any = await import(/* @vite-ignore */ hlsSpec);
			const Hls = mod.default ?? mod;
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
			// Caption-source priority (WCAG 2.1 SC 1.2.2, FCC §79.4):
			//   1. WebVTT declared in the manifest (`EXT-X-MEDIA:TYPE=SUBTITLES`)
			//      is the authoritative caption source — richer styling,
			//      explicit positioning, named regions, multiple languages.
			//   2. CEA-608 / CEA-708 embedded in the MPEG-TS user_data is
			//      the fallback for streams that declare no WebVTT.
			//
			// NEVER surface BOTH for the same language — HLS.js silently
			// merges them under one `kind:captions` textTrack (same lang +
			// label), the user sees one "English" track that's actually
			// two interleaved streams, and per-cue positioning becomes
			// non-deterministic. The accessibility contract is "user can
			// pick exactly one caption track per language", not "user
			// gets a duplicated cue stream."
			//
			// HLS.js doesn't let us toggle CEA mid-stream, so we
			// conservatively disable CEA on construction. After
			// `MANIFEST_PARSED` we check whether WebVTT was declared:
			//   - WebVTT present → keep CEA off (rule 1 satisfied)
			//   - WebVTT absent  → reload the Hls instance with CEA on
			//                       so pure-CEA streams aren't left
			//                       silent (rule 2 fallback).
			this.hls = new Hls({
				autoStartLoad: true,
				enableWorker: true,
				lowLatencyMode: false,
				enableCEA708Captions: false,
			});
			this.hls.on(Hls.Events.MANIFEST_PARSED, (_e: unknown, data: { subtitleTracks?: unknown[] }) => {
				const hasWebVttSubs = Array.isArray(data?.subtitleTracks) && data.subtitleTracks.length > 0;
				if (hasWebVttSubs) {
					this._emitHlsTrackLists();
					return;
				}
				// No WebVTT in the manifest. Tear down + restart with CEA
				// enabled so the user still gets captions when the source
				// only carries embedded ones.
				try { this.hls?.detachMedia(); }
				catch { /* defensive */ }
				try { this.hls?.destroy(); }
				catch { /* defensive */ }
				const fallback = new Hls({
					autoStartLoad: true,
					enableWorker: true,
					lowLatencyMode: false,
					enableCEA708Captions: true,
				});
				this.hls = fallback;
				this.hls.attachMedia(this.element);
				this.hls.loadSource(url);
				this.hls.on(Hls.Events.MANIFEST_PARSED, () => { this._emitHlsTrackLists(); });
				this._attachHlsErrorHandler(Hls, url);
				this._attachHlsLevelSwitchedHandler(Hls);
			});
			this.hls.attachMedia(this.element);
			this.hls.loadSource(url);
			this._attachHlsErrorHandler(Hls, url);
			this._attachHlsLevelSwitchedHandler(Hls);
		}
		else {
			// Clear any previous src before assigning a new one — without this
			// browsers can briefly play the previous source while loading the
			// new one, and `load()` becomes a no-op when src didn't change.
			try { this.element.removeAttribute('src'); this.element.load(); }
			catch { /* defensive */ }
			this.element.src = url;
			try { this.element.load(); }
			catch { /* defensive */ }
		}

		await this.waitForLoadedMetadata();
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
		try { this.element.pause(); }
		catch { /* defensive */ }
		if (this.hls) {
			try { this.hls.detachMedia(); }
			catch { /* defensive */ }
			try { this.hls.destroy(); }
			catch { /* defensive */ }
			this.hls = undefined;
		}
		try { this.element.removeAttribute('src'); this.element.load(); }
		catch { /* defensive */ }
		this.currentUrl = undefined;
		// Reset any renderers consuming our cue stream — the next track
		// selection will repopulate.
		this.emit('subtitleCue', { cues: [], language: undefined } as SubtitleCueChange);
		this.emit('waiting');
	}

	dispose(): void {
		if (this._retryTimer !== undefined) {
			clearTimeout(this._retryTimer);
			this._retryTimer = undefined;
		}
		this.unload();
		for (const { event, fn } of this.elementListeners) {
			this.element.removeEventListener(event, fn);
		}
		this.elementListeners.length = 0;
		// Listener storage lives on the EventEmitter base — the disposed
		// backend instance becomes unreachable once the player drops it,
		// so the Map (and its handler refs) are GC'd along with it.
		// We keep the element-listener teardown above explicit because
		// those refs survive on the shared <video> element.
		if (this.ownsElement && this.element.parentNode) {
			this.element.parentNode.removeChild(this.element);
		}
	}

	// ── Transport ──

	async play(): Promise<void> {
		await this.element.play();
	}

	pause(): void {
		this.element.pause();
	}

	stop(): void {
		this.element.pause();
		try { this.element.currentTime = 0; }
		catch { /* defensive */ }
	}

	// ── Time / position ──

	currentTime(): number;
	currentTime(t: number): void;
	currentTime(t?: number): number | void {
		if (t === undefined) return this.element.currentTime;
		this.element.currentTime = t;
	}

	duration(): number {
		const d = this.element.duration;
		return Number.isFinite(d) ? d : 0;
	}

	buffered(): number {
		const ranges = this.element.buffered;
		const t = this.element.currentTime;
		for (let i = 0; i < ranges.length; i += 1) {
			if (t >= ranges.start(i) && t <= ranges.end(i)) return ranges.end(i);
		}
		return ranges.length > 0 ? ranges.end(ranges.length - 1) : 0;
	}

	bufferedRanges(): TimeRanges {
		return this.element.buffered;
	}

	seekable(): TimeRanges {
		return this.element.seekable;
	}

	playbackRate(): number;
	playbackRate(rate: number): void;
	playbackRate(rate?: number): number | void {
		if (rate === undefined) return this.element.playbackRate;
		this.element.playbackRate = rate;
	}

	// ── Volume ──

	volume(): number;
	volume(v: number): void;
	volume(v?: number): number | void {
		if (v === undefined) return this.element.volume;
		this.element.volume = Math.min(1, Math.max(0, v));
	}

	mute(): void {
		this.element.muted = true;
	}

	unmute(): void {
		this.element.muted = false;
	}

	// ── Video-specific (stubs until track plumbing lands) ──

	videoWidth(): number {
		return this.element.videoWidth;
	}

	videoHeight(): number {
		return this.element.videoHeight;
	}

	audioTracks(): AudioTrack[] {
		// HLS-managed sources: hls.audioTracks gives language + name.
		if (this.hls?.audioTracks?.length) {
			return this.hls.audioTracks.map((t: any, index: number) => ({
				id: `audio-${index}`,
				language: t.lang ?? undefined,
				label: t.name ?? `Track ${index + 1}`,
				default: t.default === true,
			}));
		}
		// Native: HTMLMediaElement.audioTracks (Safari/Chrome with multi-audio).
		const nativeTracks = (this.element as unknown as { audioTracks?: { length: number; [k: number]: { id: string; language: string; label: string; enabled: boolean } } }).audioTracks;
		if (nativeTracks && nativeTracks.length > 0) {
			const out: AudioTrack[] = [];
			for (let i = 0; i < nativeTracks.length; i++) {
				const t = nativeTracks[i]!;
				out.push({
					id: t.id || `audio-${i}`,
					language: t.language || undefined,
					label: t.label || `Track ${i + 1}`,
					default: t.enabled,
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
		const nativeTracks = (this.element as unknown as { audioTracks?: { length: number; [k: number]: { enabled: boolean } } }).audioTracks;
		if (nativeTracks) {
			for (let i = 0; i < nativeTracks.length; i++) {
				nativeTracks[i]!.enabled = i === idx;
			}
		}
	}

	subtitleTracks(): SubtitleTrack[] {
		// HLS-managed subtitles
		if (this.hls?.subtitleTracks?.length) {
			return this.hls.subtitleTracks.map((t: any, index: number) => ({
				id: `subtitle-${index}`,
				language: t.lang ?? undefined,
				label: t.name ?? `Subtitles ${index + 1}`,
				kind: 'subtitles' as const,
				url: t.url ?? '',
				default: t.default === true,
			}));
		}
		// Native: HTMLMediaElement.textTracks
		const tt = this.element.textTracks;
		if (!tt || tt.length === 0) return [];
		const out: SubtitleTrack[] = [];
		for (let i = 0; i < tt.length; i++) {
			const t = tt[i]!;
			if (t.kind !== 'subtitles' && t.kind !== 'captions') continue;
			out.push({
				id: t.id || `subtitle-${i}`,
				language: t.language || undefined,
				label: t.label || `Subtitles ${i + 1}`,
				kind: t.kind === 'captions' ? 'captions' : 'subtitles',
				url: '',
				default: t.mode === 'showing',
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
		if (this.hls) this.hls.subtitleTrack = idx ?? -1;

		// "Off" — disable every subtitle/caption textTrack and emit an
		// empty cue list so renderers clear their overlays.
		if (idx === null || idx < 0) {
			this.disableAllSubtitleTextTracks();
			this.emit('subtitleCue', { cues: [], language: undefined } as SubtitleCueChange);
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
				const t = tt[i]!;
				if (t.kind !== 'subtitles' && t.kind !== 'captions') continue;
				t.mode = t === target ? 'hidden' : 'disabled';
			}
		}
		if (!target) {
			// Track requested but no matching textTrack yet (HLS.js may
			// still be parsing the WebVTT manifest). Emit empty for now;
			// the cuechange listener will fire once cues arrive.
			this.emit('subtitleCue', { cues: [], language: undefined } as SubtitleCueChange);
			return;
		}

		this.activeTextTrack = target;
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
		if (!tt || tt.length === 0) return null;

		if (this.hls?.subtitleTracks?.[idx]) {
			const want = this.hls.subtitleTracks[idx];
			let captionsFallback: TextTrack | null = null;
			for (let i = 0; i < tt.length; i++) {
				const t = tt[i]!;
				if (t.kind !== 'subtitles' && t.kind !== 'captions') continue;
				const langOk = !want.lang || t.language === want.lang;
				const labelOk = !want.name || t.label === want.name;
				if (!langOk || !labelOk) continue;
				if (t.kind === 'subtitles') return t;
				if (!captionsFallback) captionsFallback = t;
			}
			return captionsFallback;
		}

		// Native: walk subtitle/caption tracks in order and pick the Nth.
		let nth = -1;
		for (let i = 0; i < tt.length; i++) {
			const t = tt[i]!;
			if (t.kind !== 'subtitles' && t.kind !== 'captions') continue;
			nth++;
			if (nth === idx) return t;
		}
		return null;
	}

	private disableAllSubtitleTextTracks(): void {
		const tt = this.element.textTracks;
		if (!tt) return;
		for (let i = 0; i < tt.length; i++) {
			const t = tt[i]!;
			if (t.kind === 'subtitles' || t.kind === 'captions') t.mode = 'disabled';
		}
	}

	private detachActiveTextTrack(): void {
		const fn = this.cueChangeHandler;
		this.cueChangeHandler = null;
		this.activeTextTrack = null;
		if (fn) fn();
	}

	/**
	 * Read the active cues off a `TextTrack` and emit them through the
	 * backend's `subtitleCue` channel. Each `VTTCue` is normalised into
	 * the backend-agnostic `SubtitleCue` shape so renderers don't have
	 * to know whether the source was an HLS-fed VTT or a native track.
	 */
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

	qualityLevels(): QualityLevel[] {
		if (!this.hls?.levels?.length) return [];
		return this.hls.levels.map((level: any, index: number) => ({
			bitrate: level.bitrate ?? 0,
			height: level.height ?? undefined,
			width: level.width ?? undefined,
			label: level.name ?? `${level.height ?? '?'}p`,
			index,
		}));
	}

	setQuality(idx: number | 'auto'): void {
		if (!this.hls) return;
		this.hls.currentLevel = idx === 'auto' ? -1 : idx;
	}

	// ── State ──

	state(): BackendState {
		if (this._hadError) return 'error';
		if (!this.currentUrl) return 'idle';
		if (this._state === 'loading') return 'loading';
		if (!this.element.paused && !this.element.ended) return 'playing';
		if (this.element.paused && this.element.readyState >= 2 && !this._ended) return 'paused';
		if (this.element.readyState >= 1) return 'ready';
		return this._state;
	}

	// ── Raw element ──

	mediaElement(): HTMLVideoElement {
		return this.element;
	}

	// ── Capability surface ──

	captureStream(): MediaStream {
		const fn = (this.element as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream;
		if (typeof fn !== 'function') {
			throw policy('core:policy/captureStreamUnsupported', 'HTMLVideoElement.captureStream() is not available in this environment.');
		}
		return fn.call(this.element);
	}

	async setSinkId(deviceId: string): Promise<void> {
		const fn = (this.element as HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId;
		if (typeof fn !== 'function') {
			throw policy('core:policy/setSinkIdUnsupported', 'HTMLVideoElement.setSinkId() is not available in this environment.');
		}
		await fn.call(this.element, deviceId);
	}

	getSinkId(): string {
		return (this.element as HTMLVideoElement & { sinkId?: string }).sinkId ?? '';
	}

	mediaKeys(): MediaKeys | undefined {
		return this.element.mediaKeys ?? undefined;
	}

	async setMediaKeys(keys: MediaKeys): Promise<void> {
		const fn = (this.element as HTMLMediaElement & { setMediaKeys?: (k: MediaKeys) => Promise<void> }).setMediaKeys;
		if (typeof fn !== 'function') {
			throw policy('core:policy/emeUnsupported', 'HTMLMediaElement.setMediaKeys() is not available in this environment.');
		}
		await fn.call(this.element, keys);
	}

	outputProtectionState(): 'unrestricted' | 'restricted' | 'unsupported' {
		// Real HDCP probing requires DRM platform-specific keys. Default
		// 'unrestricted' so plugins can probe without throwing; the DRM
		// plugin overrides this once a key system is wired.
		return 'unrestricted';
	}

	pauseLoader(): void {
		// HLS path: hand off to hls.js. Native HLS / progressive MP4 has no
		// public throttle hook — the runtime tracks state for symmetry.
		const stop = this.hls?.stopLoad as (() => void) | undefined;
		if (typeof stop === 'function') stop.call(this.hls);
		this._loaderState = 'paused';
	}

	resumeLoader(): void {
		const start = this.hls?.startLoad as (() => void) | undefined;
		if (typeof start === 'function') start.call(this.hls);
		this._loaderState = 'running';
	}

	loaderState(): BackendLoaderState {
		return this._loaderState;
	}

	// ── Events ──
	// `on`, `off`, `once`, `emit`, `hasListeners` are inherited from
	// `EventEmitter<BackendEventPayload>` — no per-class storage, no
	// per-method casts. The map is generic over the payload map so
	// every call site narrows automatically.

	// ── Internals ──

	/**
	 * Pair `addEventListener` with reference-tracked teardown so
	 * `dispose()` removes exactly what was added. Listener type is
	 * the DOM's `EventListener` so the storage and the call use the
	 * same signature — no narrowing, no casts. Listener bodies that
	 * need a specific `Event` subclass should narrow at use, not at
	 * the boundary.
	 */
	private addElementListener(event: keyof HTMLVideoElementEventMap, fn: EventListener): void {
		this.element.addEventListener(event, fn);
		this.elementListeners.push({ event, fn });
	}

	private wireElementEvents(): void {
		// Forward DOM media events 1:1 onto the backend's typed channel.
		// Each forwarded name matches a key in `BackendEventPayload`,
		// and the DOM payload type matches the channel's payload type.
		this.addElementListener('loadstart', e => this.emit('loadstart', e));
		this.addElementListener('loadeddata', e => this.emit('loadeddata', e));
		this.addElementListener('canplay', e => this.emit('canplay', e));
		this.addElementListener('emptied', e => this.emit('emptied', e));
		this.addElementListener('play', e => this.emit('play', e));
		this.addElementListener('pause', e => this.emit('pause', e));
		this.addElementListener('timeupdate', e => this.emit('timeupdate', e));
		this.addElementListener('waiting', e => this.emit('waiting', e));
		this.addElementListener('stalled', e => this.emit('stalled', e));
		this.addElementListener('ratechange', e => this.emit('ratechange', e));
		this.addElementListener('resize', e => this.emit('resize', e));
		this.addElementListener('encrypted', (e) => {
			// `MediaKeyMessageEvent` widens to `Event` for the channel —
			// EME consumers cast at the listener if they need the keys.
			this.emit('encrypted', e);
		});
		this.addElementListener('ended', (e) => {
			this._ended = true;
			this.emit('ended', e);
		});
		this.addElementListener('error', (e) => {
			this._hadError = true;
			this._state = 'error';
			// Attach MediaError metadata to the event object so upstream
			// consumers receive the browser's error code without a second
			// element read. The DOM Event is widened — we stamp extra
			// properties onto it rather than wrapping, to preserve the
			// original event identity for any listener that casts it.
			const mediaErr = this.element.error;
			if (mediaErr !== null) {
				const code = mediaErr.code;
				// Map MediaError.code → v2 typed error code.
				//   1 MEDIA_ERR_ABORTED   → media/aborted
				//   2 MEDIA_ERR_NETWORK   → media/network
				//   3 MEDIA_ERR_DECODE    → media/decode-fatal-variant (try next rendition)
				//   4 MEDIA_ERR_SRC_NOT_SUPPORTED → media/decode-fatal-all
				const v2Code
					= code === 1 ? 'media/aborted'
					: code === 2 ? 'media/network'
					: code === 3 ? 'media/decode-fatal-variant'
					: 'media/decode-fatal-all';
				(e as Event & { mediaErrorCode?: number; v2ErrorCode?: string }).mediaErrorCode = code;
				(e as Event & { mediaErrorCode?: number; v2ErrorCode?: string }).v2ErrorCode = v2Code;
			}
			this.emit('error', e);
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
		this.emit('error', syntheticError as unknown as Event);
	}

	/**
	 * Subscribe to `Hls.Events.ERROR` on the current `this.hls` instance.
	 * Must be called after every HLS instance creation (including the CEA
	 * fallback reload) because hls.js event listeners are per-instance.
	 *
	 * Decision tree per hls.js error semantics:
	 * - Non-fatal → emit `stream:error` with `fatal: false`, no escalation.
	 * - Fatal NETWORK → retry `hls.startLoad()` up to 3× with exponential
	 *   back-off (1 s, 2 s, 4 s). If exhausted, escalate.
	 * - Fatal MEDIA → call `hls.recoverMediaError()`. If a second media
	 *   error fires within 5 s, escalate.
	 * - Fatal MUX / other → destroy + reload via `load()`. If that fails, escalate.
	 *
	 * @param Hls   - The hls.js constructor (carries static `Events` + `ErrorTypes`)
	 * @param url   - The manifest URL, needed for MUX destroy-reload.
	 */
	private _attachHlsErrorHandler(Hls: any, url: string): void {
		if (!this.hls) return;
		const MAX_NET_RETRIES = 3;

		this.hls.on(Hls.Events.ERROR, (_e: unknown, data: {
			fatal: boolean;
			type: string;
			details: string;
		}) => {
			if (!data.fatal) {
				// Non-fatal: inform consumers but do not escalate.
				this.emit('stream:error', { details: data.details, fatal: false });
				return;
			}

			if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
				if (this._netRetryCount >= MAX_NET_RETRIES) {
					this._escalateHlsError(data.details, `HLS network error after ${MAX_NET_RETRIES} retries: ${data.details}`);
					return;
				}
				this._netRetryCount++;
				const delayMs = 1_000 * (2 ** (this._netRetryCount - 1)); // 1s, 2s, 4s
				this.emit('stream:recovering', { details: data.details, attempt: this._netRetryCount, maxAttempts: MAX_NET_RETRIES });
				this._retryTimer = setTimeout(() => {
					this._retryTimer = undefined;
					if (!this.hls) return;
					try { this.hls.startLoad(); }
					catch { this._escalateHlsError(data.details, `HLS startLoad failed: ${data.details}`); }
				}, delayMs);
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
				try { this.hls?.recoverMediaError(); }
				catch { this._escalateHlsError(data.details, `HLS recoverMediaError threw: ${data.details}`); }
			}
			else {
				// MUX_ERROR or unknown fatal — destroy + reload.
				this.emit('stream:recovering', { details: data.details, attempt: 1, maxAttempts: 1 });
				try { this.hls?.detachMedia(); } catch { /* defensive */ }
				try { this.hls?.destroy(); } catch { /* defensive */ }
				this.hls = undefined;
				// Re-attach via the existing load path. If load() throws, escalate.
				this.load(url).catch(() => {
					this._escalateHlsError(data.details, `HLS fatal after destroy-reload: ${data.details}`);
				});
			}
		});

		// Reset net-retry counter on any successful fragment load — the stream
		// is healthy again, so prior retry attempts shouldn't count toward the cap.
		this.hls.on(Hls.Events.FRAG_LOADED, () => {
			if (this._netRetryCount > 0) this._netRetryCount = 0;
		});
	}

	/**
	 * Emit `levels` and `audioTracks` backend events from the current HLS
	 * instance's live lists. Called after every `MANIFEST_PARSED` event so
	 * overlay plugins can update button visibility without polling.
	 */
	private _emitHlsTrackLists(): void {
		if (!this.hls) return;

		const levels = this.qualityLevels();
		this.emit('levels', { levels });

		const tracks = this.audioTracks();
		if (tracks.length > 0) this.emit('audioTracks', { tracks });
	}

	/**
	 * Subscribe to `Hls.Events.LEVEL_SWITCHED` on the current `this.hls`
	 * instance and forward it as the backend's `level-switched` event.
	 * Must be called after every HLS instance creation alongside
	 * `_attachHlsErrorHandler`.
	 */
	private _attachHlsLevelSwitchedHandler(Hls: any): void {
		if (!this.hls) return;
		this.hls.on(Hls.Events.LEVEL_SWITCHED, (_e: unknown, data: { level: number }) => {
			this.emit('level-switched', { level: data.level });
		});
	}

	private waitForLoadedMetadata(): Promise<void> {
		if (this.element.readyState >= 1 /* HAVE_METADATA */) return Promise.resolve();
		return new Promise<void>((resolve, reject) => {
			const onLoad = (): void => { cleanup(); resolve(); };
			const onError = (): void => { cleanup(); reject(this.element.error ?? new Error('media element error')); };
			const cleanup = (): void => {
				this.element.removeEventListener('loadedmetadata', onLoad);
				this.element.removeEventListener('error', onError);
			};
			this.element.addEventListener('loadedmetadata', onLoad, { once: true });
			this.element.addEventListener('error', onError, { once: true });
		});
	}
}

// ─────────────────────────────────────────────────────────────────────────
// Cue normalisation
// ─────────────────────────────────────────────────────────────────────────

/** Tags renderers know how to draw safely. Everything else is stripped at
 *  parse time so consumers never need to re-sanitise downstream. */
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
			if (rawLine >= 0 && rawLine <= 100) line = rawLine;
		}
		else {
			const ROWS = 15;
			let row: number;
			if (rawLine >= 0) row = Math.max(1, Math.min(ROWS, rawLine));
			else row = Math.max(1, Math.min(ROWS, ROWS + 1 + rawLine));
			line = ((row - 1) * 100) / (ROWS - 1);
		}
	}

	let align: 'start' | 'center' | 'end' = 'center';
	const a = cue.align;
	if (a === 'start' || a === 'left') align = 'start';
	else if (a === 'end' || a === 'right') align = 'end';

	const size = typeof cue.size === 'number' ? cue.size : 100;

	// `cue.position` is `'auto'` (string) or a number 0–100. Surface
	// only when it's an explicit number so renderers can fall back to
	// align-derived defaults.
	let position: number | undefined;
	const p = cue.position;
	if (typeof p === 'number' && p >= 0 && p <= 100) position = p;

	return { text: safe, plainText: plain, line, align, size, position };
}
