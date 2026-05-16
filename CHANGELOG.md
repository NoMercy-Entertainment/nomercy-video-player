# Changelog — @nomercy-entertainment/nomercy-video-player

## [2.0.0] — 2026-05-16

Rebuilt on `@nomercy-entertainment/nomercy-player-core` 2.0.0. The shared player
infrastructure (transport, queue, plugin runtime, auth, i18n, lifecycle) has moved into
the kit. All public API from v1.x is retained — import names are unchanged.

### Added

- `NMVideoPlayer` rebuilt as a mixin-composed class over the kit core
- `Html5VideoBackend` adapter — encapsulates all `<video>` element + HLS.js state;
  swappable via the kit's `stream` adapter port
- HDR-aware ABR: constrains HLS.js level selection to the active display's
  dynamic-range capability; updates live when the window moves to another monitor
- Plugin subpath exports: `./plugins/cast-sender`, `./plugins/desktop-ui`,
  `./plugins/drm`, `./plugins/embed`, `./plugins/key-handler`, `./plugins/live-transcoding`,
  `./plugins/media-session`, `./plugins/message`, `./plugins/octopus`, `./plugins/skipper`,
  `./plugins/subtitle-overlay`, `./plugins/tab-leader`, `./plugins/touch-zones`
- `desktop-ui` plugin: progressive breakpoint system, container queries, vertical playlist
  menu in portrait, double-tap touch seek, chapter buttons, dialog overlay redesign,
  in-popup mute button
- `touch-zones` plugin: debounced controlsVisible state machine, double-tap seek,
  center-tap toggles playback regardless of controls state
- `tv-ui` plugin: TV remote color-button + universal media-key bindings
- `auto-advance` plugin
- `subtitle-overlay` adapter with container-relative sizing and a11y clamp
- `vtt-chapters` and `vtt-sprite` adapters
- `subtitle-style-store` adapter
- `video-backend` adapter port (`./dist/player/video-backend/`)
- HLS.js is now a peer dependency (optional) — ESM-only build, no CJS/UMD outputs
- `sideEffects: false` — full tree-shaking support

### Fixed (from 1.2.7 work, carried into 2.0.0)
- HLS: stale instance destroyed before creating a new one on stream switch
- `resolveUrl` consults `imageBasePath` for poster/cast categories
- MediaSession seeds metadata from existing current item on plugin `use()`
- `currentEpoch` serializes `current()` autoplay to prevent stale loads on rapid
  episode switches
- `load()` rejects on fatal HLS errors before metadata arrives
- Poster applied synchronously to eliminate black-frame gap on source change
- `10s` hard timeout on `waitForLoadedMetadata` to unblock stuck HLS pipelines

### Breaking Changes (v1 → v2)

**Consumer API**

- `seek(t)` renamed to `currentTime(t)` — `seek` is gone with no alias
- `speed(v)` / `speeds()` renamed to `playbackRate(v)` / `playbackRates()`
- `muted(bool)` removed — use `mute()` / `unmute()` / `toggleMute()`
- `quality(idx)` renamed to `currentQuality(idx)`
- `audioTrack(idx)` renamed to `currentAudioTrack(idx)`
- `subtitle(idx)` renamed to `currentSubtitle(idx)`
- `chapter(time)` renamed to `currentChapter()` — v2 reads from current position, no arg
- `fullscreen(v)` renamed to `fullscreenState(v)`
- `pip(v)` renamed to `pipState(v)`
- `theater(v)` renamed to `theaterState(v)`
- `aspect(v)` renamed to `aspectRatio(v)`
- `playlist()` renamed to `queue()`; `setPlaylist(items)` renamed to `queue(items)`
- `playVideo(idx)` renamed to `seekToIndex(idx)`
- `playlistItem(idx)` split into `current()` + `seekToIndex(idx)`
- `playlistIndex()` renamed to `currentIndex()`
- `state()` renamed to `playState()`
- `element()` renamed to `container` (property, no call)
- `buffer()` renamed to `bufferedRanges()`
- `fetchPlaylist(url)` renamed to `loadQueue(url, parser?)`
- `registerPlugin(name, inst)` replaced by `addPlugin(PluginClass, opts?)`
- `usePlugin(name)` removed — plugins activate automatically in `addPlugin`
- `plugin(name)` renamed to `getPluginById(id)`
- `getAccessToken()` replaced by `player.auth()?.bearerToken`
- `setAccessToken(t)` replaced by `player.auth({ bearerToken: t })`
- `localize(key)` renamed to `t(key, vars?)`
- `hasSpeeds()`, `hasQualities()`, `hasAudioTracks()`, `hasSubtitles()` removed — derive from `.length` checks
- `setEpisode(season, ep)` removed — use `queue()` + `current(item)`
- `seasons()` removed — derive from `player.queue()` grouped by `item.season`
- `skippers()` / `skip()` relocated to `SkipperPlugin`
- `gain()` / `addGainNode()` / `removeGainNode()` relocated to `AudioGraphPlugin`
- `displayMessage()` relocated to `MessagePlugin`
- `setMediaAPI()` replaced by `addPlugin(MediaSessionPlugin)`
- `playerUIPlugin` renamed to `DesktopUiPlugin`
- `setTitle()` removed — consumer concern; player must not touch `document.title`
- `float(v)` removed — consumer viewport concern
- `hls` property (raw HLS.js instance) removed — backend-internal
- `setConfig(opts)` removed — use typed methods (`auth()`, `baseUrl()`, `volume()`)

**Event renames**

- `item` event renamed to `current`
- `playlist` event renamed to `queue`
- `playlistComplete` and `complete` events renamed to `queue:exhausted`
- `subtitleChanged` renamed to `subtitle`
- `subtitles` (cue data) renamed to `subtitleCue`
- `levelsChanged` renamed to `level-switched`
- `speed` event removed — use `playbackRate` event

**Event payload shape changes**

- `play` / `pause`: `TimeData` → `ActionOptions`
- `time` / `seek` / `seeked` / `duration`: multi-field struct → `{ time: number }` or `{ duration: number }`
- `current` (was `item`): `PlaylistItem` → `{ item: T; index: number }`
- `error` / `warning`: `MediaError` / `string` → `PlayerErrorEvent`
- `volume` / `mute`: `VolumeState` object → `{ level: number }` / `{ muted: boolean }`
- `levels` / `level-switched`: raw arrays → `{ levels: QualityLevel[] }` / `{ level: number }`
- `audioTracks`: `AudioTrack[]` → `{ tracks: AudioTrack[] }`
- `subtitle` (was `subtitleChanged`): `SubtitleTrack | undefined` → `{ index: number | null }`
- `fullscreen` / `pip` / `theater` / `float`: `boolean` → `{ active: boolean }`
- `waiting` / `canplay`: `HTMLVideoElement` → `void`

**PlaylistItem field changes**

- `file: string` renamed to `url?: string` — **silent break if server emits `file` and app passes items directly to player**
- `image: string` renamed to `poster?: string`
- `duration: string` (formatted) changed to `duration?: number` (seconds) — **formatters will receive NaN**
- `description` / `year` / `uuid` / `seasonName` removed
- `progress: { time, date }` reshaped to `progress?: { timestamp, percentage }`
- `tracks[kind='skippers']` sidecar VTT format replaced by `skippers: { intro?, recap?, credits? }` structured object
- `tracks[kind='sprite']` replaced by `previewSpriteUrl?: string` top-level field

**Package / build**

- `dependencies: { "hls.js" }` removed; install `hls.js` as your own peer dependency
- `@nomercy-entertainment/media-session` removed — media session is now `plugins/media-session`
- `webvtt-parser` removed — kit cue parser registry handles VTT
- Raw `./src/*` export paths removed — all public API via `dist/` subpaths only
- CJS and UMD builds dropped — ESM only (`"type": "module"`)
- `main` field now points to `./dist/index.js` (ESM)

**Migration guide:** See [MIGRATION.md](./MIGRATION.md) for per-change detail, code examples, and downstream project notes.

---

## [1.2.7] — 2026-04-06

### Fixed
- Dependency vulnerabilities: bumped `brace-expansion`, `picomatch`, `path-to-regexp`, `yaml` (dependabot GHSA advisories)

---

## [1.2.6] — 2026-04-06

### Changed
- Rebuilt dist with `nomercy-media-session` 1.1.3

---

## [1.2.5] — 2026-04-06

### Fixed
- Rebuilt with `nomercy-media-session` 1.1.2 (ChapterInformation fallback)

---

## [1.2.4] — 2026-04-06

### Changed
- Bumped `nomercy-media-session` to `^1.1.2`

---

## [1.2.3] — 2026-04-03

### Added
- Media Session: chapter markers and MediaSession action handler cleanup integrated

---

## [1.2.2] — 2026-03-09

### Fixed
- Seven ship-blocking bugs: HLS error recovery, VTT parsing edge cases, PIP listener leaks, seek event payload shape

---

## [1.2.0] — 2026-03-08

### Added
- `toTitleCase` exported as standalone function
- Utility functions reference page added to wiki

### Removed
- `String.prototype` extensions (toTitleCase was previously monkey-patching the prototype)

---

## [1.1.0] — 2026-03-08

### Added
- `token` getter/setter for reactive access token resolution (consumers no longer need to pass a static string at setup time)

### Fixed
- `hasListeners()` now detects listeners registered with `once()`

---

## [1.0.3] — 2026-03-08

### Fixed
- Translations file fetch queued via `queueMicrotask` for correct async ordering

---

## [1.0.2] — 2026-03-08

### Fixed
- Locale files bundled into dist to avoid CORS failures when fetching from raw.githubusercontent.com

---

## [1.0.1] — 2026-03-08

### Fixed
- `createSubtitleOverlay()` now creates the `subtitleSafeZone` element
- Test coverage expanded from 491 to 631 tests

---

## [1.0.0] — 2026-03-07

Stable release. All beta.x API stabilised. Full backwards-compat shim layer for 0.x consumers retained.

### Changed
- Fonts externalized to CDN; `tailwind-merge` removed; `hls.js` externalized from ESM/CJS bundles

---

## [1.0.0-beta series] — 2026-02-28 → 2026-03-07

A series of 28 pre-releases that collectively introduced the following breaking changes relative to 0.6.x.
All breaking changes have **deprecated shims** on the 1.x prototype unless noted.

### Breaking Changes (0.6.x → 1.0.0)

**Architecture**
- Monolithic `index.ts` split into focused mixin modules (`playback`, `volume`, `display`, `subtitles`, `audio`, `quality`, `chapters`, `skippers`, `playlist`, `dom`, `translations`, `events`, `ui-state`, `core`). Public API surface unchanged; internal imports no longer valid.

**Constructor / factory**
- Package default export is now a factory function `nmplayer(id?) => NMPlayer`, not a class. `new NoMercyPlayer(opts)` no longer works. Shim: cast player already handles both shapes in VideoPlayer.vue.

**`ready` event timing** (breaking, no shim)
- `ready` now fires immediately after `init()` (player API available), not on `durationchange` (media loaded). Consumers who used `ready` to know that duration was valid must now wait for `duration` event or check `getDuration()` after a `time` event.

**Removed events** (no shim)
- `back-button` — removed. Consumer code listening to this event receives nothing.
- `absolutePositionReady` — removed.
- `overlay` — removed.
- `nextClick` — removed.
- `controls` / `showControls` / `hideControls` — **deprecated forwarders re-emit these** from the new `active` event, so existing listeners continue to work.

**Renamed events** (deprecated aliases kept)
- `captionsList` → `subtitleList`
- `captionsChanged` → `subtitleChanged`
- `captionsChanging` → `subtitleChanging`
- `dynamicControls` → `interaction`
- `displayClick` → `player-click`
- `display-message` → `message`
- `remove-message` → `message-dismiss`

**Added events**
- `complete` — fires when a single item finishes (before `playlistComplete`)
- `player-dblclick`

**Getter/setter API unification** (old names kept as deprecated shims)
- All `get*` / `set*` / `current*` prefixes removed from the public API. Methods are now dual getter/setters: e.g. `volume()` to read, `volume(50)` to write.
- Renamed: `rewindVideo(t)` → `rewind(t)`, `forwardVideo(t)` → `forward(t)`
- Caption → subtitle renaming: `getCaptionsList` → `subtitles()`, `setCurrentCaption` → `subtitle(index)`, etc.

**Index convention change for subtitle and quality** (breaking when using raw indices)
- Subtitle: `subtitle(-1)` = Off (was: `setCurrentCaption(0)` = Off; index 0 meant Off, 1+ real tracks)
- Quality: `quality(-1)` = Auto (was: Auto prepended at index 0)
- Deprecated shims `getCurrentQuality()` and `setCurrentQuality()` translate the old convention automatically.

**Methods without deprecated shims** (cast-player uses these)
- `getAudioTrack()` → use `audioTrackIndex()`
- `getSubtitleTrack()` → use `subtitleIndex()`
- `getSubtitleTracks()` → use `subtitles()`
- `setAudioTrack(id)` → use `audioTrack(index)`
- `setSubtitleTrack(id)` → use `subtitle(index)`
- `setQuality(id)` → use `quality(index)`
- `getActualQualityLabel()` → not exposed; no equivalent; quality label is in `qualityLevels()[index].label`
- `getAutoSkipChapters()` / `setAutoSkipChapters()` → not in video-player API at any version (was a UI-layer concept in old cast receiver)
- `getCurrentChapter()` with no args → shim exists but now requires `currentTime: number`; zero-arg call returns `undefined`

**`PlaylistItem` shape**
- Fields `subtitle`, `backdrop`, `resumeFromMs`, `overview` are not part of the typed `PlaylistItem` interface. These are application-level extensions that consumers add via the generic `T` parameter on `NMPlayer<T>`. The cast player's `playlistItem()` call relies on these fields being present — they will be if the playlist was loaded with items that include them, but TypeScript won't see them without the generic.

---

## [0.6.10] — baseline (cast-player pin)

Last 0.x release before the 1.0 rewrite. See git history for individual 0.x changes.
