// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * The subtitle box is the painted picture clipped to the player box, for every
 * `aspectRatio()` mode: uniform (Fit), fill (Stretch), exactfit (Crop), none (True size).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NMVideoPlayer } from '../index';
import { paintedRect } from '../types';

// 21:9 player box, 16:9 video
const CW = 2560;
const CH = 1080;

describe('paintedRect()', () => {
	it('uniform: letterboxes the picture inside the player box', () => {
		expect(paintedRect('uniform', 1920, 1080, CW, CH)).toMatchObject({ x: 320, y: 0, width: 1920, height: 1080 });
	});

	it('fill: is the whole player box', () => {
		expect(paintedRect('fill', 1920, 1080, CW, CH)).toMatchObject({ x: 0, y: 0, width: CW, height: CH });
	});

	it('exactfit (crop): overflows, so the box is clipped to the player box', () => {
		expect(paintedRect('exactfit', 1920, 1080, CW, CH)).toMatchObject({ x: 0, y: 0, width: CW, height: CH });
	});

	it('none: a picture smaller than the player stays native size and centered', () => {
		expect(paintedRect('none', 1920, 1080, CW, 1200)).toMatchObject({ x: 320, y: 60, width: 1920, height: 1080 });
	});

	it('none: a picture larger than the player is clipped to the player box', () => {
		expect(paintedRect('none', 3840, 2160, CW, CH)).toMatchObject({ x: 0, y: 0, width: CW, height: CH });
	});

	it('none: clips each axis on its own', () => {
		expect(paintedRect('none', 1920, 1080, 1000, 1200)).toMatchObject({ x: 0, y: 60, width: 1000, height: 1080 });
	});

	it('is null before metadata or without a box', () => {
		expect(paintedRect('fill', 0, 0, CW, CH)).toBeNull();
		expect(paintedRect('none', 1920, 1080, 0, 0)).toBeNull();
	});
});

describe('NMVideoPlayer.videoRect() follows aspectRatio()', () => {
	beforeEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	async function makePlayer(): Promise<NMVideoPlayer> {
		const player = new NMVideoPlayer('test').setup({});
		await player.ready();
		player.backend();
		Object.defineProperty(player.videoElement!, 'videoWidth', { value: 1920, configurable: true });
		Object.defineProperty(player.videoElement!, 'videoHeight', { value: 1080, configurable: true });
		Object.defineProperty(player.container, 'clientWidth', { value: CW, configurable: true });
		Object.defineProperty(player.container, 'clientHeight', { value: CH, configurable: true });
		return player;
	}

	it('returns the painted rect for each mode', async () => {
		const player = await makePlayer();
		player.aspectRatio('uniform');
		expect(player.videoRect()).toMatchObject({ x: 320, width: 1920, height: 1080 });
		player.aspectRatio('fill');
		expect(player.videoRect()).toMatchObject({ x: 0, width: CW, height: CH });
		player.aspectRatio('exactfit');
		expect(player.videoRect()).toMatchObject({ x: 0, width: CW, height: CH });
		player.aspectRatio('none');
		expect(player.videoRect()).toMatchObject({ x: 320, width: 1920, height: 1080 });
	});

	it('emits videoRect when the mode changes', async () => {
		const player = await makePlayer();
		const seen: unknown[] = [];
		player.on('videoRect', ({ rect }) => { seen.push(rect); });
		player.aspectRatio('fill');
		player.cycleAspectRatio();
		expect(seen).toHaveLength(2);
		expect(seen[0]).toMatchObject({ width: CW, height: CH });
	});
});
