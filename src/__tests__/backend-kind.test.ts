// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { VideoBackendKind } from '../adapters/video-backend/IVideoBackend';
import type { VideoBackendFactory } from '../types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Html5VideoBackend } from '../adapters/video-backend/html5';
import { NMVideoPlayer } from '../index';

describe('NMVideoPlayer backend(kind) setter', () => {
	beforeEach(() => {
		document.body.innerHTML = '<div id="backend-kind-test"></div>';
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	afterEach(() => {
		document.body.innerHTML = '';
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	it('backend() with no args returns the lazily-constructed html5 backend', () => {
		const videoPlayer = new NMVideoPlayer('backend-kind-test').setup({});

		const backend = videoPlayer.backend();

		expect(backend).toBeInstanceOf(Html5VideoBackend);
		expect(videoPlayer.backend()).toBe(backend);
	});

	it('backend(kind) disposes the previous backend, constructs a new one, and emits backend:changed', async () => {
		const videoPlayer = new NMVideoPlayer('backend-kind-test').setup({});
		const first = videoPlayer.backend();

		let disposed = false;
		first.dispose = (): void => { disposed = true; };

		const events: Array<{ kind: string }> = [];
		videoPlayer.on('backend:changed', data => events.push(data));

		await videoPlayer.backend('html5');

		expect(disposed).toBe(true);
		expect(events).toEqual([{ kind: 'html5' }]);
		expect(videoPlayer.backend()).not.toBe(first);
	});

	it('backend(kind) rejects a kind with no built-in implementation and no backendFactory', async () => {
		const videoPlayer = new NMVideoPlayer('backend-kind-test').setup({});

		await expect(videoPlayer.backend('mse')).rejects.toMatchObject({
			code: 'core:not-implemented/video-backend',
		});
	});

	it('backend(kind) routes through a custom backendFactory when configured', async () => {
		const customBackend = new Html5VideoBackend(document.createElement('div'));
		const factory = vi.fn().mockReturnValue(customBackend);
		const videoPlayer = new NMVideoPlayer('backend-kind-test').setup({ backendFactory: factory });

		await videoPlayer.backend('mse');

		expect(factory).toHaveBeenCalledWith('mse', expect.anything());
		expect(videoPlayer.backend()).toBe(customBackend);
	});

	it('backend(kind) accepts a custom kind name from a backendFactory', async () => {
		const customKind: VideoBackendKind = 'twitch';
		const customBackend = new Html5VideoBackend(document.createElement('div'));
		const factory: VideoBackendFactory = vi.fn().mockReturnValue(customBackend);
		const videoPlayer = new NMVideoPlayer('backend-kind-test').setup({ backendFactory: factory });

		await videoPlayer.backend(customKind);

		expect(factory).toHaveBeenCalledWith('twitch', expect.anything());
		expect(videoPlayer.backend()).toBe(customBackend);
	});
});
