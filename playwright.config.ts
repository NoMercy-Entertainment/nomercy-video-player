import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	timeout: 30_000,
	reporter: [['html', { outputFolder: 'reports/playwright' }]],
	use: {
		baseURL: 'http://localhost:5503',
		headless: true,
	},
	webServer: {
		command: 'npx vite --port 5503 --force',
		port: 5503,
		reuseExistingServer: !process.env['CI'],
	},
});
