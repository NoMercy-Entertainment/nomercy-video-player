// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/** `liveSync` is a public player option; the player hands it to the backend before the first load. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Html5VideoBackend } from '../adapters/video-backend/html5';
import { NMVideoPlayer } from '../index';

describe('NMVideoPlayer liveSync option', () => {
	beforeEach(() => {
		document.body.innerHTML = '<div id="live-sync-test"></div>';
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	afterEach(() => {
		document.body.innerHTML = '';
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		vi.restoreAllMocks();
	});

	it('passes the option to the backend', () => {
		const spy = vi.spyOn(Html5VideoBackend.prototype, 'setLiveSync');

		new NMVideoPlayer('live-sync-test').setup({ liveSync: { targetLatency: 8, maxCatchUpRate: 1.04, forwardBuffer: 10 } }).backend();

		expect(spy).toHaveBeenCalledWith({ targetLatency: 8, maxCatchUpRate: 1.04, forwardBuffer: 10 });
	});

	it('passes an empty option when none is set, so the backend uses its defaults', () => {
		const spy = vi.spyOn(Html5VideoBackend.prototype, 'setLiveSync');

		new NMVideoPlayer('live-sync-test').setup({}).backend();

		expect(spy).toHaveBeenCalledWith({});
	});
});
