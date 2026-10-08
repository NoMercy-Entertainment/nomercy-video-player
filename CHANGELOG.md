# Changelog — @nomercy-entertainment/nomercy-video-player

## [Unreleased]

## [2.2.5] — 2026-10-08

### Changed

- Version alignment with the trio; no code change.

## [2.2.4] — 2026-10-08

### Fixed

- Core 2.2.4: the saved volume no longer turns to 0 after a mute.
- A language-only caption pick now lands on the full track before a sign-language or forced one.
- Only the viewer's own caption pick is remembered.
- The viewer's caption size now applies to ASS tracks and redraws when it changes.

## [2.2.3] — 2026-09-25

### Added

- `disableClickToPause` in `setup()` stops a click from pausing the video.

### Fixed

- Streams added with `registerStream()` are now used for playback.
- Playlist thumbnails load from the configured image URL.
- Changing auth at runtime now applies to media requests.
- Georgia subtitles fall back to a serif font, and subtitle colors match the palette.
- One press of `?` opens the shortcuts overlay.
- Cast artwork shows the right image, and the media-key option works.
- The help key on a TV remote works.

## [2.2.2] — 2026-09-04

### Fixed

- A 404 got the full retry ladder: thirty seconds of spinner on an episode that was never encoded, ending in the generic network error. The file is not late, it is absent, and no amount of waiting changes the answer; 410 is the same answer said more firmly. Both now get no retries and their own code, `core:stream/media-absent`, so a consumer can offer the next item instead of the dead-end overlay it shows for a decode failure. The code matches `CoreErrorCodes.MEDIA_ABSENT` in the Kotlin trio.
- Georgia's subtitle-font fallback was `sans-serif`. Georgia is a serif face, so a client without it installed — Android carries none — fell back to the one font every other choice already draws, collapsing distinct options into each other.


## [2.2.1] — 2026-09-04

### Changed

- Built against `@nomercy-entertainment/nomercy-player-core@2.2.1`. A browser declining autoplay without a user gesture no longer escapes as an uncaught `NotAllowedError`, and `play()` no longer leaves the player reporting `PLAYING` over a stopped video — a UI that renders its play/pause button from state showed Pause over a video that never started.


## [2.1.10] — 2026-08-31

### Fixed

- A caption choice is a language, a variant and a format. The language memory carried the language alone, so a viewer who picked English SDH got plain English back on the next item, and a viewer who picked the `.ass` rendition got the `.vtt` of the same lines without the show's own styling. The whole descriptor is carried now and matched narrowest-first, falling back to the same language rather than to no captions when a device's list has dropped the exact variant. A bare language written by an older build still reads as a choice.

## [2.1.9] — 2026-08-31

### Changed

- The top bar's title and episode line take 75% of the width instead of 60%. A show name reached the ellipsis after four words while a third of the bar sat empty beside it; the buttons keep the quarter they need.

## [2.1.8] — 2026-08-30

### Fixed

- The playlist list still stopped 60% down the picture after 2.1.7 opened the frame. Both rails are `.sub-menu-content`, which caps at 60dvh for the popover sub-menus, and that cap decided the panel's height from the inside. Lifted for the playlist only.

## [2.1.7] — 2026-08-30

### Fixed

- The playlist menu sat in the bottom 60% of the picture with dead space above it. `.menu-content` pushes a sub-menu down with `margin-top: auto` and the pane caps at 60vh, which is right for the short popovers that belong beside the control they came from and wrong for a full-height list. The playlist runs the height of the frame now, the way the native chrome draws it.

## [2.1.6] — 2026-08-30

### Fixed

- An episode card's overview ran on one line and was cut mid-word. The card is a `<button>`, and a host page is entitled to write `button, button > * { white-space: nowrap }`; app-web does, the card inherited it, and the four-line clamp had nothing to clamp. Measured on the live site: the text laid out to 1947px inside a 461px card. The card's text pane asks for `white-space: normal` now.

## [2.1.5] — 2026-08-30

### Fixed

- An episode card's text hung over the right edge of the card. `.playlist-card-right` asked for 75% beside the thumbnail's 37.5%, which is 112.5% of the card, so the overview laid out at a width nobody could see: it never reached a wrap point inside the card and was cut mid-word on a single line instead of filling the four it clamps at. The pane takes the remainder now, which is what the native chrome's `weight(1f)` gives it.

## [2.1.4] — 2026-08-30

### Fixed

- The playlist menu covered the picture and cut its own text. A flex child's `min-width` outranks the frame's `max-width`, so the two rails' 16rem and 36rem minimums pushed the menu past its cap: at a narrower window it reached 96% of the player and each card's overview ran off the right edge mid-word instead of wrapping. The rails ask for those widths as a basis now, and the playlist caps against the player as well as in rem, so it sits at 62% beside the video the way the native chrome draws it.
- The card thumbnail is back to the 37.5% share the rest of the trio uses. 2.1.3 narrowed it to 32%, which treated the symptom rather than the frame.

## [2.1.3] — 2026-08-30

### Fixed

- The playlist menu opened at the frame's full width on every title. The seasons and episode panes each carried a minimum that together reached the 52rem cap, and a card's thumbnail is a percentage of that pane, so the episode art drew larger than any other image in the player. The content minimum is 42rem now and the thumbnail takes 32% up to 176px.

## [2.1.2] — 2026-08-29

### Fixed

- ASS/SSA subtitles rendered in the wrong face. The libass font map was keyed by the attachment's filename, so a release whose attachments are not named after their family resolved nothing and every line fell back to an arbitrary attached font. Keys now come from the font's own name table.
- The chosen audio and subtitle language is remembered and re-applied on every item, instead of the player trusting a track index and the playlist's `DEFAULT` flag — both of which differ per file, so a picked language was lost on the next episode.
- A selected track index left over from the previous item no longer ticks in the menu while the stream plays a different track.

## [2.1.0] — 2026-08-20

### Added

- Re-exports `volumeMemoryPlugin` / `VolumeMemoryPlugin` from `@nomercy-entertainment/nomercy-player-core@2.1.0`, alongside the rest of the kit's audio-graph plugins.
- New `./adapters` subpath export.

### Fixed

- A server that went away is now ridden out as an outage rather than treated as a dead file.

### Changed

- Built against `@nomercy-entertainment/nomercy-player-core@2.1.0`.

## [2.0.3] — 2026-07-31

### Fixed

- `desktop-ui`: the full-width rows ran past their parent by exactly their own padding. `top-row`, `bottom-row`, `language-button` and `playlist-menu-button` each set `width: 100%` alongside horizontal padding without `border-box`, so consumers were patching the overflow themselves.

### Changed

- Built against `@nomercy-entertainment/nomercy-player-core@2.0.3`, which carries the fix for a start item picked between `setup()` and `ready()`. A `?season=&episode=` style deep link now opens on the item it names.

## [2.0.1] — 2026-07-18

First published stable of the v2 line (2.0.0 was withdrawn before release), published under the `latest` dist-tag — a plain `npm install @nomercy-entertainment/nomercy-video-player` now resolves `2.0.1` instead of the v1 `1.2.7`. Built against the stable `@nomercy-entertainment/nomercy-player-core@^2.0.1`. The entries below shipped since `2.0.0-rc.35`; everything earlier is captured in the release-candidate history.

### Changed

- `KeyHandlerPlugin.id` renamed from `video-key-handler` to `key-handler`, matching the core base and the music player. `getPluginById('video-key-handler')` lookups and the `plugin.video-key-handler.speed` translation key move to the `key-handler` spelling; class-based `getPlugin(KeyHandlerPlugin)` callers are unaffected. `TvKeyHandlerPlugin` keeps its distinct `tv-key-handler` id.

### Added

- `./plugins/tv-key-handler` subpath export — `TvKeyHandlerPlugin` no longer requires the `./plugins` barrel.
- `VideoPreloadStrategy` now preloads chapter VTT sidecars (`tracks[].kind === 'chapters'`, category `chapter`) and font manifests (`item.fonts`, category `font`), as its docs already claimed.

### Removed

- `webvtt-parser` + `@types/webvtt-parser` dependencies — declared but never imported; the kit cue parser registry has handled VTT since 2.0.0-beta.0.

## [2.0.0-rc.35] — 2026-07-16

### Added

- `IVideoBackend.bandwidthEstimate?(): number` — an optional backend capability reporting the live stream-engine throughput estimate in bits per second. `Html5VideoBackend` implements it as a pass-through to hls.js's own EWMA `bandwidthEstimate`, returning `0` (never `undefined`/`NaN`) when no HLS instance is bound yet. Native/progressive backends simply omit the method. This is the source-side half of the fix for `bandwidth()` permanently returning `0`: paired with `@nomercy-entertainment/nomercy-player-core@^2.0.0-rc.33`, which resolves the estimate through this new capability. Purely additive — no existing method signature changes. Requires `@nomercy-entertainment/nomercy-player-core@^2.0.0-rc.33` or newer.

## [2.0.0-rc.26] — 2026-07-05

### Changed

- The `time` event now carries core rc.28's full `TimeState` snapshot (`time`, `position`, `duration`, `buffered`, `remaining`, `percentage`) instead of `{ time }` — built from the backend's fresh position via core's `_timeStateAt`, so progress bars and clocks paint straight from the payload. Existing `({ time }) => …` listeners are unaffected. This closes the asymmetry with the music player, which already shipped a five-field payload. Requires `@nomercy-entertainment/nomercy-player-core@^2.0.0-rc.28`.

## [2.0.0-rc.25] — 2026-07-04

### Added

- Translation bundles for three more plugins: `key-handler` (`plugin.video-key-handler.speed`, the playback-rate OSD), `media-session` (`plugin.media-session.season`, the OS media-controls album line, localized per locale — Staffel/シーズン/Сезон/…), and `touch-zones` (the ±seek indicators). Each ships the full locale set and registers via `translationsFromGlob`, same as the existing bundles.
- `plugin.desktop-ui.token.extras` — the season-0 title prefix ("Extras E3") is now a translated token in every desktop-ui locale file AND in the static `token-bundle.ts` seed, so it resolves like the season/episode prefixes even before the plugin's lazy bundle loads. Non-Latin locales get real translations (特典, 스페셜, إضافات, …); languages whose media UIs use "Extras" keep it.
- `backend(kind)` setter overload on `NMVideoPlayer`/`IVideoPlayer`, mirroring the music player's backend surface: disposes the current backend, creates the new one, emits `backend:changed`. Only `'html5'` has a built-in implementation; other kinds route through `backendFactory` or reject with `core:not-implemented/video-backend`.
- `subtitle-size-up` / `subtitle-size-down` are now declared members of `VideoEventMap` (the shared UI-intent pattern used by `display-message`/`back`/`close`), so key-handler subtitle size changes type-check instead of riding the untyped string escape hatch.
- `DesktopUiPlugin` claims sole ownership of the `activity` event via player-core rc.26's `activityTracking(false)` (its own state machine handles menu-open/hover pinning and scrub state), and hands the player's built-in tracker back at teardown. `NMVideoPlayer` declares the new `bumpActivity()` / `activityTracking()` surface, and `IVideoPlayer` gains T-typed `peekNext()` / `peekPrevious()` alongside the existing `item()`/`queue()` declarations. Requires `@nomercy-entertainment/nomercy-player-core@^2.0.0-rc.26`.

### Fixed

- `KeyHandlerPlugin`'s help-overlay key now calls `DesktopUiPlugin.toggleShortcuts()` directly via `player.getPlugin()` instead of hand-forging an event in the desktop-ui plugin's namespace; `TvKeyHandlerPlugin` emits its own events through the plugin's auto-namespacing `emit` instead of hand-built `plugin:tv-key-handler:*` strings. Wire-level event names are unchanged.
- The IIFE CDN bundle build works in the monorepo again: the Vite aliases that map core imports onto its live TypeScript source are now derived from core's exports map, so directory-index subpaths (`plugins/key-handler`) and remapped ones (`streams/*`) resolve exactly like the published package.
- Published tarballs now actually contain `nomercy-video-player.iife.js`: `prepublishOnly` runs `build:all`. Previously the ESM-only rebuild inside `npm publish` wiped `dist/` after CI had built the bundle, so every rc shipped without its CDN artifact.

## [2.0.0-rc.24] — 2026-07-04

### Fixed

- Inherits `nomercy-player-core` 2.0.0-rc.24's consumer volume taper (`position²`) — the −60 dB fader law made everything below ~70% slider barely audible. No video-player source change; the curve lives in the shared `MediaElementBackend`.

## [2.0.0-rc.23] — 2026-07-03

### Changed

- Dropped the duplicate `controls?: boolean` field from `VideoPlayerConfig`; it now inherits from `@nomercy-entertainment/nomercy-player-core`'s `BasePlayerConfig` (shared with the music player — same native `<video controls>` / `<audio controls>` semantics, no domain twist). No consumer-visible behavior change: the field still exists with the same type and default, and `backend()`'s `if (this.options?.controls)` handling is untouched. Requires `@nomercy-entertainment/nomercy-player-core@^2.0.0-rc.22` or newer.

## [2.0.0-rc.22] — 2026-07-02

### Breaking

- Realigned with `nomercy-player-core` rc.21's M1 Connect-plugin slice: `volume()`, `mute()`, `unmute()`, `subtitle()`, `audioTrack()`, `playbackRate()`, `repeatState()`, `shuffleState()`, and `dispose()` now return `Promise<void>` on `NMVideoPlayer` and `IVideoPlayer`, matching `IPlayer`. The published rc.21 of this package still declared the old `void` signatures, which no longer structurally satisfied `IPlayer` and broke typecheck for every `Plugin<NMVideoPlayer, ...>` consumer once core rc.21 was installed alongside it — rc.22 is the fix. Code that read state synchronously right after calling one of these must now `await` the call first; fire-and-forget callers are unaffected. Requires `@nomercy-entertainment/nomercy-player-core@^2.0.0-rc.21` or newer.

### Added

- `V1VideoCompatPlugin` (`import { V1VideoCompatPlugin } from '@nomercy-entertainment/nomercy-video-player'`) — opt-in shim attaching the full v1 method surface onto `NMVideoPlayer` via declaration merging. Every shim delegates to the real v2 API and logs one `@deprecated` warning per call. Add via `player.addPlugin(V1VideoCompatPlugin)` before `setup()`; delete the plugin once migrated.

### Fixed

- The wrapped `dispose()` override now awaits the composed cancellable dispose and only tears down the video backend + registry entry once `phase()` actually reaches `'disposed'`, instead of killing the backend (and any live HLS instance) before `beforeDispose` had a chance to run. A plugin calling `preventDefault()` on `beforeDispose` no longer loses its backend.
- Standalone CI (outside the monorepo checkout) now lints cleanly — the ESLint config imports the player rule pack from `@nomercy-entertainment/nomercy-player-core/eslint-plugin` instead of a monorepo-relative path that doesn't exist in a standalone clone.

## [2.0.0-rc.21] — 2026-07-02

### Changed

- Backend now routes through the shared core helpers (`createAuthorizationXhrSetup`, `destroyHlsInstance`, `bridgeBackendPlayState`); the player's existing play-state behavior (pause-unless-ended, reset on loadstart and emptied) is preserved via options. Internal only; no public surface change.

## [2.0.0-rc.15] — 2026-06-29

### Added

- Real-browser Playwright e2e suite (`e2e/`) covering play/pause icon swap, `.is-active` state for speed and aspect-ratio buttons, `.muted` on the volume button, and PiP icon wiring. Fixtures are generated by the NoMercy ffmpeg fork via `npm run test:e2e` (the `pretest:e2e` step builds them automatically).

### Changed

- State-button consistency: pip, subtitle, quality, and audio buttons now show the `.is-active` indicator when their state is non-default or engaged, consistent with the existing speed and aspect-ratio buttons. Previously the audio button never applied `.is-active`; that is fixed.

### Fixed

- `V1VideoCompatPlugin` now tracks duration per player instance, so multiple players on the same page no longer corrupt each other's v1 `TimeData` payloads.
- `V1VideoCompatPlugin` correctly bridges the v1 `'playlist'` event to the v2 `'queue'` event.

## [2.0.0-rc.14] — 2026-06-29

### Fixed

- `V1VideoCompatPlugin` `load()` and `addTranslations()` shims were silently skipped on construction and never installed. Both shims now register correctly.
- `V1VideoCompatPlugin` bridges the v1 `'playlist'` event to the v2 `'queue'` event so v1 consumers receive queue updates without modification.
- Real-browser e2e harness repaired and extended: fixture generation, test runner wiring, and coverage of additional player interactions.

---

## [2.0.0-rc.13] — 2026-06-28

### Changed

- Version aligned with the player trio. No code changes.

---

## [2.0.0-rc.12] — 2026-06-28

### Fixed

- Mobile tap now toggles the controls UI correctly. The pre-tap visibility is snapshotted on `pointerdown` so a tap from the hidden state shows and holds the controls instead of producing a flash-and-hide.

---

## [2.0.0-rc.11] — 2026-06-28

### Fixed

- The control auto-hide timer re-arms only on user-initiated seeks. Programmatic or relayed seeks no longer trigger the timer, eliminating overlay flicker on non-interactive seeks.

---

## [2.0.0-rc.10] — 2026-06-28

### Fixed

- Fixed the control auto-hide desync where the activity flag and the `.active` class diverged and left controls permanently hidden. `setActivity` now reconciles against the live DOM state before applying a class change.

---

## [2.0.0-rc.9] — 2026-06-28

### Changed

- `hls.js` is no longer a direct dependency of this package. The core package owns the `hls.js` dependency; video pulls it transitively. A `devDependency` entry is retained for types and test fixtures only.

---

## [2.0.0-rc.8] — 2026-06-28

### Fixed

- The published ESM build now emits `.js` extensions on all relative imports via `tsc-alias`. Raw Node ESM consumers (`node --input-type=module`, `require()` shimmed environments) no longer hit bare-specifier resolution failures.

---

## [2.0.0-rc.7] — 2026-06-28

### Changed

- Pinned `@nomercy-entertainment/nomercy-player-core` to `rc.6`.
- Lint runs with `--max-warnings 0`; all warnings in the package are resolved.

### Fixed

- Touch-zones center zone: a single tap always toggles playback regardless of controls visibility, consistent with the documented tap-zone spec.

---

## [2.0.0-rc.6] — 2026-06-14

### Fixed

- The v1-compat plugin now bridges 9 v1 public accessors (getPlaylist, getPlaylistIndex, getSeasons, getGain/setGain,
  getSubtitleFile, getChapterText, getCaptionIndexBy, getAudioTrackIndexByLanguage) that an upgrading v1 consumer
  could call. The plugin once again covers the full v1 public surface, so old
  code keeps working with only the compat plugin added.

## [2.0.0-rc.5] — 2026-06-14

### Changed

- The desktop-ui, tv-key-handler, and cast-sender plugins use a typesafe
  translation key schema: each `en.ts` exports its canonical key type, and every
  language file is full-coverage `satisfies Record<…TranslationKey, string>`
  instead of the loose `Record<string, string>`. All supported languages ship,
  scoped to each plugin's own `i18n` folder.

### Fixed

- The README and the package `homepage` point at the live docs route
  (`docs.nomercy.tv/nomercy-video-player/`) instead of the dead `/player/` path.

## [2.0.0-rc.4] — 2026-06-14

### Fixed

- The standalone build resolves the player core from `node_modules` instead of
  a sibling monorepo checkout, so `build:all` (including the IIFE bundle) runs
  in a clean CI checkout. The vite and vitest configs guard the source aliases
  behind `existsSync` and follow the core's repository rename. The stale
  tsconfig `paths` that pointed at sibling kit/octopus dist were removed.
- Every source file carries the `Apache-2.0` license header.

## [2.0.0-rc.2] — 2026-06-14

### Changed

- The base event map is generic over the item type and emits the universal
  queue-item selection event.
- v1 `getCurrentSrc` and remaining `url` reads no longer cast now that `url` is a
  base field.

### Fixed

- Desktop-ui activity handling is de-duplicated.

### Removed

- Stale `./plugins/embed`, `./plugins/message`, and `./plugins/tab-leader`
  subpath exports that pointed at unbuilt files. These kit plugins remain
  available through the `./plugins` aggregate or directly from the core package.

## [2.0.0-beta.1] — 2026-05-30

### Changed

- Dependency on `@nomercy-entertainment/nomercy-player-core` changed from `file:` local
  path to `^2.0.0-beta.0` semver range — resolves correctly from the npm registry.
- `exports` map corrected: all directory-based plugins (`drm`, `embed`, `key-handler`,
  `live-transcoding`, `media-session`, `message`, `octopus`, `skipper`, `tab-leader`,
  `touch-zones`) now point to `./dist/plugins/<name>/index.js` matching tsc output layout.
- Build pipeline clarified as tsc-only; `vite.config.ts` and `vite.config.iife.ts` marked
  as non-publish reference files.
- `contributors` email updated to GitHub noreply address.

---

## [2.0.0-beta.0] — 2026-05-16

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
