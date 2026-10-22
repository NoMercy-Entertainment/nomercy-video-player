# Contributing

Thanks for your interest in `@nomercy-entertainment/nomercy-video-player`. This package is the v2 video player package built on the NoMercy player kit.

## Reporting issues

- Bug? File a [GitHub issue](https://github.com/NoMercy-Entertainment/nomercy-video-player/issues) with a minimal reproduction. Include kit version, browser, and a stack trace if you have one.
- Security? Do not file a public issue — see [SECURITY.md](./SECURITY.md).
- Question? The full docs live at [docs.nomercy.tv/player/](https://docs.nomercy.tv/player/).

## Local development

```bash
git clone https://github.com/NoMercy-Entertainment/nomercy-video-player.git
cd nomercy-video-player
corepack enable   # once; picks yarn 4 from package.json
yarn install
yarn test         # vitest run (unit tests must pass)
yarn typecheck    # tsc --noEmit
yarn build        # writes dist/
```

The package also has a real-browser e2e suite built with Playwright:

```bash
yarn test:e2e     # runs pretest:e2e (generates fixtures via the NoMercy ffmpeg fork) then playwright test
```

The `pretest:e2e` step downloads and runs the NoMercy ffmpeg fork to produce short test media files. The generated fixtures go into `e2e/media/` and are not committed. Running `test:e2e` for the first time may take a few minutes on a slow connection.

## Pull requests

- Branch off `master`. Feature branches: `feat/<short-description>`. Fixes: `fix/<short-description>`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `ci`). Imperative, lowercase subject, no trailing period.
- Tests required for new features. Bug fixes should include a regression test.
- Run `yarn lint:fix` before pushing. CI rejects lint failures.
- No `Co-Authored-By` trailers unless we paired live.

## Plugin contributions

Built-in plugins live in `src/plugins/`. New plugins are welcome — but most plugins belong in consumer packages, not the kit itself. The kit ships only plugins that are universal (event-bus, logger, retry-policy, etc.). Domain-specific plugins (Spotify scrobbler, custom DRM, etc.) belong in their own packages.

If you have a domain-specific plugin you'd like to host alongside the kit, open a discussion first.

## Releases

Releases are coordinated across the v2 trio (kit, video, music). Each pre-release publishes to npm under the `rc` dist-tag. The final `latest` release happens once consumer apps (nomercy-app-web, nomercy-cast-player) confirm a clean migration.
