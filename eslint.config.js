import antfu from '@antfu/eslint-config';

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
	files: ['e2e/**/*.ts'],
	rules: {
		'style/max-statements-per-line': 'off',
	},
});
