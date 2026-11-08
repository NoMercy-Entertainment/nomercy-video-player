// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

// Video-specific plugins
export { castSenderPlugin, CastSenderPlugin } from './cast-sender';
export type { CastSenderEvents, CastSenderOptions } from './cast-sender';

export type { SettingsToggleItem, SubtitleMenuAction } from './desktop-ui/helpers/menus';
export { desktopUiPlugin, DesktopUiPlugin } from './desktop-ui/index';
export type { DesktopUiOptions } from './desktop-ui/index';
export { drmPlugin, DrmPlugin } from './drm';
export type { DrmEvents, DrmOptions } from './drm';
// Cross-library plugins (from the kit, with video-specific defaults where applicable)
export { keyHandlerPlugin, KeyHandlerPlugin } from './key-handler';
// Heavy orchestration plugins — server coordination, DRM, cast handoff, skip ranges
export { liveTranscodingPlugin, LiveTranscodingPlugin } from './live-transcoding';
export type { LiveTranscodingEvents, LiveTranscodingOptions } from './live-transcoding';

export { mediaSessionPlugin, MediaSessionPlugin } from './media-session';
export { octopusPlugin, OctopusPlugin } from './octopus';
export type { OctopusOptions } from './octopus';
export { subtitleOverlayPlugin, SubtitleOverlayPlugin } from './subtitle-overlay/index';
export type { SubtitleOverlayOptions } from './subtitle-overlay/index';
export { touchZonesPlugin, TouchZonesPlugin } from './touch-zones';
export type { TouchZonesOptions } from './touch-zones';
// TV remote control plugin — subclasses KeyHandlerPlugin with TV-specific bindings
export { tvKeyHandlerPlugin, TvKeyHandlerPlugin } from './tv-key-handler';
export type { TvKeyHandlerOptions } from './tv-key-handler';
export { TwitchPlugin } from './twitch';
export type { TwitchPluginEvents, TwitchPluginOptions } from './twitch';
// Cross-library kit plugins re-exported for ergonomic imports.
export {
	audioGraphPlugin,
	AudioGraphPlugin,
	canvasPlugin,
	CanvasPlugin,
	equalizerPlugin,
	EqualizerPlugin,
	mixerPlugin,
	MixerPlugin,
	spectrumPlugin,
	SpectrumPlugin,
	VisualizationPlugin,
	volumeMemoryPlugin,
	VolumeMemoryPlugin,
} from '@nomercy-entertainment/nomercy-player-core';
export type {
	AudioGraphEvents,
	AudioGraphOptions,
	CanvasEvents,
	CanvasOptions,
	CanvasRenderFn,
	EqBand,
	EqPreset,
	EqualizerEvents,
	EqualizerOptions,
	MixerEvents,
	MixerOptions,
	SpectrumOptions,
	VisualizationFrame,
	VisualizationOptions,
	VolumeMemoryOptions,
} from '@nomercy-entertainment/nomercy-player-core';

export { embedPlugin, EmbedPlugin } from '@nomercy-entertainment/nomercy-player-core/plugins/embed';
export type {
	EmbedCommand,
	EmbedEventMessage,
	EmbedForwardedEvent,
	EmbedOptions,
	EmbedSerializedError,
} from '@nomercy-entertainment/nomercy-player-core/plugins/embed';

export type { KeyBindings, KeyHandlerOptions } from '@nomercy-entertainment/nomercy-player-core/plugins/key-handler';
export type { MediaSessionMetadata, MediaSessionOptions } from '@nomercy-entertainment/nomercy-player-core/plugins/media-session';

export { messagePlugin, MessagePlugin } from '@nomercy-entertainment/nomercy-player-core/plugins/message';
export type { MessageInput, MessageOptions } from '@nomercy-entertainment/nomercy-player-core/plugins/message';

export { tabLeaderPlugin, TabLeaderPlugin } from '@nomercy-entertainment/nomercy-player-core/plugins/tab-leader';
export type { TabLeaderEvents, TabLeaderOptions } from '@nomercy-entertainment/nomercy-player-core/plugins/tab-leader';
