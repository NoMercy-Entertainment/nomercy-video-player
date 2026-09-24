import antfu from '@antfu/eslint-config';
import player from '@nomercy-entertainment/eslint-plugin-player';

export default antfu({
	ignores: [
		'wiki/**',
		'public/js/**',
		'README.md',
		// Linting `eslint.config.js` itself triggers a full config-cache rebuild
		// on save (~70s on Windows with antfu's plugin set). Run `npx eslint
		// eslint.config.js` manually when editing this file.
		'eslint.config.js',
	],
	typescript: {
		overrides: {
			'no-nested-ternary': 'error',
			'no-async-promise-executor': 'off',
			'no-extend-native': 'off',
			'ts/method-signature-style': 'off',
			'unused-imports/no-unused-vars': 'warn',
		},
	},
	js: {
	},
	test: {
		overrides: {
			'test/prefer-lowercase-title': 'off',
			// vi.fn(function(this: unknown) {}) needs function for `this` context
			'prefer-arrow-callback': 'off',
			// Test mock constructors legitimately capture `this` for fixture access
			'ts/no-this-alias': 'off',
		},
	},
	stylistic: {
		indent: 'tab',
		quotes: 'single',
		semi: true,
	},
	formatters: {
		css: true,
		html: true,
		markdown: true,
		svg: false,
	},
}, {
	// Project uses `{ void expr; }` arrow bodies and one-liner stubs throughout
	rules: {
		'style/max-statements-per-line': 'off',
		'node/prefer-global/process': 'off',
	},
}, {
	// NoMercy player code standard (packages/player-web/eslint-plugin-player).
	files: ['src/**/*.ts'],
	plugins: { player },
	rules: {
		'player/no-single-letter-ident': 'error',
		'player/no-compat-vocab': 'error',
		'player/no-history-comments': 'error',
		'player/no-object-literal-cast': 'error',
		'player/no-unknown-cast': 'error',
		'player/no-raw-player-bus': 'error',
		'player/no-raw-timers-in-plugin': 'error',
		'player/no-raw-throw-in-plugin': 'error',
		'player/no-raw-fetch-in-plugin': 'error',
		'player/plugin-id-required': 'error',
	},
}, {
	// Mock construction in tests legitimately casts; test-fixture plugins throw
	// raw errors, use raw timers, and build ad-hoc plugin classes to exercise
	// the real paths — the boundary rules target authored plugins, not fixtures.
	files: ['src/**/*.test.ts', 'src/__tests__/**/*.ts'],
	rules: {
		'player/no-object-literal-cast': 'off',
		'player/no-unknown-cast': 'off',
		'player/no-raw-throw-in-plugin': 'off',
		'player/no-raw-timers-in-plugin': 'off',
		'player/no-raw-player-bus': 'off',
		'player/no-raw-fetch-in-plugin': 'off',
		'player/plugin-id-required': 'off',
	},
}, {
	// The v1 compat shim's entire purpose is deprecation — its declare-module
	// overloads carry real `@deprecated` JSDoc so editors surface the warning
	// at v1 consumers' call sites. The blanket ban exists to keep that marker
	// out of the clean v2 core; this is the one file it describes on purpose.
	files: ['src/plugins/v1-compat.ts'],
	rules: {
		'player/no-compat-vocab': 'off',
	},
});
