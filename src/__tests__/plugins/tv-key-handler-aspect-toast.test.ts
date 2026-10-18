// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * The TV aspect-ratio key shows a confirmation toast through desktop-ui. The
 * toast must hide on its own: osdMessage defaults MessagePlugin to 3000 ms and
 * the `display-message` event has to carry the same duration.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NMVideoPlayer } from '../../index';
import { desktopUiPlugin } from '../../plugins/desktop-ui';
import { tvKeyHandlerPlugin } from '../../plugins/tv-key-handler';

const MockResizeObserver = vi.fn(function (this: unknown) {
	return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
});

describe('tvKeyHandler aspect-ratio toast', () => {
	beforeEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		div.className = 'nomercyplayer';
		document.body.appendChild(div);
		vi.stubGlobal('ResizeObserver', MockResizeObserver);
	});

	afterEach(() => {
		vi.useRealTimers();
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		vi.unstubAllGlobals();
	});

	it('hides the toast after a few seconds without MessagePlugin mounted', async () => {
		const player = new NMVideoPlayer('test').setup({});
		player.addPlugin(desktopUiPlugin);
		player.addPlugin(tvKeyHandlerPlugin, { cooldownMs: 0 } as never);
		await player.ready();

		vi.useFakeTimers();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));

		const toast = document.querySelector('.player-message');
		expect(toast?.classList.contains('visible')).toBe(true);

		vi.advanceTimersByTime(3500);
		expect(toast?.classList.contains('visible')).toBe(false);
	});
});
