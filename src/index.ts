

import {
	BrowserPolicyError,
	composeMixins,
	EventEmitter,
	initPlayerCoreState,
	playerCoreMethods,
	resolvePlayerConstructor,
} from '@nomercy-entertainment/nomercy-player-core';
import type {
	ActionOptions,
	AudioTrack,
	AuthConfig,
	BasePlaylistItem,
	BufferState,
	CastState,
	Chapter,
	CueParser,
	DeviceCapabilities,
	IPlayer,
	LoadOptions,
	NetworkState,
	PlaybackMetrics,
	PlayerExperimental,
	PlayerPhase,
	Plugin,
	QualityLevel,
	ResolvedUrl,
	SetupState,
	StreamFactory,
	SubtitleCueChange,
	SubtitleStyle,
	SubtitleTrack,
	TimeState as KitTimeState,
	Translations,
	UrlCategory,
	UrlResolver,
	VisibilityState,
} from '@nomercy-entertainment/nomercy-player-core';
import type { IVideoBackend } from './player/video-backend/backend';
import { Html5VideoBackend } from './player/video-backend/html5VideoBackend';
import type { VideoEventMap, VideoPlayerConfig, VideoPlaylistItem } from './types';
import {
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

export type { Stretching, VideoEventMap, VideoPlayerConfig, VideoPlaylistItem } from './types';
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

const _instances = new Map<string, NMVideoPlayer<any>>();

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
export class NMVideoPlayer<T extends BasePlaylistItem = VideoPlaylistItem>
	extends EventEmitter<VideoEventMap>
	implements IPlayer<VideoEventMap> {
	readonly playerId: string = '';
	container: HTMLElement = <HTMLElement>{};
	videoElement: HTMLVideoElement = <HTMLVideoElement>{};

	get id(): string {
		return this.playerId;
	}

	declare options: VideoPlayerConfig<T>;

	// ── Type-only declarations for the methods composed in from the kit's
	// `playerCoreMethods`. The bodies live in the kit; these declarations let
	// consumers see the video-typed contract without runtime cost.

	declare setup: (config: VideoPlayerConfig<T>) => this;
	declare ready: () => Promise<void>;
	declare dispose: () => void;
	declare setupState: () => SetupState;
	declare phase: () => PlayerPhase;
	declare dispatching: () => ReadonlyArray<string>;

	declare baseUrl: {
		(): string | undefined;
		(url: string): void;
	};
	declare audioContext: () => AudioContext | undefined;
	declare experimental: PlayerExperimental;

	declare t: (key: string, vars?: Record<string, string>) => string;
	declare language: {
		(): string;
		(lang: string): Promise<void>;
	};
	declare addTranslations: (bundle: Translations) => void;
	declare translation: {
		(lang: string, key: string): string | undefined;
		(lang: string, key: string, value: string): void;
	};
	declare removeTranslations: (prefix: string, lang?: string) => void;

	declare registerCueParser: (parser: CueParser, prepend?: boolean) => void;
	declare unregisterCueParser: (id: string) => void;

	declare play: (opts?: ActionOptions) => Promise<void>;
	declare pause: (opts?: ActionOptions) => Promise<void>;
	declare stop: (opts?: ActionOptions) => Promise<void>;
	declare togglePlayback: (opts?: ActionOptions) => Promise<void>;
	declare next: (opts?: ActionOptions) => Promise<void>;
	declare previous: (opts?: ActionOptions) => Promise<void>;
	declare rewind: (seconds?: number, opts?: ActionOptions) => Promise<void>;
	declare forward: (seconds?: number, opts?: ActionOptions) => Promise<void>;
	declare restart: (opts?: ActionOptions) => Promise<void>;

	declare currentTime: {
		(): number;
		(t: number, opts?: ActionOptions): Promise<void>;
	};
	declare duration: () => number;
	declare buffered: () => number;
	declare bufferedRanges: () => TimeRanges;
	declare seekable: () => TimeRanges;
	declare timeData: () => KitTimeState;
	declare playbackRate: {
		(): number;
		(rate: number): void;
	};
	declare playbackRates: () => number[];

	declare volume: {
		(): number;
		(v: number): void;
	};
	declare mute: () => void;
	declare unmute: () => void;
	declare toggleMute: () => void;
	declare volumeUp: (step?: number) => void;
	declare volumeDown: (step?: number) => void;

	declare playState: () => PlayState;
	declare volumeState: () => VolumeState;
	declare repeatState: {
		(): RepeatState;
		(state: RepeatState): void;
	};
	declare shuffleState: {
		(): ShuffleState;
		(state: ShuffleState | boolean): void;
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
	declare queueSort: (compare: (a: T, b: T) => number, opts?: ActionOptions) => void;
	declare peekNext: () => T | undefined;
	declare peekPrevious: () => T | undefined;
	declare queueLength: () => number;
	declare queueIndexOf: (id: string | number) => number;

	declare current: {
		(): T | undefined;
		(target: T | string | number, opts?: ActionOptions): void;
	};
	declare currentIndex: () => number;

	declare backlog: {
		(): ReadonlyArray<T>;
		(items: T[]): void;
	};
	declare backlogAppend: (item: T | T[]) => void;
	declare backlogRemove: (id: string | number) => void;
	declare backlogClear: () => void;

	declare addPlugin: <P extends Plugin>(PluginClass: new () => P, opts?: P['opts']) => this;
	declare getPlugin: <P extends Plugin>(PluginClass: new () => P) => P | undefined;
	declare getPluginById: (id: string) => Plugin | undefined;
	declare removePlugin: <P extends Plugin>(PluginClass: new () => P) => void;
	declare removePluginById: (id: string) => void;
	declare plugins: () => ReadonlyArray<Plugin>;
	declare enabledPlugins: () => ReadonlyArray<Plugin>;

	constructor(id?: string | number) {
		super();
		// Resolve FIRST so the existing-instance path doesn't waste state init.
		// Spec §AB: avoid re-initializing core state on a player that's already
		// fully constructed and possibly mid-pipeline.
		const resolved = resolvePlayerConstructor(id, _instances, 'NMVideoPlayer');
		if (resolved.kind === 'existing') {
			// eslint-disable-next-line no-constructor-return
			return resolved.instance as unknown as this;
		}

		initPlayerCoreState(this, { className: 'NMVideoPlayer' });
		(this as { playerId: string }).playerId = resolved.id;
		this.container = resolved.div;
		_instances.set(resolved.id, this);

		// Sync the playlist item's `image` to the <video> element's poster
		// attribute so the player shows cover art instead of a black frame
		// before / between sources. The element doesn't necessarily exist
		// yet when `current` fires (backend allocation is lazy), so we
		// remember the wanted poster and re-apply once it's materialised.
		this.on('current', (data) => {
			const item = (data as Record<string, unknown> | undefined);
			const image: string | undefined = (item?.['item'] as Record<string, string> | undefined)?.image
				?? (item?.['image'] as string | undefined)
				?? (item?.['poster'] as string | undefined)
				?? (item?.['thumbnail'] as string | undefined);
			this._wantedPoster = image ?? null;
			this._applyPoster();
		});
	}

	private _wantedPoster: string | null = null;

	/**
	 * Apply the most recently requested poster to whichever real `<video>`
	 * element exists in the container. The constructor stores `videoElement`
	 * as a stub `{}` until the backend lazily allocates the real element, so
	 * we query the container as the source of truth.
	 */
	private _applyPoster(): void {
		const el = this.container?.querySelector?.('video') as HTMLVideoElement | null;
		if (!el) return;
		const want = this._wantedPoster;
		if (want)
			el.setAttribute('poster', want);
		else
			el.removeAttribute('poster');
	}

	/** Test-only: clear the registry. Not part of the public API. */
	static _resetRegistry(): void {
		_instances.clear();
	}

	// ── Stream registration ── composed in via `streamRegistrationMethods` mixin.
	declare registerStream: (factory: StreamFactory, prepend?: boolean) => this;
	declare unregisterStream: (id: string) => this;
	declare streams: () => ReadonlyArray<string>;
	declare getStreamFactory: (id: string) => StreamFactory | undefined;

	// ── Backend ──
	private _backend: IVideoBackend | undefined;
	backend(): IVideoBackend {
		if (this._backend) return this._backend;
		const factory = this.options?.backendFactory;
		const instance = factory
			? factory('html5', this.options as VideoPlayerConfig<BasePlaylistItem>)
			: new Html5VideoBackend(this.container);
		this._backend = instance;
		this.videoElement = instance.mediaElement();
		// Real element now exists — apply any poster the cursor moved through
		// while we were lazy.
		this._applyPoster();
		// Bridge backend element events to player-level phase transitions and
		// the `firstFrame` / `ended` events the player surface promises.
		let firstFrameEmitted = false;
		instance.on('canplay', () => {
			if (firstFrameEmitted) return;
			firstFrameEmitted = true;
			const self = this as unknown as { _phase: string; emit: (e: string, d?: any) => void };
			if (self._phase === 'starting') {
				const from = self._phase;
				self._phase = 'playing';
				this.emit('phase', { from, to: 'playing' });
			}
			this.emit('firstFrame', undefined);
		});
		instance.on('ended', () => {
			const self = this as unknown as { _phase: string; emit: (e: string, d?: any) => void };
			const from = self._phase;
			if (from !== 'ended') {
				self._phase = 'ended';
				this.emit('phase', { from, to: 'ended' });
			}
			this.emit('ended', undefined);
		});

		// Sync `_playState` with the actual element. Without this, every
		// natural pause (buffering stall, end-of-media, source swap during
		// load()) leaves `_playState='playing'` lying — `togglePlayback`
		// then sees `playing` and silently calls `pause()` again, so the
		// next user "play" click is a no-op.
		const self = this as unknown as { _playState: string; emit: (e: string, d?: any) => void };
		instance.on('play', () => {
			if (self._playState !== 'playing') {
				self._playState = 'playing';
				this.emit('play', undefined);
			}
		});
		instance.on('pause', () => {
			// `pause` fires on natural pause AND right before `ended`; the
			// `ended` listener already moved phase, so don't override it.
			if (self._playState === 'playing') {
				self._playState = 'paused';
				this.emit('pause', undefined);
			}
		});
		// Loading a new source / source removal both invalidate the
		// "we're playing" state. `loadstart` fires when the backend
		// starts loading new media; `emptied` fires when the element's
		// src is unset (HMR re-mount, manual unload). Both leave the
		// element paused at currentTime=0, so sync `_playState` to
		// match — without this, the next togglePlayback sees 'playing'
		// and silently calls pause() on the already-paused element.
		const onResetToPaused = () => {
			firstFrameEmitted = false;
			if (self._playState === 'playing') {
				self._playState = 'paused';
				this.emit('pause', undefined);
			}
		};
		instance.on('loadstart', onResetToPaused);
		instance.on('emptied', onResetToPaused);

		// Bridge backend subtitle cue stream to the player's event
		// surface. Renderers (overlay plugins, debug widgets, a11y
		// tooling) consume this single channel without caring whether
		// the cue originated from a native HLS textTrack, a sidecar
		// VTT (kit-driven), or a future MSE/WebCodecs backend.
		instance.on('subtitleCue', (data?: SubtitleCueChange) => {
			if (!data) return;
			this.emit('subtitleCue', data);
		});
		// `play()` Promise rejection (autoplay block, source swap mid-play)
		// fires `pause` immediately after the rejected play. The element's
		// `pause` listener above already handles that, so no extra hook
		// needed — but we DO need to make sure the kit's `play()` waits
		// for the backend's actual play promise to resolve. That's the
		// testbed bridge's job, not the kit's.
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
	declare qualityState: {
		(): QualityState;
		(target: number | 'auto'): void;
	};
	declare audioTrackState: {
		(): AudioTrackState;
		(idx: number): void;
	};

	// ── Video-specific state ──
	fullscreenState(): FullscreenState;
	fullscreenState(state: FullscreenState | boolean): void;
	fullscreenState(state?: FullscreenState | boolean): FullscreenState | void {
		const platform = (this as any).platform();
		const ctrl = platform.fullscreen;
		if (state === undefined) {
			return ctrl?.isActive() ? FullscreenState.ON : FullscreenState.OFF;
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
		const action = wantActive
			? ctrl.enter(this.container)
			: ctrl.exit();
		void action.catch(() => { /* swallow — UI listens to fullscreen event */ });
		this.emit('fullscreen', { active: wantActive });
	}
	pipState(): PipState;
	pipState(state: PipState | boolean): void;
	pipState(state?: PipState | boolean): PipState | void {
		const platform = (this as any).platform();
		const ctrl = platform.pip;
		if (state === undefined) {
			return ctrl?.isActive() ? PipState.ON : PipState.OFF;
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
		const action = wantActive ? ctrl.enter(this.videoElement) : ctrl.exit();
		void action.catch(() => { /* swallow */ });
		this.emit('pip', { active: wantActive });
	}
	private _theaterActive = false;
	theaterState(): TheaterState;
	theaterState(state: TheaterState | boolean): void;
	theaterState(state?: TheaterState | boolean): TheaterState | void {
		if (state === undefined) {
			return this._theaterActive ? TheaterState.ON : TheaterState.OFF;
		}
		const wantActive = typeof state === 'boolean' ? state : state === TheaterState.ON;
		this._theaterActive = wantActive;
		this.emit('theater', { active: wantActive });
	}
	private _subtitleState: SubtitleState = SubtitleState.OFF;
	subtitleState(): SubtitleState {
		// Real check: any active text track on the video element?
		const tt = this._backend?.mediaElement?.()?.textTracks;
		if (tt) {
			for (let i = 0; i < tt.length; i++) {
				if (tt[i]!.mode === 'showing') return SubtitleState.ON;
			}
		}
		return this._subtitleState;
	}
	// ── Video-specific actions ──
	toggleFullscreen(): void {
		const isActive = this.fullscreenState() === FullscreenState.ON;
		this.fullscreenState(!isActive);
	}
	togglePip(): void {
		const isActive = this.pipState() === PipState.ON;
		this.pipState(!isActive);
	}
	toggleTheater(): void {
		const isActive = this.theaterState() === TheaterState.ON;
		this.theaterState(!isActive);
	}
	cycleSubtitles(): void {
		let list: SubtitleTrack[] = [];
		try { list = this.subtitles(); }
		catch { /* tracks API not implemented yet — treat as empty */ }
		if (!list || list.length === 0) return;
		let current = -1;
		try {
			const state = (this as unknown as { subtitleState: () => any }).subtitleState();
			if (typeof state === 'number') current = state;
		}
		catch { /* state unavailable — start from off */ }
		// Walk: -1 (off) → 0 → 1 → ... → list.length-1 → -1 (off)
		const next = current >= list.length - 1 ? -1 : current + 1;
		this.currentSubtitle(next === -1 ? null : next);
	}
	cycleAudioTracks(): void {
		let list: AudioTrack[] = [];
		try { list = this.audioTracks(); }
		catch { /* tracks API not implemented yet — treat as empty */ }
		if (!list || list.length === 0) return;
		let current = -1;
		try {
			const state = (this as unknown as { audioTrackState: () => any }).audioTrackState();
			if (typeof state === 'number') current = state;
		}
		catch { /* state unavailable — start from 0 */ }
		const next = current >= list.length - 1 ? 0 : current + 1;
		this.currentAudioTrack(next);
	}
	private _aspectRatio: 'uniform' | 'fill' | 'exactfit' | 'none' = 'uniform';
	cycleAspectRatio(): void {
		const order: Array<'uniform' | 'fill' | 'exactfit' | 'none'> = ['uniform', 'fill', 'exactfit', 'none'];
		const idx = order.indexOf(this._aspectRatio);
		const next = order[(idx + 1) % order.length];
		this._aspectRatio = next;
		this.emit('aspectRatio', { value: next });
	}

	// ── Tracks / chapters / quality ── composed in via `mediaTracksMethods` mixin.
	declare subtitles: () => SubtitleTrack[];
	declare currentSubtitle: {
		(): number | null;
		(idx: number | null): void;
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
	declare audioTracks: () => AudioTrack[];
	declare currentAudioTrack: {
		(): number | null;
		(idx: number): void;
	};
	declare qualityLevels: () => QualityLevel[];
	declare currentQuality: {
		(): number | 'auto';
		(idx: number | 'auto'): void;
	};
	declare chapters: () => Chapter[];
	declare currentChapter: {
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
	declare canPlay: (profile: { contentType: string; width?: number; height?: number; bitrate?: number; framerate?: number }) => Promise<MediaCapabilitiesDecodingInfo>;
	declare bandwidth: () => number;
	declare bandwidthEstimator: {
		(): (() => number) | undefined;
		(fn: () => number): void;
	};

	// ── Audio output device ── composed in via `audioOutputMethods` mixin.
	declare audioOutputs: () => Promise<MediaDeviceInfo[]>;
	declare selectAudioOutput: () => Promise<MediaDeviceInfo | null>;
	declare currentAudioOutput: {
		(): Promise<string | null>;
		(deviceId: string): Promise<void>;
	};

	// ── Cast / handoff ── composed in via `castMethods` mixin.
	declare castState: () => CastState;
	declare transferTo: (target: 'cast' | 'airplay' | 'remote-playback') => Promise<void>;

	// ── Auth runtime mutation ── composed in via `authMethods` mixin.
	declare auth: {
		(): Readonly<AuthConfig> | undefined;
		(config: AuthConfig): void;
		(partial: Partial<AuthConfig>): void;
	};
	declare refreshAuth: () => Promise<void>;
	declare resolveUrl: (url: string, category?: UrlCategory) => Promise<ResolvedUrl>;
	declare urlResolver: {
		(): UrlResolver | undefined;
		(resolver: UrlResolver | undefined): void;
	};

	// ── Performance metrics / clock / accessibility ── composed in via `metricsMethods` mixin.
	declare metrics: () => PlaybackMetrics;
	declare recordMetric: (name: string, value: number) => void;
	declare now: () => number;
	declare announce: (text: string, level?: 'polite' | 'assertive') => void;

	// ── DOM construction helpers ── composed via `domMethods` mixin.
	declare createElement: IPlayer<VideoEventMap>['createElement'];
	declare createButton: IPlayer<VideoEventMap>['createButton'];
	declare createSVG: IPlayer<VideoEventMap>['createSVG'];
	declare addClasses: IPlayer<VideoEventMap>['addClasses'];
	declare removeClasses: IPlayer<VideoEventMap>['removeClasses'];
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
{
	const composedDispose = NMVideoPlayer.prototype.dispose as () => void;
	NMVideoPlayer.prototype.dispose = function (this: NMVideoPlayer<BasePlaylistItem>): void {
		const self = this as unknown as { _backend?: { dispose?: () => void }; videoElement?: HTMLVideoElement };
		try { self._backend?.dispose?.(); }
		catch { /* defensive — kit must still finish disposing */ }
		self._backend = undefined;
		self.videoElement = undefined;
		composedDispose.call(this);
	};
}

/**
 * Factory entry point. Returns the existing instance for a given div id, or
 * mounts a fresh one. Mirrors the v1 video-player wiki contract.
 */
export const nmplayer = <T extends BasePlaylistItem = VideoPlaylistItem>(id?: string | number): NMVideoPlayer<T> => {
	return new NMVideoPlayer<T>(id);
};

export default nmplayer;
