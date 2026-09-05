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

test('the HLS source the guide is written around plays', async ({ page }) => {
	// The guide's example item is an .m3u8, and it tells the reader hls.js is a
	// separate install because the package imports it only on meeting a stream.
	// This proves that path runs, rather than only the progressive one.
	await page.goto('/e2e/guide-fixture.html?src=/e2e/media/stream.m3u8');
	await page.waitForFunction(() => (window as any).__guideReady === true, { timeout: 20_000 });

	const url = await page.evaluate(() => (window as any).player.item()?.url as string);
	expect(url, 'the fixture used the HLS source').toContain('.m3u8');

	// Chromium plays no HLS natively, so an hls.js instance on the backend is
	// what separates "the library loaded and worked" from a silent fallback.

	await page.waitForFunction(
		() => {
			const el = (window as any).player?.videoElement as HTMLMediaElement | undefined;
			return !!el && el.paused === false && el.currentTime > 0.1;
		},
		{ timeout: 20_000 },
	);

	// Chromium plays no HLS natively, so an hls.js instance on the backend is
	// what separates the library having loaded from a silent fallback. It is
	// attached while the stream loads, not at ready(), so this is asserted
	// after playback has advanced rather than before.
	const usedHlsJs = await page.evaluate(
		() => Boolean((window as any).player.backend()?.hls),
	);
	expect(usedHlsJs, 'hls.js handled the stream').toBe(true);
});

test('a relative poster resolves against baseImageUrl, not baseUrl', async ({ page }) => {
	// The guide sets both and says an item's `image` goes through baseImageUrl.
	// The two bases differ here, so a poster resolved against the wrong one is
	// visible in the result rather than hidden behind a matching prefix.
	await page.goto('/e2e/guide-fixture.html');
	await page.waitForFunction(() => (window as any).__guideReady === true, { timeout: 20_000 });

	const resolved = await page.evaluate(async () => {
		const url = await (window as any).player.resolveUrl('/poster.jpg', 'poster');
		return url?.href ?? String(url);
	});

	expect(resolved, 'poster went through baseImageUrl').toContain('/e2e/media/poster.jpg');
});

test('the same id gives back the same player, not a second one', async ({ page }) => {
	await page.goto('/e2e/guide-fixture.html');
	await page.waitForFunction(() => (window as any).__guideReady === true, { timeout: 20_000 });

	const result = await page.evaluate(async () => {
		const mod = await import('/src/index.ts');
		const again = mod.default('player');
		return {
			same: again === (window as any).player,
			videos: document.querySelectorAll('#player video').length,
		};
	});

	expect(result.same, 'second call returned the same instance').toBe(true);
	expect(result.videos, 'no second video element was created').toBe(1);
});

test('a non-div container is refused by code, not silently', async ({ page }) => {
	await page.goto('/e2e/guide-fixture.html');
	await page.waitForFunction(() => (window as any).__guideReady === true, { timeout: 20_000 });

	const codes = await page.evaluate(async () => {
		const mod = await import('/src/index.ts');
		const out: Array<string | null> = [];

		const section = document.createElement('section');
		section.id = 'not-a-div';
		document.body.appendChild(section);

		try {
			mod.default('not-a-div');
			out.push(null);
		}
		catch (error: any) {
			out.push(error?.code ?? error?.message ?? null);
		}

		try {
			mod.default('nothing-with-this-id');
			out.push(null);
		}
		catch (error: any) {
			out.push(error?.code ?? error?.message ?? null);
		}

		return out;
	});

	expect(codes[0], 'a <section> container').toBe('core:player/element-not-div');
	expect(codes[1], 'a missing container').toBe('core:player/element-missing');
});

test('dispose tears the player down', async ({ page }) => {
	await page.goto('/e2e/guide-fixture.html');
	await page.waitForFunction(() => (window as any).__guideReady === true, { timeout: 20_000 });

	const after = await page.evaluate(async () => {
		await (window as any).player.dispose();
		return {
			phase: (window as any).player.phase(),
			videos: document.querySelectorAll('#player video').length,
		};
	});

	expect(after.phase, 'phase after dispose').toBe('disposed');
	expect(after.videos, 'video element removed').toBe(0);
});

test('a refused play reports itself, rolls state back, and rethrows', async ({ page }) => {
	// Chromium under Playwright allows unmuted autoplay, so the refusal has to
	// come from the backend rejecting — which is the exact condition the player
	// branches on when a real browser declines.
	await page.goto('/e2e/guide-fixture.html');
	await page.waitForFunction(() => (window as any).__guideReady === true, { timeout: 20_000 });

	const result = await page.evaluate(async () => {
		const player = (window as any).player;
		await player.pause();

		const backend = player.backend();
		backend.play = () => Promise.reject(new Error('NotAllowedError'));

		let threw = false;
		try {
			await player.play();
		}
		catch {
			threw = true;
		}

		return {
			threw,
			prevented: (window as any).__prevented,
			paused: player.videoElement.paused,
		};
	});

	expect(result.prevented.length, 'the refusal was announced').toBeGreaterThan(0);
	expect(result.prevented.at(-1).reason).toBe('backend-refused');
	expect(result.threw, 'play() rejected as well as announcing').toBe(true);
	expect(result.paused, 'state rolled back to paused').toBe(true);
});

test('screenshot of what a reader ends up looking at', async ({ page }) => {
	await page.goto('/e2e/guide-fixture.html');
	await page.waitForFunction(() => (window as any).__guideReady === true, { timeout: 20_000 });

	const box = await page.locator('#player').boundingBox();
	await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
	await page.waitForTimeout(500);

	await page.screenshot({ path: 'reports/setup-guide.png' });
});
