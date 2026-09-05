// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * setup-guide.spec.ts
 *
 * Runs the setup guide's own code and checks it produces a player a person can
 * see and use. A guide that type-checks and still renders nothing is the
 * failure this catches, so the assertions are about pixels and playback rather
 * than about objects existing.
 */

import { expect, test } from '@playwright/test';

test.describe('The setup guide produces a working player', () => {
	test('no error, and the player reports ready', async ({ page }) => {
		const consoleErrors: string[] = [];
		page.on('pageerror', error => consoleErrors.push(error.message));

		await page.goto('/e2e/guide-fixture.html');

		await page.waitForFunction(
			() => (window as any).__guideReady === true || (window as any).__guideError !== null,
			{ timeout: 20_000 },
		);

		const guideError = await page.evaluate(() => (window as any).__guideError);
		expect(guideError, 'the guide code threw').toBeNull();
		expect(consoleErrors, 'uncaught page errors').toEqual([]);
	});

	test('a video element is on screen with real size', async ({ page }) => {
		await page.goto('/e2e/guide-fixture.html');
		await page.waitForFunction(() => (window as any).__guideReady === true, { timeout: 20_000 });

		const video = page.locator('#player video');
		await expect(video).toBeVisible();

		const box = await video.boundingBox();
		expect(box, 'video has a layout box').not.toBeNull();
		expect(box!.width, 'video width').toBeGreaterThan(100);
		expect(box!.height, 'video height').toBeGreaterThan(100);
	});

	test('the interface the guide promises is actually rendered', async ({ page }) => {
		await page.goto('/e2e/guide-fixture.html');
		await page.waitForFunction(() => (window as any).__guideReady === true, { timeout: 20_000 });

		// Wake the controls: the overlay auto-hides, so a still page shows nothing.
		const box = await page.locator('#player').boundingBox();
		await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

		await expect(page.locator('#player .overlay')).toBeVisible();
	});

	test('it actually plays', async ({ page }) => {
		await page.goto('/e2e/guide-fixture.html');
		await page.waitForFunction(() => (window as any).__guideReady === true, { timeout: 20_000 });

		await page.waitForFunction(
			() => {
				const el = (window as any).player?.videoElement as HTMLMediaElement | undefined;
				return !!el && el.paused === false && el.currentTime > 0.1;
			},
			{ timeout: 20_000 },
		);
	});
});

test('screenshot of what a reader ends up looking at', async ({ page }) => {
	await page.goto('/e2e/guide-fixture.html');
	await page.waitForFunction(() => (window as any).__guideReady === true, { timeout: 20_000 });

	const box = await page.locator('#player').boundingBox();
	await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
	await page.waitForTimeout(500);

	await page.screenshot({ path: 'reports/setup-guide.png' });
});
