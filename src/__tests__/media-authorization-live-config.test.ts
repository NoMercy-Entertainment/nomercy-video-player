// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * `auth.mediaAuthorization` → `IVideoBackend.setAuthHeaderProvider` bridge.
 *
 * The provider is read lazily per request from the LIVE auth config, so a rule
 * installed with `player.auth(...)` after setup reaches media requests. Reading
 * `options.auth` instead would answer from the setup config forever.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Html5VideoBackend } from '../adapters/video-backend/html5';
import { NMVideoPlayer } from '../index';

describe('mediaAuthorization reads the live auth config', () => {
	beforeEach(() => {
		document.body.innerHTML = '<div id="media-auth-test"></div>';
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	afterEach(() => {
		document.body.innerHTML = '';
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		vi.restoreAllMocks();
	});

	it('uses the rule supplied at setup', () => {
		const spy = vi.spyOn(Html5VideoBackend.prototype, 'setAuthHeaderProvider');
		const videoPlayer = new NMVideoPlayer('media-auth-test').setup({
			auth: {
				mediaAuthorization: () => 'Bearer from-setup',
			},
		});

		videoPlayer.backend();

		const provider = spy.mock.calls[0]![0] as (url: string) => string | undefined;
		expect(provider('https://example.invalid/a.m3u8')).toBe('Bearer from-setup');
	});

	it('sees a rule installed with player.auth() after setup', () => {
		const spy = vi.spyOn(Html5VideoBackend.prototype, 'setAuthHeaderProvider');
		const videoPlayer = new NMVideoPlayer('media-auth-test').setup({});

		videoPlayer.backend();

		videoPlayer.auth({
			mediaAuthorization: () => 'Bearer from-runtime',
		});

		const provider = spy.mock.calls[0]![0] as (url: string) => string | undefined;
		expect(provider('https://example.invalid/a.m3u8')).toBe('Bearer from-runtime');
	});

	it('sees a rule replaced with player.auth() after setup', () => {
		const spy = vi.spyOn(Html5VideoBackend.prototype, 'setAuthHeaderProvider');
		const videoPlayer = new NMVideoPlayer('media-auth-test').setup({
			auth: {
				mediaAuthorization: () => 'Bearer from-setup',
			},
		});

		videoPlayer.backend();

		videoPlayer.auth({
			mediaAuthorization: () => 'Bearer rotated',
		});

		const provider = spy.mock.calls[0]![0] as (url: string) => string | undefined;
		expect(provider('https://example.invalid/a.m3u8')).toBe('Bearer rotated');
	});
});
