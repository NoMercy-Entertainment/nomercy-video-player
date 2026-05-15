import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { nomercyTranslationsPlugin } from '../nomercy-player-kit/src/vite-plugin';

const kitRoot = fileURLToPath(new URL('../nomercy-player-kit/src', import.meta.url));

export default defineConfig({
	plugins: [nomercyTranslationsPlugin()],
	resolve: {
		alias: [
			{ find: '@nomercy-entertainment/nomercy-player-core/testing', replacement: `${kitRoot}/testing/index.ts` },
			{ find: '@nomercy-entertainment/nomercy-player-core/vite-plugin', replacement: `${kitRoot}/vite-plugin.ts` },
			// Directory-based plugins whose entry is index.ts, not a bare file.
			{ find: '@nomercy-entertainment/nomercy-player-core/plugins/key-handler', replacement: `${kitRoot}/plugins/key-handler/index.ts` },
			{ find: '@nomercy-entertainment/nomercy-player-core/plugins/media-session', replacement: `${kitRoot}/plugins/media-session/index.ts` },
			{ find: '@nomercy-entertainment/nomercy-player-core/plugins/tab-leader', replacement: `${kitRoot}/plugins/tab-leader/index.ts` },
			{ find: '@nomercy-entertainment/nomercy-player-core/plugins/embed', replacement: `${kitRoot}/plugins/embed/index.ts` },
			{ find: '@nomercy-entertainment/nomercy-player-core/plugins/message', replacement: `${kitRoot}/plugins/message/index.ts` },
			{ find: '@nomercy-entertainment/nomercy-player-core/plugins/audio-graph', replacement: `${kitRoot}/plugins/audio-graph/index.ts` },
			{ find: '@nomercy-entertainment/nomercy-player-core/plugins/canvas', replacement: `${kitRoot}/plugins/canvas/index.ts` },
			{ find: '@nomercy-entertainment/nomercy-player-core/plugins/mixer', replacement: `${kitRoot}/plugins/mixer/index.ts` },
			{ find: '@nomercy-entertainment/nomercy-player-core/plugins/equalizer', replacement: `${kitRoot}/plugins/equalizer/index.ts` },
			{ find: '@nomercy-entertainment/nomercy-player-core/plugins/spectrum', replacement: `${kitRoot}/plugins/spectrum/index.ts` },
			{ find: '@nomercy-entertainment/nomercy-player-core/plugins/visualization', replacement: `${kitRoot}/plugins/visualization/index.ts` },
			{
				// Remaining subpath imports that resolve to bare .ts files (streams/*, cues/*).
				find: /^@nomercy-entertainment\/nomercy-player-core\/(.*)$/,
				replacement: `${kitRoot}/$1.ts`,
			},
			{ find: '@nomercy-entertainment/nomercy-player-core', replacement: `${kitRoot}/index.ts` },
		],
	},
	test: {
		globals: true,
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
		},
	},
});
