// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Click-to-pause on the video element, and the two switches that turn it off.
 *
 * `DesktopUiPlugin` and `TouchZonesPlugin` each bind their own click handling,
 * so a player registering both needs one switch that reaches both. The config
 * field is that switch; the plugin option stays as the per-plugin override.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NMVideoPlayer } from '../../index';
import { DesktopUiPlugin } from '../../plugins/desktop-ui';

type ResizeCallback = (entries: Array<{ contentRect: { width: number } }>) => void;
const MockResizeObserver = vi.fn(function (this: unknown, _cb: ResizeCallback) {
	return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
});

function clickTheVideo(): void {
	const video = document.querySelector('video');

	expect(video).not.toBeNull();
	video!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('DesktopUiPlugin — click to pause', () => {
	beforeEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		div.className = 'nomercyplayer';
		document.body.appendChild(div);
		(globalThis as unknown as Record<string, unknown>).ResizeObserver = MockResizeObserver;
	});

	afterEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		delete (globalThis as unknown as Record<string, unknown>).ResizeObserver;
	});

	it('a click on the video toggles playback by default', async () => {
		const player = new NMVideoPlayer('test').setup({});
		player.addPlugin(DesktopUiPlugin);
		await player.ready();

		const toggleSpy = vi.fn().mockResolvedValue(undefined);
		(player as unknown as { togglePlayback: () => Promise<void> }).togglePlayback = toggleSpy;

		clickTheVideo();

		expect(toggleSpy).toHaveBeenCalledTimes(1);
	});

	it('the plugin option suppresses it', async () => {
		const player = new NMVideoPlayer('test').setup({});
		player.addPlugin(DesktopUiPlugin, { disableClickToPause: true });
		await player.ready();

		const toggleSpy = vi.fn().mockResolvedValue(undefined);
		(player as unknown as { togglePlayback: () => Promise<void> }).togglePlayback = toggleSpy;

		clickTheVideo();

		expect(toggleSpy).not.toHaveBeenCalled();
	});

	it('setup({ disableClickToPause: true }) suppresses it without the plugin option', async () => {
		const player = new NMVideoPlayer('test').setup({ disableClickToPause: true });
		player.addPlugin(DesktopUiPlugin);
		await player.ready();

		const toggleSpy = vi.fn().mockResolvedValue(undefined);
		(player as unknown as { togglePlayback: () => Promise<void> }).togglePlayback = toggleSpy;

		clickTheVideo();

		expect(toggleSpy).not.toHaveBeenCalled();
	});
});
