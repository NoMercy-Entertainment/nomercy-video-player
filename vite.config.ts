// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * NOT the publish build. The publish pipeline runs `tsc -p tsconfig.build.json` (see
 * package.json "build" script and prepublishOnly). This file was the old Vite bundler
 * config; it is retained for reference only and must not be run against a publish.
 */
/// <reference types="vitest" />
import { resolve } from 'node:path';
import { nomercyTranslationsPlugin } from '@nomercy-entertainment/nomercy-player-core/vite-plugin';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
	base: '/',
	publicDir: resolve(__dirname, 'public'),
	plugins: [
		dts(),
		nomercyTranslationsPlugin(),
		{
			// Vite attempts to transform any file with a .ts extension as TypeScript,
			// including MPEG-TS media segments in e2e/media/. This plugin intercepts
			// those requests and serves the raw binary instead.
			name: 'serve-ts-media-segments',
			configureServer(server) {
				server.middlewares.use((req, res, next) => {
					const url = req.url ?? '';
					if (url.startsWith('/e2e/media/') && url.endsWith('.ts')) {
						res.setHeader('Content-Type', 'video/mp2t');
						res.setHeader('Cache-Control', 'no-cache');
						const filePath = resolve(__dirname, url.slice(1).replace(/\?.*$/, ''));
						import('node:fs').then(({ createReadStream, existsSync }) => {
							if (!existsSync(filePath)) {
								res.statusCode = 404;
								res.end('not found');
								return;
							}
							const stream = createReadStream(filePath);
							stream.pipe(res);
						}).catch(() => next());
						return;
					}
					next();
				});
			},
		},
	],
	optimizeDeps: {
		// Scan the e2e fixtures too, or the dev server reloads every page mid-run.
		entries: ['src/index.ts', 'e2e/*.html'],
	},
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
