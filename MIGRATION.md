# Migration Guide — nomercy-video-player v1 → v2

This guide covers every breaking change between `@nomercy-entertainment/nomercy-video-player` v1 and v2. Read it before upgrading.

For kit-level changes (subpath imports, adapter ports, five-layer architecture), see the [kit migration guide](../../nomercy-player-kit/MIGRATION.md).

---

## TL;DR — is my import broken?

The npm package name is the same: `@nomercy-entertainment/nomercy-video-player`. The import `{ nmplayer, NMVideoPlayer }` resolves identically. If you are on npm `^1.x` you will not automatically receive v2 — you must opt in with `^2.0.0`.

**Your code will break.** Every `player.on(...)` call needs updating because event payload shapes changed across the board. Method names changed. Playlist item field names changed. The plugin API is a full replacement.

Read the checklist below, then work through each section.

---

## Quick migration checklist

- Replace `player.seek(t)` with `player.currentTime(t)`
- Replace `player.speed(v)` / `player.speeds()` with `player.playbackRate(v)` / `player.playbackRates()`
- Replace `player.muted(bool)` with `player.mute()` / `player.unmute()`
- Replace `player.quality(idx)` with `player.currentQuality(idx)`
- Replace `player.audioTrack(idx)` with `player.currentAudioTrack(idx)`
- Replace `player.subtitle(idx)` with `player.currentSubtitle(idx)`
- Replace `player.playlist()` with `player.queue()`, `player.setPlaylist(items)` with `player.queue(items)`
- Replace `player.playVideo(idx)` with `player.seekToIndex(idx)`
- Replace `player.fetchPlaylist(url)` with `player.loadQueue(url, parser?)`
- Replace `player.element()` with `player.container`
- Replace `player.state()` with `player.playState()`
- Replace `player.registerPlugin(name, inst)` with `player.addPlugin(PluginClass, opts?)`
- Replace `player.usePlugin(name)` — plugins activate automatically in `addPlugin()`
- Replace `player.plugin(name)` with `player.getPluginById(id)`
- Replace `player.localize(key)` with `player.t(key, vars?)`
- Replace `player.getAccessToken()` with `player.auth()?.bearerToken`
- Replace `player.setAccessToken(t)` with `player.auth({ bearerToken: t })`
- Replace `item.file` with `item.url` on every playlist item (see [silent-break risk](#item-file--item-url))
- Replace `item.duration` string with `item.duration` number (was formatted string, now seconds)
- Update every `player.on(...)` event handler — payload shapes changed for all events
- Remove calls to `hasSpeeds()`, `hasQualities()`, `hasAudioTracks()`, `hasSubtitles()` — derive from lengths
- Remove calls to `setEpisode(s, e)` — use `queue(items)` + `current(targetItem)` instead

---

## Events renamed

| v1 event | v2 event |
|----------|----------|
| `item` | `current` |
| `playlist` | `queue` |
| `playlistComplete` | `queue:exhausted` |
| `complete` | `queue:exhausted` |
| `subtitleChanged` | `subtitle` |
| `subtitles` (cue data) | `subtitleCue` |
| `levelsChanged` | `level-switched` |
| `speed` | (removed — use `playbackRate` event) |

---

## Events removed

These events no longer exist in v2. No compatibility shim is provided.

| v1 event | Why removed | v2 replacement |
|----------|-------------|----------------|
| `speed` | `playbackRate` event covers it | Listen to `playbackRate` |
| `captionsChanged` | Deprecated in late v1 | Listen to `subtitle` |
| `captionsList` | Deprecated in late v1 | Listen to `subtitle` (index change) |
| `visualQuality` | Internal hls.js detail, leaked publicly | No replacement — backend-internal |
| `audioTrackChanged` | Superseded by payload on `audioTracks` | Filter `audioTracks` event |
| `hls` | Was never a real event; hls.js internal | No replacement |
| `active` | UI plugin concern | Desktop UI plugin |
| `controls` / `showControls` / `hideControls` | Deprecated in v1 | Desktop UI plugin |
| `theaterMode` | Deprecated alias | `theater` event |
| `pip-internal` | Internal detail | `pip` event |
| `interaction` | UI concern | Desktop UI plugin |
| `player-click` | UI concern | Desktop UI plugin |
| `fonts` | Backend-internal now | No replacement |

---

## Events — payload shapes changed

Every event that carried a raw element or a complex multi-field object now carries a typed wrapper object. Update every `player.on(...)` call.

| v1 event | v1 payload | v2 payload |
|----------|-----------|-----------|
| `play` | `TimeData` | `ActionOptions` (check `source` field for what triggered it) |
| `pause` | `TimeData` | `ActionOptions` |
| `time` | `TimeData` (8 fields) | `{ time: number }` |
| `seek` | `TimeData` | `{ time: number; source?: string }` |
| `seeked` | `TimeData` | `{ time: number }` |
| `duration` | `TimeData` | `{ duration: number }` |
| `current` (was `item`) | `PlaylistItem` | `{ item: T; index: number }` |
| `queue` (was `playlist`) | `PlaylistItem[]` | `BasePlaylistItem[]` |
| `error` | `MediaError \| undefined` | `PlayerErrorEvent` |
| `warning` | `string` | `PlayerErrorEvent` |
| `volume` | `VolumeState` object | `{ level: number }` |
| `mute` | `VolumeState` object | `{ muted: boolean }` |
| `levels` | `Level[]` | `{ levels: QualityLevel[] }` |
| `level-switched` (was `levelsChanged`) | `CurrentTrack` | `{ level: number }` |
| `audioTracks` | `AudioTrack[]` | `{ tracks: AudioTrack[] }` |
| `subtitle` (was `subtitleChanged`) | `SubtitleTrack \| undefined` | `{ index: number \| null }` |
| `subtitleCue` | (new) | `SubtitleCueChange` |
| `fullscreen` | `boolean` | `{ active: boolean }` |
| `pip` | `boolean` | `{ active: boolean }` |
| `theater` | `boolean` | `{ active: boolean }` |
| `float` | `boolean` | `{ active: boolean }` |
| `waiting` | `HTMLVideoElement` | `void` |
| `canplay` | `HTMLVideoElement` | `void` |

---

## Methods renamed

| v1 method | v2 method |
|-----------|-----------|
| `seek(t)` | `currentTime(t, opts?)` |
| `speed(v?)` | `playbackRate(r?)` |
| `speeds()` | `playbackRates()` |
| `muted(v?)` | `mute()` / `unmute()` / `toggleMute()` |
| `quality(idx?)` | `currentQuality(idx?)` |
| `audioTrack(idx?)` | `currentAudioTrack(idx?)` |
| `audioTrackIndex()` | `currentAudioTrack()` (getter overload) |
| `subtitle(idx?)` | `currentSubtitle(idx?)` |
| `subtitleIndex()` | `currentSubtitle()` (getter overload) |
| `chapter(time)` | `currentChapter()` |
| `fullscreen(v?)` | `fullscreenState(v?)` |
| `enterFullscreen()` | `fullscreenState(true)` or `toggleFullscreen()` |
| `exitFullscreen()` | `fullscreenState(false)` |
| `pip(v?)` | `pipState(v?)` |
| `theater(v?)` | `theaterState(v?)` |
| `aspect(v?)` | `aspectRatio(v?)` |
| `playlist()` | `queue()` |
| `setPlaylist(items)` | `queue(items)` |
| `load(items)` | `queue(items)` |
| `fetchPlaylist(url)` | `loadQueue(url, parser?)` |
| `playVideo(idx)` | `seekToIndex(idx, opts?)` |
| `playlistItem(idx?)` | `current()` / `seekToIndex(idx)` |
| `playlistIndex()` | `currentIndex()` |
| `state()` | `playState()` |
| `element()` | `player.container` (property) |
| `buffer()` | `bufferedRanges()` |
| `timeData()` | `timeData()` (payload shape changed) |
| `registerPlugin(name, inst)` | `addPlugin(PluginClass, opts?)` |
| `usePlugin(name)` | (automatic on `addPlugin`) |
| `plugin(name)` | `getPluginById(id)` |
| `getAccessToken()` | `player.auth()?.bearerToken` |
| `setAccessToken(t)` | `player.auth({ bearerToken: t })` |
| `localize(key)` | `player.t(key, vars?)` |
| `setup(opts)` | `setup(opts)` — signature completely changed (see config diff below) |

---

## Methods removed

These methods have no direct v2 replacement. Use the alternatives described.

| v1 method | Alternative |
|-----------|-------------|
| `hasSpeeds()` | `player.playbackRates().length > 1` |
| `hasQualities()` | `player.qualityLevels().length > 0` |
| `hasAudioTracks()` | `player.audioTracks().length > 1` |
| `hasSubtitles()` | `player.subtitles().length > 0` |
| `hdrSupported()` | Backend-internal; use `player.canPlay(profile)` |
| `setEpisode(season, ep)` | Find item in `player.queue()`, call `player.current(item)` |
| `isFirstPlaylistItem()` | `player.currentIndex() === 0` |
| `isLastPlaylistItem()` | `player.currentIndex() === player.queueLength() - 1` |
| `hasPlaylists()` | `player.queueLength() > 1` |
| `seasons()` | Derive from `player.queue()` grouped by `item.season` |
| `tracks(kind?)` | Call `player.subtitles()`, `player.audioTracks()`, `player.chapters()` separately |
| `setPlaylistItemCallback(fn)` | Listen to the `beforeLoad` cancellable event |
| `storeSubtitleChoice()` | Consumer or plugin responsibility |
| `setCurrentAudioTrackFromStorage()` | Consumer or plugin responsibility |
| `setCurrentCaptionFromStorage()` | Consumer or plugin responsibility |
| `subtitleIndexBy(lang, type, ext)` | Filter `player.subtitles()` by your criteria |
| `loadSource(url)` | Use `player.load(item)` with a full item object |
| `setConfig(opts)` | Use typed methods: `auth()`, `baseUrl()`, `volume()`, etc. |
| `setTitle(text)` | Consumer concern — do not call player for this |
| `displayMessage(msg)` | `player.getPlugin(MessagePlugin).show(msg)` |
| `currentSrc()` | `player.current()?.url` |
| `skippers()` | `player.getPlugin(SkipperPlugin).skippers()` |
| `skip()` | `player.getPlugin(SkipperPlugin).skip(kind?)` |
| `gain(v?)` | `player.getPlugin(AudioGraphPlugin)` |
| `addGainNode()` | `AudioGraphPlugin` |
| `removeGainNode()` | `AudioGraphPlugin.dispose()` |
| `setMediaAPI()` | `player.addPlugin(MediaSessionPlugin)` |
| `hls` (property) | Backend-internal; no public access path |
| `fetchChapterFile()` | Backend-driven through `IChapterSource` adapter |
| `fetchSubtitleFile()` | Backend-driven through cue parser registry |
| `buildSubtitleFragment()` | `SubtitleOverlayPlugin` handles rendering |
| `float(v?)` | Consumer viewport concern — IntersectionObserver in your app |
| `ui_addActiveClass()` / `ui_removeActiveClass()` | `DesktopUiPlugin` |
| `ui_resetInactivityTimer()` | `DesktopUiPlugin` |
| `resize()` | Consumer or plugin concern |
| `hdrSupported()` | Backend-internal |

---

## `item.file` → `item.url`

> **This is the highest-risk silent break in the migration.**

v1 `PlaylistItem` used `file: string` as the video source URL. v2 `VideoPlaylistItem` uses `url?: string`.

If your server API returns playlist items with a `file` field and you pass them to the player without mapping, **the player will silently receive `undefined` for the source URL and fail to load**.

```ts
// v1 — server returns { file: '...', title: '...' }
player.setPlaylist(serverItems);  // worked because player read item.file

// v2 — BREAKS. item.url is undefined, player cannot load the source.
player.queue(serverItems);

// v2 — correct. Map the field before passing to the player:
player.queue(serverItems.map(item => ({ ...item, url: item.file })));
```

Coordinate with the server team: the cleanest fix is to update the server API response to emit `url` instead of `file`. Until then, map at the call site in your adapter layer.

Additional `PlaylistItem` shape changes:

| v1 field | v2 field | Change |
|----------|----------|--------|
| `file: string` (required) | `url?: string` | Renamed + now optional |
| `duration: string` (formatted, e.g. `"1:24:36"`) | `duration?: number` (seconds) | Type changed — `"1:24:36"` becomes `NaN` in v2 |
| `image: string` (required) | `poster?: string` | Renamed + optional |
| `description: string` (required) | (removed) | No equivalent |
| `year?: number` | (removed) | No equivalent |
| `uuid?: string` | (removed) | No equivalent |
| `seasonName?: string` | (removed) | No equivalent |
| `progress: { time, date }` | `progress?: { timestamp, percentage }` | Reshaped — `time+date` → `timestamp+percentage` |
| `tracks[{ kind:'subtitles' }]` | `subtitles?: SubtitleTrackRef[]` | Now a typed top-level field |
| `tracks[{ kind:'chapters' }]` | `chapters?: ChapterRef[]` | Now a typed top-level field |
| `tracks[{ kind:'skippers' }]` | `skippers?: { intro?, recap?, credits? }` | **Format changed** — see below |
| `tracks[{ kind:'sprite' }]` | `previewSpriteUrl?: string` | Promoted to a top-level string field |

**`duration` type change is high risk.** Any component passing `item.duration` to a formatter (e.g. to display `"1:24:36"`) will receive a number instead and produce incorrect output. Update formatters to accept `number` (seconds).

**`progress` shape change affects continue-watching.** If your UI reads `item.progress.time` to restore position, update to `item.progress.timestamp`.

**`skippers` format changed.** v1 expected a `kind='skippers'` sidecar VTT file reference in `tracks[]`. v2 `SkipperPlugin` reads `item.skippers: { intro?: TimeRange, recap?: TimeRange, credits?: TimeRange }`. Either update the server response or register a custom cue parser that bridges the VTT format to the structured object.

---

## `PlaylistItem` generic parameter

`NMVideoPlayer<T extends VideoPlaylistItem>` is generic in v2. Your playlist item type is threaded through the player's type system, so `player.current()` returns `T | undefined` rather than `VideoPlaylistItem | undefined`.

```ts
interface MyPlaylistItem extends VideoPlaylistItem {
  internalId: string;
  rating: number;
}

const player = nmplayer<MyPlaylistItem>('player-1').setup({ ... });

// player.current() is typed as MyPlaylistItem | undefined
const item = player.current();
item?.internalId; // typed, no cast needed
```

---

## Subtitle and quality index convention

v1's `subtitle(idx)` and `quality(idx)` setters accepted index values where `-1` meant "disable subtitles" or "auto quality". v2 follows the same convention: `-1` / `null` means disabled/auto.

`currentQuality()` still returns the HLS.js `currentLevel` index where `-1` means auto-select. The getter is unchanged.

`currentSubtitle()` returns `number | null` where `null` means off.

---

## `ready` event timing

v1 fired `ready` after a hardcoded timeout (implementation detail). v2 fires `ready` after the full setup pipeline resolves — including all plugins' async `use()` promises. Code that depended on the v1 timing must not assume any specific delay.

If you need to act after the player and all plugins are initialized:

```ts
await player.ready();
// or
player.on('ready', () => { /* all plugins resolved */ });
```

---

## Plugin system replacement

v1 used a string-keyed instance registry:

```ts
// v1
player.registerPlugin('octopus', new OctopusPlugin({ ... }));
player.usePlugin('octopus');
const plugin = player.plugin('octopus');
```

v2 uses a class-based factory:

```ts
// v2
player.addPlugin(OctopusPlugin, { /* options */ });
const plugin = player.getPlugin(OctopusPlugin); // typed return
```

Key differences:
- `addPlugin(Cls, opts)` replaces both `registerPlugin` and `usePlugin` — the plugin activates immediately
- `getPlugin(Cls)` returns the typed plugin instance; no string key, no cast
- Plugin options are passed at registration, not at construction
- Plugins that depend on other plugins declare `static requires = [OtherPluginClass]`; the player enforces registration order
- Cross-plugin event listening is typed via `player.on(PluginClass, eventName, fn)` — no untyped string keys

**Built-in plugins that moved from always-on to opt-in:**

| v1 (always on) | v2 (opt-in — add explicitly) |
|----------------|------------------------------|
| `OctopusPlugin` (was registered by default in some setups) | `player.addPlugin(OctopusPlugin, { ... })` |
| `playerUIPlugin` (always mounted) | `player.addPlugin(DesktopUiPlugin)` |
| `MessagePlugin` (always mounted) | `player.addPlugin(MessagePlugin)` |
| `KeyHandlerPlugin` (always mounted) | `player.addPlugin(KeyHandlerPlugin)` |
| MediaSession (built into player core) | `player.addPlugin(MediaSessionPlugin)` |

**Plugin renamed:** `playerUIPlugin` → `DesktopUiPlugin`

---

## Adapter injection

v2 introduces 32 named adapter ports (28 from the kit + 4 video-specific). All ports have sensible defaults. You only need to inject an adapter when you want to replace the default behavior.

```ts
import { nmplayer, Html5VideoBackend } from '@nomercy-entertainment/nomercy-video-player';
import { VttChapterSource } from '@nomercy-entertainment/nomercy-video-player';
import { browserPlatform, LocalStorageBackend } from '@nomercy-entertainment/nomercy-player-core';

const player = nmplayer('player-1').setup({
  // Injecting kit adapters:
  platform: browserPlatform,
  storage: new LocalStorageBackend(),
  accessToken: () => myAuth.getToken(),

  // Injecting a video-specific adapter:
  chapterSource: new VttChapterSource('https://cdn.example.com/chapters.vtt'),
});
```

For native-shell environments (Capacitor, Tauri, Electron), override individual platform sub-ports without rebuilding the entire platform bundle:

```ts
player.setup({
  platform: { ...browserPlatform, wakeLock: myNativeWakeLock },
});
```

See the [kit migration guide](../../nomercy-player-kit/MIGRATION.md) for the full port catalog and subpath import table.

---

## Subpath imports

v2 exports each adapter and plugin from a dedicated subpath, enabling tree-shaking. The root barrel import still works; subpaths are opt-in.

```ts
// Still works (barrel):
import { OctopusPlugin, DesktopUiPlugin } from '@nomercy-entertainment/nomercy-video-player';

// Tree-shakeable subpaths:
import { OctopusPlugin } from '@nomercy-entertainment/nomercy-video-player/plugins/octopus';
import { DesktopUiPlugin } from '@nomercy-entertainment/nomercy-video-player/plugins/desktop-ui';
import { Html5VideoBackend } from '@nomercy-entertainment/nomercy-video-player/adapters/video-backend';
import { VttChapterSource } from '@nomercy-entertainment/nomercy-video-player/adapters/chapter-source';
import { VttSpriteThumbnailSource } from '@nomercy-entertainment/nomercy-video-player/adapters/thumbnail-source';
import { StorageBackedSubtitleStyleStore } from '@nomercy-entertainment/nomercy-video-player/adapters/subtitle-style-store';
```

---

## Configuration shape changes

### Renamed config fields

| v1 field | v2 field |
|----------|----------|
| `accessToken` | `auth: { bearerToken: ... }` |
| `basePath` | (removed — use `baseUrl`) |
| `displayLanguage` | `language` |
| `customStorage` | `storage` |
| `log` | `logLevel` + `logger` |
| `controlsTimeout` | Desktop UI plugin option |
| `doubleClickDelay` | Key handler plugin option |

### Removed config fields

| v1 field | Reason |
|----------|--------|
| `disableHls` | Backend decision — use `backendFactory` |
| `forceHls` | Backend decision — use `backendFactory` |
| `float` | Consumer viewport concern |
| `pip` (config object) | Replaced by `pipState()` method + desktop UI plugin |
| `messagePlugin` | Use `addPlugin(MessagePlugin)` |
| `disableTouchControls` | Use `addPlugin(TouchZonesPlugin)` and disable |
| `chapters` (boolean) | Always through `IChapterSource` adapter |
| `stretching: '16:9'` / `'4:3'` | Use `'uniform'` + player sizing |

### New config fields

| v2 field | Description |
|----------|-------------|
| `auth` | Auth pipeline config — bearer token, refresh, request signing |
| `backendFactory` | Inject a custom `IVideoBackend` |
| `defaultSubtitleLanguage` | Language code for initial subtitle selection |
| `defaultAudioLanguage` | Language code for initial audio track selection |
| `defaultQuality` | `'auto'` or a quality level index |
| `preloadLeadSeconds` | Seconds ahead to preload |
| `drm` | DRM config for `DrmPlugin` |
| `cast` | Cast config for `CastSenderPlugin` |
| `platform` | Full platform abstraction bundle |

---

## Upgrading downstream NoMercy projects

### nomercy-app-web

High-impact areas:
- Every `player.on(...)` event handler in the music and video views needs payload updates (all events)
- `setEpisode(s, e)` calls in the episode player need replacing with `queue(items)` + `current(item)` navigation
- `hasSpeeds()`, `hasQualities()`, `hasAudioTracks()`, `hasSubtitles()` calls in control-visibility logic need replacing with `.length` checks
- `seasons()` call in the series view needs replacing with a groupBy over `player.queue()`
- `progress.time` → `progress.timestamp` in continue-watching logic
- `item.duration` formatting — was string, now number in seconds
- `item.file` → `item.url` in the adapter layer that maps server responses to playlist items
- Plugin registrations: `registerPlugin(name, inst)` → `addPlugin(Class, opts)` for Octopus, key handler, and any UI plugins

### nomercy-cast-player

The cast receiver is currently v1-based and is slated for a full rewrite. Migration to v2 should happen as part of that rewrite rather than as an incremental patch.

---

## Getting help

- Issue tracker: [github.com/NoMercy-Entertainment/nomercy-video-player/issues](https://github.com/NoMercy-Entertainment/nomercy-video-player/issues)
- Discord: NoMercy Entertainment server — `#player-dev` channel
- Testbed (live integration reference): `tools/player-testbed/` in the monorepo
- Kit migration guide: `packages/nomercy-player-kit/MIGRATION.md`
