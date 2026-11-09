// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * The libass canvas is mounted inside, and sized by, the box the plugin hands
 * over as `geometrySource`. The box must follow `videoRect()` on each
 * `videoRect` event and must stay visible, or the canvas is hidden with it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NMVideoPlayer } from '../../index';
import { OctopusPlugin, octopusPlugin } from '../../plugins/octopus';

const octopusCalls: Record<string, unknown>[] = [];
const resizeCalls: number[] = [];

vi.mock('@nomercy-entertainment/nomercy-subtitle-octopus', () => {
	function MockOctopus(this: Record<string, unknown>, options: Record<string, unknown>) {
		octopusCalls.push(options);
		this.on = () => {};
		this.dispose = () => {};
		this.resize = () => { resizeCalls.push(1); };
	}
	return { NMSubtitleOctopus: MockOctopus };
});

function rect(x: number, y: number, width: number, height: number) {
	return { x, y, width, height, scale: 1 };
}

describe('OctopusPlugin — subtitle box', () => {
	beforeEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		octopusCalls.length = 0;
		resizeCalls.length = 0;
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response('[Script Info]\n\n[Events]\n', { status: 200 }),
		);
	});

	afterEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	it('moves the box and re-syncs the canvas on a videoRect event', async () => {
		const player = new NMVideoPlayer('test').setup({});
		(player as unknown as { videoElement: HTMLVideoElement }).videoElement = document.createElement('video');
		let current = rect(320, 0, 1920, 1080);
		player.videoRect = () => current;
		player.addPlugin(octopusPlugin);
		await player.ready();
		await player.getPlugin(OctopusPlugin)!.subtitle('https://cdn.example.com/sub.ass');

		const box = octopusCalls[0]!.geometrySource as HTMLElement;
		expect(box.parentElement).toBe(player.container);
		expect(box.style.visibility).not.toBe('hidden');
		expect(box.style.width).toBe('1920px');
		expect(box.style.marginLeft).toBe('320px');
		expect(box.style.left).toBe('0px');

		current = rect(0, 0, 2560, 1080);
		resizeCalls.length = 0;
		(player as unknown as { emit: (event: string, data: unknown) => void }).emit('videoRect', { rect: current });

		expect(box.style.width).toBe('2560px');
		expect(box.style.marginLeft).toBe('0px');
		expect(resizeCalls.length).toBeGreaterThan(0);
	});
});
