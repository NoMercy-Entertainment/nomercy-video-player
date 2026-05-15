import type { VTTData } from 'webvtt-parser';
import type PlayerStorage from '../player/playerStorage';
import type { Base } from '../player/base';
import type {
	PlaylistItem,
	PreviewTime,
	Stretching,
	SubtitleStyle,
	TypeMapping,
	TypeMappings,
} from './data';
import type { PlayerConfig } from './config';
import type { NMPlayerPlayback } from './playback';
import type { NMPlayerVolume } from './volume';
import type { NMPlayerAudio } from './audio';
import type { NMPlayerQuality } from './quality';
import type { NMPlayerSubtitles } from './subtitles';
import type { NMPlayerPlaylist } from './playlist';
import type { NMPlayerChapters } from './chapters';
import type { NMPlayerDisplay } from './display';
import type { NMPlayerTranslations } from './translations';
import type { NMPlayerDom } from './dom';
import type { NMPlayerCore } from './core';
import type { NMPlayerEvents } from './events';
import type { NMPlayerUiState } from './ui-state';
import type { NMPlayerSkippers } from './skippers';
import type { NMPlayerFonts } from './fonts';
import type { NMPlayerPlugins, PluginMap } from './plugins';
import type { NMPlayerDeprecated } from './deprecated';
import type { NMPlayerFloat } from './float';
import type { NMPlayerPip } from './pip';
import type { NMPlayerTheater } from './theater';

export interface NMPlayer<T extends Record<string, any> = Record<string, any>> extends
	Base<T>,
	NMPlayerPlayback,
	NMPlayerVolume,
	NMPlayerAudio,
	NMPlayerQuality,
	NMPlayerSubtitles,
	NMPlayerPlaylist<T>,
	NMPlayerChapters,
	NMPlayerDisplay,
	NMPlayerTranslations,
	NMPlayerDom,
	NMPlayerCore,
	NMPlayerEvents,
	NMPlayerUiState,
	NMPlayerSkippers,
	NMPlayerFonts,
	NMPlayerPlugins,
	NMPlayerFloat,
	NMPlayerPip,
	NMPlayerTheater,
	NMPlayerDeprecated<T> {
	// ── Public state ─────────────────────────────────────────────────────
	currentTimeFile: string | undefined;
	episode: number | undefined;
	fonts: { file: string; mimeType: string }[];
	octopusInstance: import('../../public/js/octopus/subtitles-octopus').default | null;
	hasNextTip: boolean;
	id: string | number;
	isPlaying: boolean;
	season: number | undefined;
	title: string | undefined;
	container: HTMLDivElement;
	options: T & PlayerConfig<T>;
	overlay: HTMLDivElement;
	subtitleOverlay: HTMLDivElement;
	subtitleArea: HTMLDivElement;
	subtitleText: HTMLSpanElement;
	plugins: PluginMap;
	storage: PlayerStorage;
	translations: { [key: string]: string };
	videoElement: HTMLVideoElement;

	// ── Internal state (used by mixins) ──────────────────────────────────
	hls: import('hls.js').default | undefined;
	gainNode: GainNode | undefined;
	_audioContext: AudioContext | undefined;
	defaultTranslations: { [key: string]: string };
	_chapters: VTTData;
	currentChapterFile: string;
	previewTime: PreviewTime[];
	currentFontFile: string;
	_skippers: VTTData;
	currentSkipFile: string;
	currentSubtitleIndex: number;
	_subtitles: VTTData;
	currentSubtitleFile: string;
	_playlist: (PlaylistItem & T)[];
	currentPlaylistItem: PlaylistItem & T;
	currentIndex: number;
	_muted: boolean;
	_volume: number;
	lastTime: number;
	lockActive: boolean;
	leftTap: NodeJS.Timeout;
	rightTap: NodeJS.Timeout;
	leeway: number;
	seekInterval: number;
	tapCount: number;
	rewindCount: number;
	forwardCount: number;
	inactivityTimeout: NodeJS.Timeout | null;
	inactivityTime: number;
	stretchOptions: Array<Stretching>;
	currentAspectRatio: Stretching;
	allowFullscreen: boolean;
	shouldFloat: boolean;
	firstFrame: boolean;
	_subtitleStyle: SubtitleStyle;
	resizeObserver: ResizeObserver;
	_playerEvents: { type: string; handler: EventListener }[];
	_containerEvents: { type: string; handler: EventListener }[];
	_boundEmitPlay: ((data?: any) => void) | null;
	_boundEmitPaused: ((data?: any) => void) | null;
	_boundInteraction: ((data?: any) => void) | null;
	_boundPipClass: ((enabled: boolean) => void) | null;
	_boundTheaterClass: ((enabled: boolean) => void) | null;
	_boundFloatClass: ((enabled: boolean) => void) | null;
	_hlsRecoveryAttempts: number;
	_hlsRecoveryTimer: ReturnType<typeof setTimeout> | null;
	_hevcSupportedCache: boolean | undefined;
	_hevcProbeInFlight: Promise<boolean> | undefined;
	_pipEnterHandler: (() => void) | undefined;
	_pipLeaveHandler: (() => void) | undefined;
	_theaterMode: boolean;
	_floatObserver: IntersectionObserver | undefined;
	_pipVisibilityHandler: (() => void) | undefined;

	// ── Shared utility ───────────────────────────────────────────────────
	getFileContents: <T extends TypeMappings>({ url, options, callback }: {
		url: string;
		options: {
			type?: keyof TypeMapping;
			anonymous?: boolean;
			language?: string;
		};
		callback: (arg: T) => void;
	}) => Promise<void>;

	prototype: NMPlayer<Record<string, any> & T>;
}
