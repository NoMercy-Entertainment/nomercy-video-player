# nomercy-video-player

Headless reference video player built on nomercy-player-core. Adapter-driven.

```
npm install @nomercy-entertainment/nomercy-video-player
```

---

## Quick start

```ts
import { nmplayer, Html5VideoBackend } from '@nomercy-entertainment/nomercy-video-player';
import { browserPlatform, LocalStorageBackend } from '@nomercy-entertainment/nomercy-player-core';
import { DesktopUiPlugin } from '@nomercy-entertainment/nomercy-video-player';

const player = nmplayer('player-1').setup({
  container: document.getElementById('player')!,
  accessToken: () => myAuth.getToken(),
  platform: browserPlatform,
  storage: new LocalStorageBackend(),
  queue: [
    {
      id: '1',
      url: 'https://cdn.example.com/video.m3u8',
      title: 'My Video',
    },
  ],
});

player.addPlugin(DesktopUiPlugin);

await player.ready();
await player.play();
```

---

## Adapter catalog

Four video-specific ports extend the 28 kit ports.

| Port | Interface | Default adapter | Description |
|------|-----------|----------------|-------------|
| video-backend | `IVideoBackend` | `Html5VideoBackend` (HLS.js-backed `<video>`) | Media element management, HLS manifest loading, track list reporting, HDR-aware ABR |
| thumbnail-source | `IThumbnailSource` | `VttSpriteThumbnailSource` | Seeks to a frame thumbnail from a VTT sprite sheet |
| chapter-source | `IChapterSource` | `VttChapterSource` | Parses chapter markers from a WebVTT file |
| subtitle-style-store | `ISubtitleStyleStore` | `StorageBackedSubtitleStyleStore` | Persists user subtitle style preferences across sessions |

---

## HDR-aware ABR

New in v2. The `Html5VideoBackend` detects display dynamic-range capability and constrains HLS.js ABR automatically.

On manifests that carry both SDR and HDR level variants (tagged `VIDEO-RANGE=SDR` or `VIDEO-RANGE=PQ`/`VIDEO-RANGE=HLG`), HLS.js ABR is oblivious to display capability and can select a PQ variant on an SDR display — washed-out colours, wrong colour space. The v2 backend fixes this in three ways:

**Constraint on load.** After `MANIFEST_PARSED`, the backend reads the display's dynamic-range capability via `window.matchMedia('(dynamic-range: high)')`. On SDR displays, `autoLevelCapping` is set to the highest SDR level index so ABR never promotes above it.

**Live display flip.** A `matchMedia` change listener detects when the user moves the browser window between monitors with different display capabilities. On SDR→HDR, the cap is lifted. On HDR→SDR, the cap is applied and the currently-playing level is force-switched to its SDR peer at the same resolution — seamlessly, because same-resolution peers share the same audio group ID in well-formed HLS manifests.

**Interleaved manifest support.** When HDR and SDR levels are interleaved by index (HDR variant index < SDR variant index at the same resolution), `nextLevel` is used to force-switch the currently-playing level to its SDR peer rather than just capping by index.

No configuration is required. The constraint is wired automatically in the backend constructor and torn down on `dispose()`.

---

## Built-in plugins

| Plugin | Class | Description |
|--------|-------|-------------|
| desktop-ui | `DesktopUiPlugin` | Full-featured keyboard and pointer controls for desktop browsers |
| subtitle-overlay | `SubtitleOverlayPlugin` | DOM subtitle renderer — renders `subtitle:cue` events to an overlay element |
| octopus | `OctopusPlugin` | ASS/SSA subtitle renderer via libass compiled to WebAssembly |
| touch-zones | `TouchZonesPlugin` | Tap-zone controls for mobile and touch-screen devices |
| key-handler | `KeyHandlerPlugin` | Keyboard shortcut routing (via kit) |
| media-session | `MediaSessionPlugin` | Media Session API integration (via kit) |
| tab-leader | `TabLeaderPlugin` | Single-tab playback leadership (via kit) |
| message | `MessagePlugin` | Cross-window event bridge (via kit) |
| embed | `EmbedPlugin` | postMessage bridge for iframe-embedded players (via kit) |
| skipper | `SkipperPlugin` | Skip-range enforcement (intro, credits, ad markers) |
| drm | `DrmPlugin` | EME key-system and license server orchestration |
| cast-sender | `CastSenderPlugin` | Google Cast sender integration for Chromecast handoff |
| live-transcoding | `LiveTranscodingPlugin` | Server-driven live transcode delivery |
| audio-graph | `AudioGraphPlugin` | Web Audio routing graph (via kit) — opt-in for EQ on audio tracks |
| equalizer | `EqualizerPlugin` | Parametric EQ with presets (via kit, requires `AudioGraphPlugin`) |
| mixer | `MixerPlugin` | Per-track gain control (via kit, requires `AudioGraphPlugin`) |
| spectrum | `SpectrumPlugin` | Frequency-domain analyser (via kit, requires `AudioGraphPlugin`) |
| canvas | `CanvasPlugin` | Shared canvas surface for visualization (via kit) |
| visualization | `VisualizationPlugin` | rAF-driven rendering callbacks (via kit) |

---

## Composing with the kit

The video player inherits all 28 kit adapter ports and adds its own 4 on top. Kit adapters are injected through the same `setup()` call — there is no separate configuration layer.

```ts
import { nmplayer } from '@nomercy-entertainment/nomercy-video-player';
import { browserPlatform, LocalStorageBackend } from '@nomercy-entertainment/nomercy-player-core';
import { VttChapterSource } from '@nomercy-entertainment/nomercy-video-player';

const player = nmplayer('player-1').setup({
  // Kit adapters:
  platform: browserPlatform,
  storage: new LocalStorageBackend(),
  accessToken: () => myAuth.getToken(),

  // Video-specific adapters:
  chapterSource: new VttChapterSource('https://cdn.example.com/chapters.vtt'),

  queue: [{ id: '1', url: 'https://cdn.example.com/video.m3u8', title: 'My Video' }],
});
```

Platform sub-ports compose cleanly for native-shell environments:

```ts
import { browserPlatform } from '@nomercy-entertainment/nomercy-player-core';

// Swap only the wake-lock controller — keep everything else:
player.setup({
  platform: { ...browserPlatform, wakeLock: capacitorWakeLock },
});
```

---

## License

Apache-2.0

Repository: [github.com/NoMercy-Entertainment/nomercy-video-player](https://github.com/NoMercy-Entertainment/nomercy-video-player)
