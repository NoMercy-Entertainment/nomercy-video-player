// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Proves the next-item hand-off finds its manifests and first segments already
 * in memory: after episode 1 ends, episode 2 starts without a new master or
 * level playlist request, and in a fraction of the cold time.
 * Fixtures come from `scripts/generate-e2e-fixtures.mjs`.
 */

import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

const LATENCY_MS = 120;

declare global {
	interface Window {
		__log: Array<{ name: string; at: number; item?: string }>;
		player: { time: (seconds: number) => void };
	}
}

interface Handoff {
	endedToPlayingMs: number;
	manifestRequestsAfterEnded: string[];
	requestsAfterEnded: string[];
}

async function runHandoff(page: Page, lead: number): Promise<Handoff> {
	await page.route('**/e2e/media/**', async (route) => {
		await new Promise(resolve => setTimeout(resolve, LATENCY_MS));
		await route.continue();
	});

	await page.goto(`/e2e/warmup-fixture.html?lead=${lead}`);
	await page.waitForFunction(() => window.__log?.some(entry => entry.name === 'playing'), null, { timeout: 20_000 });
	await page.evaluate(() => { window.player.time(11); });

	await page.waitForFunction(
		() => window.__log.some(entry => entry.name === 'playing' && entry.item === 'ep2'),
		null,
		{ timeout: 40_000 },
	);

	return page.evaluate(() => {
		const log = window.__log;
		const ended = log.find(entry => entry.name === 'ended')!.at;
		const playing = log.find(entry => entry.name === 'playing' && entry.item === 'ep2')!.at;
		const after = performance.getEntriesByType('resource')
			.filter(entry => entry.startTime > ended && entry.name.includes('/ep2/'))
			.map(entry => new URL(entry.name).pathname.replace('/e2e/media/', ''));
		return {
			endedToPlayingMs: playing - ended,
			manifestRequestsAfterEnded: after.filter(path => path.endsWith('.m3u8')),
			requestsAfterEnded: after,
		};
	});
}

test.describe('next-item warmup', () => {
	test('the hand-off needs no manifest request and starts in under 150 ms', async ({ page }) => {
		const handoff = await runHandoff(page, 10);

		expect(handoff.manifestRequestsAfterEnded).toEqual([]);
		expect(handoff.endedToPlayingMs).toBeLessThan(150);
	});

	test('with warmup disabled the same hand-off fetches manifests after the end (control)', async ({ page }) => {
		const handoff = await runHandoff(page, 0);

		expect(handoff.manifestRequestsAfterEnded.length).toBeGreaterThanOrEqual(2);
		expect(handoff.endedToPlayingMs).toBeGreaterThan(300);
	});
});
