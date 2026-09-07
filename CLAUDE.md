# NoMercy Video Player

Headless, event-driven video player engine. No UI - consumers build their own.

## Tech Stack

- TypeScript (ES2022), `tsc` for ESM dist, Vite IIFE build for CDN bundle (`nomercy-video-player.iife.js`)
- Testing: Vitest (unit) + Playwright (e2e)
- Linting: @antfu/eslint-config (ESLint 9 flat config) + `@nomercy-entertainment/eslint-plugin-player`
- Formatting: Prettier - tabs, 4-width, single quotes, semicolons, printWidth 150

## Structure

```
src/
  player/       # Core modules (base, playback, volume, subtitles, etc.)
  plugins/      # Plugin system (octopusPlugin, keyHandlerPlugin, etc.)
  types/        # Type definitions per feature
  __tests__/    # Test files (also co-located *.test.ts)
  index.ts      # Public API entry point
```

## Conventions

- Files: camelCase (`playerStorage.ts`)
- Classes/Types: PascalCase
- Functions/Variables: camelCase
- Tests go in `__tests__/` or co-located as `*.test.ts`
- npm scope: `@nomercy-entertainment/nomercy-video-player`
- Module type: ESM (`"type": "module"`)

## Rules

Shared player-trio architecture — `BasePlayerConfig` field-sharing, the
subtitle-method placement rule, the plugin event bus, the auto-advance
asymmetry, and the lint tooling — is documented once in `../PLAYER-TRIO.md`.
Read it; it is not repeated here. What follows is what's specific to video.

- This is a headless library. Never add UI elements or DOM manipulation beyond the video element.
- `addSubtitleTrack()` / `removeSubtitleTrack()` (runtime sidecar subtitle injection, e.g. for a search-and-download-subtitles feature) are implemented once in core's `media-tracks.ts` mixin alongside `subtitle()`. They emit the core `'subtitles'` event on change; `DesktopUiPlugin` listens for it (`domMethods.ts`) to refresh button visibility and repaint an open subtitles pane live, no reload.
- `DesktopUiOptions.subtitleMenuActions` (consumer action rows appended to the native subtitles sub-menu, e.g. a "Search subtitles online…" entry that opens the consumer's own dialog) is a `desktop-ui` plugin concern, not a player primitive — the player has no opinion on what the action does, it only renders the row and forwards the click via `onSelect(player)`. Rows use plain button/menuitem semantics (`.language-button.menu-action-row`, no `role="switch"`/`aria-checked`) — never reuse `settingsItems`' toggle-row shape for an action that isn't a boolean state. `refreshCapabilityVisibility()` (`transportStateMethods.ts`) treats a non-empty `subtitleMenuActions` the same as "has tracks" for the subtitles button/category gating, so the row stays reachable at zero tracks — that's the whole point of the extension point. A live `.options({ subtitleMenuActions: [...] })` call re-triggers that gate via the plugin's own `opts:changed` handler (`domMethods.ts`).
- **Casting/device-switch orchestration is a consumer concern, never a player concern — but the AFFORDANCE (a top-bar button) is now the player's, per owner ruling 2026-07-14, superseding the 2026-07-xx "no dedicated cast button" stance.** The player still has zero opinion on how a device gets picked or how playback gets handed off — CastSenderPlugin's Cast Web-Sender `loadMedia()` remains the wrong mechanism; NoMercy casting is server-orchestrated (`VideoHub.ChangeDeviceCommand` + `WakeForVideo`, mirroring `MusicHub`), and that orchestration stays entirely in app-web (Sidebar/DeviceOverlay), same as music. What changed: video's presentation is a fullscreen modal overlay with no persistent app chrome to anchor a cast affordance to (unlike music's always-visible mini-player), so the boss called for the button to live IN the top bar next to back/close instead of buried in the settings menu. `DesktopUiButtonOptions.cast` (default off, opt-in) gates a top-bar button built in `helpers/topBar.ts` using `data/buttons.ts`'s `cast` Fluent icon — clicking it ONLY emits the bare `'cast'` player event (`VideoEventMap`, `types.ts`), the same pattern `back`/`close` use. It never calls `CastSenderPlugin` or `session.loadMedia()` — the consumer's own `on('cast', ...)` listener opens its own device picker. Unlike `back`/`close`, visibility is opt-in-flag-gated (`opts.buttons?.cast`), NOT listener-presence-gated (`applyStateVisibility()`, `transportStateMethods.ts`) — a consumer can ship the button before wiring the listener. PiP still hides it (same floating-chrome-wrong-surface reasoning as back/close). `DesktopUiOptions.settingsMenuActions` (same row shape as `subtitleMenuActions`, mounted on the MAIN settings menu — `helpers/menus.ts`'s `renderMainMenuActions`) is UNCHANGED and stays live — it remains the sanctioned way to add an arbitrary consumer action row to the settings menu (cast or otherwise); the new button is an additional, more discoverable surface for cast specifically, not a replacement for the extension point. `settingsMenuActions` rows still repaint live on `.options({ settingsMenuActions: [...] })` (`mainMenuActionsContainer` in `MenuFrameRefs`, repainted from `domMethods.ts`'s `opts:changed` handler) — unlike `settingsItems` toggle rows, which are still static-at-mount-only.
- All player features are exposed through events. New functionality must emit events.
- Public API is exported from `src/index.ts`. Don't export internal modules directly.
- `playSegment`/`clearSegment` (bounded time-window playback with loop/hold/advance) stay video-only: they model disc-menu state windows and chapter-range/intro-loop playback, concepts with no music analogue — music's `repeatState('one')` already covers whole-track looping.
- Run `npm run typecheck` and `npm test` before committing changes.
