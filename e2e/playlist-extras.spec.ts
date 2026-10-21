// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * The playlist's season rail lists specials (season 0) after the last season,
 * labeled with the Extras token, in a real browser.
 */

import { expect, test } from '@playwright/test';

test('season rail lists Extras after the last season', async ({ page }) => {
	await page.goto('/e2e/fixture-full.html');
	await page.waitForFunction(() => (window as any).__playerReady === true, { timeout: 10_000 });
	expect(await page.evaluate(() => (window as any).__playerError)).toBeNull();

	await page.evaluate(() => {
		(window as any).player.setup({
			playlist: [
				{ id: 's1e1', title: 'S1E1', file: '/e2e/media/sample.mp4', season: 1, episode: 1 },
				{ id: 's2e1', title: 'S2E1', file: '/e2e/media/sample.mp4', season: 2, episode: 1 },
				{ id: 's0e1', title: 'Special', file: '/e2e/media/sample.mp4', season: 0, episode: 1 },
			],
			muted: true,
			autoPlay: false,
		});
	});
	await page.waitForSelector('.overlay', { timeout: 5_000 });

	await page.locator('[id="settings"]').click();
	await page.locator('[id="menu-button-playlist"]').click();
	const rail = page.locator('[id^="season-button-"]');
	await expect(rail).toHaveCount(3);

	expect(await rail.evaluateAll(buttons => buttons.map(button => button.id)))
		.toEqual(['season-button-1', 'season-button-2', 'season-button-0']);
	await expect(page.locator('[id="season-button-0"]')).toHaveText('Extras');
	await expect(page.locator('[id="season-button-0"]')).toBeVisible();
});
