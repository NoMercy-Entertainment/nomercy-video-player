# Releasing @nomercy-entertainment/nomercy-video-player

## RC publish (current)

Published under the `rc` dist-tag via `publishConfig.tag: "rc"`. Install the rc:

```
npm install @nomercy-entertainment/nomercy-video-player@rc
```

Watch out: a plain `npm install` without the tag does not fail. It resolves the old
v1 line, which is what `latest` points at until `2.0.0` is published to it. Always
install with an explicit tag or version during the rc phase.

## Build

The package ships two artifacts from one `dist/`: the ESM build from `tsc` and the
IIFE CDN bundle from Vite (`vite.iife.config.ts`). `yarn build` wipes `dist/` before
it compiles, so the bundle must always be produced after it, never before.

```
yarn build       # tsc ESM dist + translation and asset passes
yarn build:iife  # Vite IIFE bundle into the same dist/
yarn build:all   # both, in the right order
```

The `prepublishOnly` hook runs `build:all`, so a publish from any environment packs
the complete artifact set. `dist/` is gitignored.

## Stable 2.0.0 flip

The full trio choreography (publish order, lockfile refresh, docs flip, outside-in
verification) lives in the core repo's RELEASING.md. Steps specific to this package:

1. Bump the version to `2.0.0` in `package.json`.
2. Remove `"tag": "rc"` from `publishConfig`.
3. Update the `@nomercy-entertainment/nomercy-player-core` range (currently
   `^2.0.0-rc.24`) to `^2.0.0`. The rc range already matches stable, so this is
   convention, not mechanics.
4. Add a `[2.0.0]` entry to `CHANGELOG.md` summarizing changes since the last rc.
5. After core `2.0.0` is on the registry, run
   `yarn up @nomercy-entertainment/nomercy-player-core` before publishing so the
   build scripts and lockfile come from the stable core.
