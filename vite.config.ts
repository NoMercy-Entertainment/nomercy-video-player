/// <reference types="vitest" />
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { nomercyTranslationsPlugin } from '@nomercy-entertainment/nomercy-player-core/vite-plugin';

export default defineConfig({
	base: '/',
	publicDir: resolve(__dirname, 'public'),
	plugins: [dts(), nomercyTranslationsPlugin()],
	build: {
		sourcemap: false,
		minify: 'terser',
		target: 'es2022',
		rollupOptions: {
			input: ['./src/index.ts'],
			external: ['hls.js'],
			output: {
				globals: {
					'hls.js': 'Hls',
				},
			},
		},
		lib: {
			entry: resolve(__dirname, 'src/index.ts'),
			name: 'nmplayer',
			formats: ['es', 'cjs', 'umd'],
			fileName: 'nomercy-video-player',
		},
	},
	test: {
		globals: true,
		environment: 'happy-dom',
		include: ['src/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts', 'src/types/**', 'src/fonts/**'],
		},
	},
	clearScreen: true,
});
