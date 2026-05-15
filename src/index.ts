// noinspection JSUnusedGlobalSymbols

import type { VTTData } from 'webvtt-parser';

import { Base } from './player/base';
import { Logger } from './player/logger';
import type Plugin from './plugins/plugin';
import MessagePlugin from './plugins/messagePlugin';
import type { PluginMap } from './types/plugins';

import { defaultSubtitleStyles } from './player/utils';
import type {
	PlayerConfig,
	PlaylistItem,
	PreviewTime,
	Stretching,
	SubtitleStyle,
} from './types';

// Mixin imports
import { audioMethods } from './player/audio';
import { chapterMethods } from './player/chapters';
import { coreMethods } from './player/core';
import { deprecatedMethods } from './player/deprecated';
import { displayMethods } from './player/display';
import { domMethods } from './player/dom';
import { eventMethods } from './player/events';
import { floatMethods } from './player/float';
import { fontMethods } from './player/fonts';
import { pipMethods } from './player/pip';
import { playbackMethods } from './player/playback';
import { playlistMethods } from './player/playlist';
import { qualityMethods } from './player/quality';
import { skipperMethods } from './player/skippers';
import { subtitleMethods } from './player/subtitles';
import { translationMethods } from './player/translations';
import { theaterMethods } from './player/theater';
import { uiStateMethods } from './player/ui-state';
import { volumeMethods } from './player/volume';

const instances = new Map();

const DEFAULT_LEEWAY = 300;
const DEFAULT_SEEK_INTERVAL = 10;

class NMPlayer<T = Record<string, any>> extends Base<T> {
	// ── Mixin method declarations (provided via Object.assign on prototype) ──
	declare createBaseStyles: () => void;
	declare createSubtitleFontFamily: () => void;
	declare fetchTranslationsFile: () => Promise<void>;
	declare _tryFetchTranslation: (url: string) => Promise<string | null>;
	declare createOverlayElement: () => void;
	declare styleContainer: () => void;
	declare createVideoElement: () => void;
	declare createSubtitleOverlay: () => void;
	declare resize: () => void;
	declare _removeEvents: () => void;
	declare _addEvents: () => void;
	declare loadPlaylist: () => void;
	declare removeGainNode: () => void;
	declare _initFloatObserver: () => void;
	declare _destroyFloatObserver: () => void;
	declare _initPipListeners: () => void;
	declare _destroyPipListeners: () => void;
	declare _initTheater: () => void;
	declare _destroyTheater: () => void;
	declare _initDeprecatedEventForwarders: () => void;
	declare hevcSupported: () => boolean;
	declare probeHevcSupport: () => Promise<boolean>;

	// Setup
	hls: import('hls.js').default | undefined;
	gainNode: GainNode | undefined;
	translations: { [key: string]: string } = {};
	defaultTranslations: { [key: string]: string } = {};

	// State
	leftTap: NodeJS.Timeout = <NodeJS.Timeout>{};
	rightTap: NodeJS.Timeout = <NodeJS.Timeout>{};
	leeway = DEFAULT_LEEWAY;
	seekInterval = DEFAULT_SEEK_INTERVAL;
	tapCount = 0;
	rewindCount = 0;
	forwardCount = 0;
	inactivityTimeout: NodeJS.Timeout | null = null;
	inactivityTime = 3000;

	// Store
	_chapters: VTTData = <VTTData>{};
	currentChapterFile = '';

	previewTime: PreviewTime[] = [];

	fonts: { file: string; mimeType: string }[] = [];
	currentFontFile = '';

	_skippers: any;
	currentSkipFile = '';

	currentSubtitleIndex = -1;
	_subtitles: VTTData = <VTTData>{};
	currentSubtitleFile = '';

	// Playlist functionality
	_playlist: (PlaylistItem & T)[] = [];
	currentPlaylistItem: (PlaylistItem & T) = <(PlaylistItem & T)>{} as (PlaylistItem & T);
	currentIndex = -1;
	isPlaying = false;
	_muted: boolean = false;
	_volume: number = 100;
	lastTime = 0;

	lockActive: boolean = false;
	_readyFired: boolean = false;

	plugins: PluginMap = new Map<string, Plugin>() as PluginMap;

	stretchOptions: Array<Stretching> = [
		'uniform',
		'fill',
		'exactfit',
		'none',
		'16:9',
		'4:3',
	];

	currentAspectRatio: typeof this.stretchOptions[number] = this.options.stretching ?? 'uniform';
	allowFullscreen: boolean = true;
	shouldFloat: boolean = false;
	firstFrame: boolean = false;
	_theaterMode: boolean = false;
	_floatObserver: IntersectionObserver | undefined;
	_pipVisibilityHandler: (() => void) | undefined;
	_subtitleStyle: SubtitleStyle = defaultSubtitleStyles;
	resizeObserver: ResizeObserver = <ResizeObserver>{};

	// Event arrays (initialized by _initEventArrays in events.ts)
	_playerEvents: { type: string; handler: EventListener }[] = [];
	_containerEvents: { type: string; handler: EventListener }[] = [];

	// HLS recovery state
	_hlsRecoveryAttempts = 0;
	_hlsRecoveryTimer: ReturnType<typeof setTimeout> | null = null;

	// HEVC capability probe cache. `undefined` means the async probe hasn't
	// completed yet (or hasn't been kicked off); `hevcSupported()` falls back
	// to MediaSource.isTypeSupported in that window.
	_hevcSupportedCache: boolean | undefined = undefined;
	_hevcProbeInFlight: Promise<boolean> | undefined = undefined;

	// PIP listener references (for cleanup)
	_pipEnterHandler: (() => void) | undefined;
	_pipLeaveHandler: (() => void) | undefined;

	constructor(id?: string | number) {
		super();

		if (!id && instances.size === 0) {
			throw new Error('No player element found');
		}

		if (!id && instances.size > 0) {
			return instances.values().next().value!;
		}

		if (typeof id === 'number') {
			instances.forEach((player, index) => {
				if (Number.parseInt(index, 10) === id) {
					return player;
				}
			});

			throw new Error('Player not found');
		}

		if (typeof id !== 'string') {
			throw new TypeError('Player ID must be a string that matches the ID of a div element on the page or a number representing the index of the player to select');
		}

		if (instances.has(id)) {
			return instances.get(id)!;
		}

		return this.init(id);
	}

	init(id: string): this {
		const container = document.querySelector<HTMLDivElement>(`#${id}`);

		if (!container) {
			throw new Error(`Player element with ID ${id} not found`);
		}

		if (container.nodeName !== 'DIV') {
			throw new Error('Element must be a div element');
		}

		this.playerId = id;
		this.container = container;

		this.createBaseStyles();
		this.createSubtitleFontFamily();

		this.createOverlayElement();

		if (this.options.messagePlugin !== false) {
			this.registerPlugin('message', new MessagePlugin());
			this.usePlugin('message');
		}

		this.styleContainer();
		this.createVideoElement();
		this.createSubtitleOverlay();

		this.resizeObserver = new ResizeObserver(() => {
			this.resize();
		});
		this.resizeObserver.observe(this.container);

		instances.set(id, this);

		this._removeEvents();
		this._addEvents();

		this._initFloatObserver();
		this._initPipListeners();
		this._initTheater();
		this._initDeprecatedEventForwarders();

		setTimeout(() => {
			if (this._readyFired)
				return;
			this._readyFired = true;
			this.emit('ready');
		}, 0);

		return this;
	}

	registerPlugin(name: string, plugin: any): void {
		this.plugins.set(name, plugin);
		plugin.initialize(this);
		this.logger.debug(`Plugin ${name} registered`);
	}

	usePlugin(name: string): void {
		const plugin = this.plugins.get(name);
		this.logger.debug(`Using plugin: ${name}`);
		if (plugin) {
			plugin.use();
		}
		else {
			this.logger.error(`Plugin ${name} is not registered`);
		}
	}

	plugin(name: string): Plugin | undefined {
		return this.plugins.get(name);
	}

	setup<U = Partial<PlayerConfig>>(options: Partial<PlayerConfig<U>>): NMPlayer<U> {
		this.options = {
			...this.options,
			...options,
		};

		const logLevel = options.log?.level
			?? (options.debug ? 'debug' : 'error');
		this.logger = new Logger({
			level: logLevel,
			category: this.playerId,
			handler: options.log?.handler,
		});

		this.inactivityTime = this.options.controlsTimeout ?? 3000;
		this.videoElement.controls = options.controls ?? false;

		this.setupTime = Date.now();

		queueMicrotask(() => {
			this.fetchTranslationsFile();
		});
		// Kick off the HEVC decode probe so the result is cached before
		// loadSource configures HLS. The probe is fire-and-forget: any later
		// loadSource call will either see the cached result or fall back to
		// the synchronous MediaSource.isTypeSupported check.
		queueMicrotask(() => {
			this.probeHevcSupport().catch(() => {});
		});
		this.loadPlaylist();

		return this as unknown as NMPlayer<U>;
	}

	setConfig<U>(options: Partial<U & PlayerConfig<any>>) {
		this.options = { ...this.options, ...options };
	}

	// Stubs
	playAd(): void {}
	requestCast(): void {}
	stopCasting(): void {}

	dispose(): void {
		clearTimeout(this.message);
		clearTimeout(this.leftTap);
		clearTimeout(this.rightTap);
		if (this.inactivityTimeout) {
			clearTimeout(this.inactivityTimeout);
		}
		if (this._hlsRecoveryTimer !== null) {
			clearTimeout(this._hlsRecoveryTimer);
			this._hlsRecoveryTimer = null;
		}

		this._removeEvents();
		this._destroyFloatObserver();
		this._destroyPipListeners();
		this._destroyTheater();

		for (const plugin of this.plugins.values()) {
			this.logger.debug('Disposing plugin');
			plugin.dispose();
		}

		this.plugins = new Map<string, Plugin>() as PluginMap;

		if (this.hls) {
			this.hls.destroy();
			this.hls = undefined;
		}

		if (this.gainNode) {
			this.removeGainNode();
			this.gainNode = undefined;
		}

		if (this.container) {
			this.container.innerHTML = '';
		}

		instances.delete(this.playerId);

		this.mediaSession?.clearActionHandler();
		this.mediaSession?.setPlaybackState('none');

		this.resizeObserver.disconnect();

		this._readyFired = false;

		this.emit('dispose');

		this.off('all');
	}
}

// Merge all mixin methods onto prototype
// prettier-ignore
Object.assign(NMPlayer.prototype, coreMethods, domMethods, eventMethods, uiStateMethods, playbackMethods, volumeMethods, audioMethods, qualityMethods, subtitleMethods, playlistMethods, chapterMethods, skipperMethods, fontMethods, translationMethods, displayMethods, floatMethods, pipMethods, theaterMethods, deprecatedMethods);

// Deprecated getter shims for removed event hook flags (backwards compat with 0.6.x)
Object.defineProperties(NMPlayer.prototype, {
	hasPipEventHandler: { get() { return this.hasListeners('pip'); }, configurable: true },
	hasTheaterEventHandler: { get() { return this.hasListeners('theater') || this.hasListeners('theaterMode'); }, configurable: true },
	hasBackEventHandler: { get() { return this.hasListeners('back'); }, configurable: true },
	hasCloseEventHandler: { get() { return this.hasListeners('close'); }, configurable: true },
});

const nmplayer = <Conf extends Partial<PlayerConfig> = Record<string, any>>(id?: string) => new NMPlayer<Conf>(id);

export default nmplayer;

export { Base } from './player/base';
export { Logger } from './player/logger';
export { default as PlayerStorage } from './player/playerStorage';

// Re-export utils for consumers who previously imported from helpers
export {
	breakEpisodeTitle,
	breakLogoTitle,
	convertToSeconds,
	defaultSubtitleStyles,
	edgeStyles,
	fontFamilies,
	getEdgeStyle,
	hslToHex,
	humanTime,
	limitSentenceByCharacters,
	lineBreakShowTitle,
	namedColors,
	normalizeHex,
	pad,
	parseColorToHex,
	rgbToHex,
	toTitleCase,
	unique,
} from './player/utils';
export { default as KeyHandlerPlugin } from './plugins/keyHandlerPlugin';
export { default as MessagePlugin } from './plugins/messagePlugin';
export { default as OctopusPlugin } from './plugins/octopusPlugin';
export { default as Plugin } from './plugins/plugin';

// Re-export types for consumers
export type {
	AddClasses,
	AddClassesReturn,
	AudioTrack,
	BaseTrack,
	CaptionsConfig,
	Chapter,
	ChapterTrack,
	CreateElement,
	CurrentTrack,
	EdgeStyle,
	FloatConfig,
	Font,
	FontTrack,
	GainData,
	Icon,
	Level,
	LogConfig,
	LogHandler,
	LogLevel,
	NMPlayer,
	OS,
	PipConfig,
	PlayerConfig,
	PlayerEventMap,
	PlaylistItem,
	PlayState,
	PluginMap,
	PluginRegistry,
	Position,
	Preload,
	PreviewTime,
	Skipper,
	SkipperTrack,
	SpriteTrack,
	StorageInterface,
	Stretching,
	StretchOptions,
	SubtitleStyle,
	SubtitleStyleChange,
	SubtitleTrack,
	TheaterConfig,
	ThumbnailTrack,
	TimeData,
	TooltipData,
	Track,
	TrackKindMap,
	TrackType,
	TranslationFileEventData,
	TranslationsLoadedEventData,
	TypeMapping,
	TypeMappings,
	Version,
	VisualQualityData,
	VolumeState,
	WarningData,
} from './types';
export type { VTTData } from 'webvtt-parser';
