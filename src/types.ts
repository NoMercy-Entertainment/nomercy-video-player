

import type { IVideoBackend, VideoBackendKind } from './player/video-backend/backend';
import type {
	AudioTrack as KitAudioTrack,
	BaseEventMap,
	BasePlayerConfig,
	BasePlaylistItem,
	Chapter as KitChapter,
	QualityLevel,
	SubtitleTrack as KitSubtitleTrack,
} from '@nomercy-entertainment/nomercy-player-core';

export type { QualityLevel };

/** Re-export under domain names so video consumers don't reach into core. */
export type SubtitleTrackRef = KitSubtitleTrack;
export type AudioTrackRef = KitAudioTrack;
export type ChapterRef = KitChapter;

export interface SkipperRange {
	start: number;
	end: number;
}

export interface SkipperData {
	intro?: SkipperRange;
	recap?: SkipperRange;
	credits?: SkipperRange;
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
	audioTracks?: AudioTrackRef[];
	chapters?: ChapterRef[];
	previewSpriteUrl?: string;
	skippers?: SkipperData;
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
	quality: { level: number; label: string };
	chapter: { index: number; title: string };
	pip: { active: boolean };
	theater: { active: boolean };
	fullscreen: { active: boolean };
	float: { active: boolean };
	mute: { muted: boolean };
	volume: { level: number };
	repeat: { state: RepeatState };
	shuffle: { state: ShuffleState };
	aspectRatio: { value: 'uniform' | 'fill' | 'exactfit' | 'none' };
	// `subtitle` (track index) and `subtitleCue` (active cue stream) are
	// inherited from `BaseEventMap` — the kit owns those signals so any
	// consumer (overlay plugins, debug widgets, a11y tooling) can subscribe
	// without depending on a specific player package.
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
	/** Initial playlist — items inline OR a URL fetched and parsed at setup. */
	playlist?: T[] | string;
}

export type Stretching = NonNullable<VideoPlayerConfig['stretching']>;
