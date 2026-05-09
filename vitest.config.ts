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
			{
				// Subpath plugin imports — `.../plugins/key-handler` etc.
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
