# Migration

## beta.0 → beta.1 breaking change

`currentSubtitle()`, `currentAudioTrack()`, and `currentQuality()` now return
selection objects instead of bare indexes.

```ts
// Before (beta.0)
const idx: number | null = player.currentSubtitle();

// After (beta.1)
const sel = player.currentSubtitle(); // CurrentSubtitleSelection | null
sel?.index;  // number
sel?.track;  // SubtitleTrack
```

Setter forms are unchanged. Full details in the kit migration guide.

---

Full v1 → v2 migration guide lives in the docs site:

**[docs.nomercy.tv/player/video/migration-v1-v2](https://docs.nomercy.tv/player/video/migration-v1-v2)**

Quick orientation:

- The npm name is unchanged. `^1.x` consumers do not auto-upgrade; opt in with an explicit `2.x` bump.
- `item.path` → `item.url`. **Server-side payloads must be updated in the same release as any web migration**, or playback breaks silently for self-hosted users.
- Event payloads, the plugin system, and several method names changed. The full breaking-change diff and replacement examples are in the docs link above.

If you're integrating from scratch, start at the [Quick start](https://docs.nomercy.tv/player/video/quickstart) instead.
