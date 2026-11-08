// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/** A live source reports duration Infinity; the time slot must say LIVE, not "-0:00". */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NMVideoPlayer } from '../../index';
import { desktopUiPlugin } from '../../plugins/desktop-ui';
import enBundle from '../../plugins/desktop-ui/i18n/en';

const MockResizeObserver = vi.fn(function (this: unknown) {
	return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
});

describe('DesktopUiPlugin — live duration label', () => {
	beforeEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
		vi.stubGlobal('ResizeObserver', MockResizeObserver);
	});

	afterEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		vi.unstubAllGlobals();
	});

	async function remainingText(duration: number): Promise<string> {
		const player = new NMVideoPlayer('test').setup({});
		await player.addPlugin(desktopUiPlugin).ready();
		player.emit('duration', { duration });
		return document.querySelector('.remaining-time')?.textContent ?? '';
	}

	it('shows the localized LIVE label when the duration is Infinity', async () => {
		const text = await remainingText(Number.POSITIVE_INFINITY);

		expect(text).toBe(enBundle['plugin.desktop-ui.time.live']);
		expect(text).not.toContain('0:00');
	});

	it('keeps showing the remaining time for a finite duration', async () => {
		expect(await remainingText(125)).toBe('-2:05');
	});
});
