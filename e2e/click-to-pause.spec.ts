// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * click-to-pause.spec.ts
 *
 * Proves the click-to-pause contract with a REAL mouse click on the real
 * `<video>` element, driven by Playwright's page.mouse.
 *
 * A unit test cannot stand in for this. It dispatches a synthetic MouseEvent
 * at an element it picked, which cannot tell you what a browser actually
 * delivers a click to: the overlay sits above the video, so whether the video
 * ever receives the event at all is decided by real hit-testing and stacking,
 * neither of which jsdom performs.
 *
 * Contract under test:
 *   1. A click on the video toggles playback.
 *   2. `setup({ disableClickToPause: true })` suppresses that, with no plugin
 *      option set — the config field reaches DesktopUiPlugin on its own.
 */

import { expect, test } from '@playwright/test';

type Page = import('@playwright/test').Page;

async function loadFixture(page: Page, config: Record<string, unknown>): Promise<void> {
	await page.goto('/e2e/fixture-full.html');
	await page.waitForFunction(
		() => (window as any).__playerReady === true,
		{ timeout: 10_000 },
	);

	const error = await page.evaluate(() => (window as any).__playerError);
	if (error) {
		throw new Error(`Player init failed: ${error}`);
	}

	await page.evaluate((playerConfig) => {
		(window as any).player.setup({
			playlist: [{ id: 'click-src', file: '/e2e/media/sample.mp4' }],
			muted: true,
			autoPlay: true,
			...playerConfig,
		});
	}, config);

	await page.waitForSelector('.overlay', { timeout: 5_000 });

	await page.waitForFunction(
		() => {
			const el = (window as any).player.videoElement;
			return el && Number.isFinite(el.duration) && el.duration > 0;
		},
		{ timeout: 20_000 },
	);

	// Playback must actually be running, or "did not pause" proves nothing.
	await page.waitForFunction(
		() => (window as any).player.videoElement?.paused === false,
		{ timeout: 20_000 },
	);
}

function isPaused(page: Page): Promise<boolean> {
	return page.evaluate(() => (window as any).player.videoElement.paused === true);
}

async function clickTheVideo(page: Page): Promise<void> {
	const box = await page.locator('#player video').boundingBox();
	expect(box).not.toBeNull();

	await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

test.describe('Click to pause — real browser clicks', () => {
	test('a click on the video pauses playback by default', async ({ page }) => {
		await loadFixture(page, {});

		expect(await isPaused(page)).toBe(false);

		await clickTheVideo(page);

		await expect.poll(() => isPaused(page), { timeout: 5_000 }).toBe(true);
	});

	test('setup({ disableClickToPause: true }) leaves playback alone', async ({ page }) => {
		await loadFixture(page, { disableClickToPause: true });

		expect(await isPaused(page)).toBe(false);

		await clickTheVideo(page);

		// Give a toggle time to land before concluding it never happened.
		await page.waitForTimeout(1_000);

		expect(await isPaused(page)).toBe(false);
	});
});
