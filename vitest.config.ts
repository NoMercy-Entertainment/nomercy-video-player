// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { existsSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { nomercyTranslationsPlugin } from '@nomercy-entertainment/nomercy-player-core/vite-plugin';
import { defineConfig } from 'vitest/config';

const coreRoot = fileURLToPath(new URL('../nomercy-player-core/src', import.meta.url));
const selfRoot = fileURLToPath(new URL('./src', import.meta.url));
const octopusSrc = fileURLToPath(new URL('../../subtitles/nomercy-subtitle-octopus/src', import.meta.url));
const hlsMock = fileURLToPath(new URL('./src/__tests__/__mocks__/hls.js.ts', import.meta.url));
// Monorepo: alias siblings to their live TypeScript source so tests pick up
// unbuilt changes. Standalone / CI: resolve them from node_modules instead.
//
// NOMERCY_INSTALLED_DEPS=1 forces the standalone path inside the monorepo,
// which is the only way to run what CI runs. Without it a test that asserts
// behaviour from an UNRELEASED core passes here and fails there, and the diff
// that caused it is invisible — the sibling checkout answers every import.
const useInstalledDeps = process.env.NOMERCY_INSTALLED_DEPS === '1';
const useCoreSource = !useInstalledDeps && existsSync(coreRoot);
const useOctopusSource = !useInstalledDeps && existsSync(octopusSrc);

export default defineConfig({
	plugins: [nomercyTranslationsPlugin()],
	resolve: {
		alias: [
			// Self-referential alias so plugins inside this package that import
			// from `@nomercy-entertainment/nomercy-video-player` resolve to src
			// rather than a built dist (which may not exist in a clean checkout).
			{ find: '@nomercy-entertainment/nomercy-video-player', replacement: `${selfRoot}/index.ts` },
			// hls.js is owned by nomercy-player-core (resolved transitively).
			// Tests that need real HLS behaviour mock it inline with vi.mock('hls.js', ...)
			// which takes precedence. All other tests get this stub so the dynamic
			// import('hls.js') in backend code returns a predictable minimal shape.
			{ find: 'hls.js', replacement: hlsMock },
			...(useOctopusSource
				? [{ find: '@nomercy-entertainment/nomercy-subtitle-octopus', replacement: `${octopusSrc}/index.ts` }]
				: []),
			...(useCoreSource
				? [
						{ find: '@nomercy-entertainment/nomercy-player-core/testing', replacement: `${coreRoot}/testing/index.ts` },
						{ find: '@nomercy-entertainment/nomercy-player-core/vite-plugin', replacement: `${coreRoot}/vite-plugin.ts` },
						// Directory-based plugins whose entry is index.ts, not a bare file.
						{ find: '@nomercy-entertainment/nomercy-player-core/plugins/key-handler', replacement: `${coreRoot}/plugins/key-handler/index.ts` },
						{ find: '@nomercy-entertainment/nomercy-player-core/plugins/media-session', replacement: `${coreRoot}/plugins/media-session/index.ts` },
						{ find: '@nomercy-entertainment/nomercy-player-core/plugins/tab-leader', replacement: `${coreRoot}/plugins/tab-leader/index.ts` },
						{ find: '@nomercy-entertainment/nomercy-player-core/plugins/embed', replacement: `${coreRoot}/plugins/embed/index.ts` },
						{ find: '@nomercy-entertainment/nomercy-player-core/plugins/message', replacement: `${coreRoot}/plugins/message/index.ts` },
						{ find: '@nomercy-entertainment/nomercy-player-core/plugins/audio-graph', replacement: `${coreRoot}/plugins/audio-graph/index.ts` },
						{ find: '@nomercy-entertainment/nomercy-player-core/plugins/canvas', replacement: `${coreRoot}/plugins/canvas/index.ts` },
						{ find: '@nomercy-entertainment/nomercy-player-core/plugins/mixer', replacement: `${coreRoot}/plugins/mixer/index.ts` },
						{ find: '@nomercy-entertainment/nomercy-player-core/plugins/equalizer', replacement: `${coreRoot}/plugins/equalizer/index.ts` },
						{ find: '@nomercy-entertainment/nomercy-player-core/plugins/spectrum', replacement: `${coreRoot}/plugins/spectrum/index.ts` },
						{ find: '@nomercy-entertainment/nomercy-player-core/plugins/visualization', replacement: `${coreRoot}/plugins/visualization/index.ts` },
						// Core's package.json maps ./streams/* to dist/adapters/stream/* —
						// the source tree has no streams/ directory, so the catch-all
						// regex below would point these at a nonexistent file.
						{ find: '@nomercy-entertainment/nomercy-player-core/streams/hls', replacement: `${coreRoot}/adapters/stream/hls.ts` },
						{ find: '@nomercy-entertainment/nomercy-player-core/streams/native', replacement: `${coreRoot}/adapters/stream/native.ts` },
						{
							// Remaining subpath imports that resolve to bare .ts files (cues/*).
							find: /^@nomercy-entertainment\/nomercy-player-core\/(.*)$/,
							replacement: `${coreRoot}/$1.ts`,
						},
						{ find: '@nomercy-entertainment/nomercy-player-core', replacement: `${coreRoot}/index.ts` },
					]
				: []),
		],
	},
	test: {
		globals: true,
		// Self-hosted CI runners are slower and shared; give tests more headroom there only.
		testTimeout: process.env.CI ? 20_000 : 5_000,
		environment: 'happy-dom',
		include: ['src/**/__tests__/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'lcov'],
			include: ['src/**/*.ts'],
			exclude: [
				'src/**/__tests__/**',
				'src/**/*.d.ts',
			],
			thresholds: {
				lines: 70,
				functions: 75,
			},
		},
	},
});
