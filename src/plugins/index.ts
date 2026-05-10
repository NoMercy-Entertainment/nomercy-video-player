// Video-specific plugins
export { desktopUiPlugin, DesktopUiPlugin } from './desktop-ui/index';
export type { DesktopUiOptions } from './desktop-ui/index';
export { subtitleOverlayPlugin, SubtitleOverlayPlugin } from './subtitle-overlay/index';
export type { SubtitleOverlayOptions } from './subtitle-overlay/index';
export { octopusPlugin, OctopusPlugin } from './octopus';
export type { OctopusOptions } from './octopus';

// Audio-graph plugins re-exported from core for ergonomic imports.
// Layered composition: addPlugin(audioGraphPlugin) → addPlugin(equalizerPlugin / mixerPlugin / spectrumPlugin / canvasPlugin / visualizers).
// All opt-in — video apps that don't want EQ on audio tracks pay zero cost.
export {
	audioGraphPlugin, AudioGraphPlugin,
	canvasPlugin, CanvasPlugin,
	equalizerPlugin, EqualizerPlugin,
	mixerPlugin, MixerPlugin,
	spectrumPlugin, SpectrumPlugin,
	VisualizationPlugin,
} from '@nomercy-entertainment/nomercy-player-core';
export type {
	AudioGraphEvents, AudioGraphOptions,
	CanvasEvents, CanvasOptions, CanvasRenderFn,
	EqBand, EqPreset, EqualizerEvents, EqualizerOptions,
	MixerEvents, MixerOptions,
	SpectrumOptions,
	VisualizationFrame, VisualizationOptions,
} from '@nomercy-entertainment/nomercy-player-core';

// Cross-library plugins (from the kit, with video-specific defaults where applicable)
export { keyHandlerPlugin, KeyHandlerPlugin } from './key-handler';
export { mediaSessionPlugin, MediaSessionPlugin } from './media-session';
export { tabLeaderPlugin, TabLeaderPlugin } from './tab-leader';
export type { TabLeaderOptions } from './tab-leader';
export { messagePlugin, MessagePlugin } from './message';
export type { MessageOptions } from './message';
export { embedPlugin, EmbedPlugin } from './embed';
export type { EmbedCommand, EmbedEventMessage, EmbedOptions } from './embed';

// Heavy orchestration plugins — server coordination, DRM, cast handoff, skip ranges
export { liveTranscodingPlugin, LiveTranscodingPlugin } from './live-transcoding';
export type { LiveTranscodingOptions, LiveTranscodingEvents } from './live-transcoding';
export { drmPlugin, DrmPlugin } from './drm';
export type { DrmOptions, DrmEvents } from './drm';
export { castSenderPlugin, CastSenderPlugin } from './cast-sender';
export type { CastSenderOptions, CastSenderEvents } from './cast-sender';
export { skipperPlugin, SkipperPlugin } from './skipper';
export type { SkipperOptions, SkipperEvents, SkipperKind, SkipperRange } from './skipper';
