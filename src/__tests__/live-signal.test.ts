// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/** One explicit live signal: `live()` plus a `live` event, for the built-in backend and any custom one. */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Html5VideoBackend } from '../adapters/video-backend/html5';
import { NMVideoPlayer } from '../index';

class LiveBackend extends Html5VideoBackend {
	liveNow = false;

	override isLive(): boolean {
		return this.liveNow;
	}

	goLive(live: boolean): void {
		this.liveNow = live;
		this.emit('live', { live });
	}
}

describe('NMVideoPlayer live signal', () => {
	beforeEach(() => {
		document.body.innerHTML = '<div id="live-signal-test"></div>';
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	afterEach(() => {
		document.body.innerHTML = '';
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	function setup(): { player: NMVideoPlayer; backend: LiveBackend } {
		const backend = new LiveBackend(document.createElement('div'));
		const player = new NMVideoPlayer('live-signal-test').setup({ backendFactory: () => backend });
		return { player, backend };
	}

	it('is false for a recorded source', async () => {
		const { player } = setup();
		await player.backend('html5');

		expect(player.live()).toBe(false);
	});

	it('reports live and emits the live event when the backend goes live', async () => {
		const { player, backend } = setup();
		await player.backend('html5');
		const seen: boolean[] = [];
		player.on('live', data => seen.push(data.live));

		backend.goLive(true);

		expect(player.live()).toBe(true);
		expect(seen).toEqual([true]);
	});

	it('follows the backend back to not live', async () => {
		const { player, backend } = setup();
		await player.backend('html5');
		backend.goLive(true);
		const seen: boolean[] = [];
		player.on('live', data => seen.push(data.live));

		backend.goLive(false);

		expect(player.live()).toBe(false);
		expect(seen).toEqual([false]);
	});
});
