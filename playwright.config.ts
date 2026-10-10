// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	timeout: 30_000,
	// Self-hosted CI runners are shared; fewer workers and one retry there only.
	workers: process.env.CI ? 2 : undefined,
	retries: process.env.CI ? 1 : 0,
	reporter: [['html', { outputFolder: 'reports/playwright' }]],
	use: {
		baseURL: 'http://localhost:5503',
		headless: true,
	},
	webServer: {
		command: 'node node_modules/vite/bin/vite.js --port 5503 --force',
		port: 5503,
		reuseExistingServer: !process.env.CI,
	},
});
