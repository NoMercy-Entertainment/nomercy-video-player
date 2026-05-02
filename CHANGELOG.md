# Changelog — @nomercy-entertainment/nomercy-video-player

## [Unreleased] — next patch after 1.2.7

### Fixed
- HLS: stale instance now destroyed before creating a new one on stream switch, preventing orphaned decoders

---

## [1.2.7] — 2026-04-xx

### Fixed
- Dependency vulnerabilities: bumped `brace-expansion`, `picomatch`, `path-to-regexp`, `yaml` (dependabot GHSA advisories)

---

## [1.2.6] — 2026-04-xx

### Changed
- Rebuilt dist with `nomercy-media-session` 1.1.3

---

## [1.2.5] — 2026-04-xx

### Fixed
- Rebuilt with `nomercy-media-session` 1.1.2 (ChapterInformation fallback)

---

## [1.2.4] — 2026-04-xx

### Changed
- Bumped `nomercy-media-session` to `^1.1.2`

---

## [1.2.3] — 2026-04-xx

### Added
- Media Session: chapter markers and MediaSession action handler cleanup integrated

---

## [1.2.2] — 2026-04-xx

### Fixed
- Seven ship-blocking bugs: HLS error recovery, VTT parsing edge cases, PIP listener leaks, seek event payload shape

---

## [1.2.0] — 2026-03-xx

### Added
- `toTitleCase` exported as standalone function
- Utility functions reference page added to wiki

### Removed
- `String.prototype` extensions (toTitleCase was previously monkey-patching the prototype)

---

## [1.1.0] — 2026-03-xx

### Added
- `token` getter/setter for reactive access token resolution (consumers no longer need to pass a static string at setup time)

### Fixed
- `hasListeners()` now detects listeners registered with `once()`

---

## [1.0.3] — 2026-03-xx

### Fixed
- Translations file fetch queued via `queueMicrotask` for correct async ordering

---

## [1.0.2] — 2026-03-xx

### Fixed
- Locale files bundled into dist to avoid CORS failures when fetching from raw.githubusercontent.com

---

## [1.0.1] — 2026-03-xx

### Fixed
- `createSubtitleOverlay()` now creates the `subtitleSafeZone` element
- Test coverage expanded from 491 to 631 tests

---

## [1.0.0] — 2026-03-xx

Stable release. All beta.x API stabilised. Full backwards-compat shim layer for 0.x consumers retained.

### Changed
- Fonts externalized to CDN; `tailwind-merge` removed; `hls.js` externalized from ESM/CJS bundles

---

## [1.0.0-beta series] — 2026-02-xx → 2026-03-xx

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
