// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * A factory a consumer registers has to reach playback.
 *
 * The backend handles HLS and progressive files itself, so before this seam
 * existed the registry was seeded at setup and never asked: `registerStream`
 * recorded a factory that no load path consulted, and a URL only that factory
 * could play went to the media element as a plain `src`.
 *
 * Driven through the backend's own `load`, because the defect was in which of
 * its branches runs. A test that calls the resolver itself passes either way.
 */

import type { IStreamSource } from '@nomercy-entertainment/nomercy-player-core';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Html5VideoBackend } from '../../adapters/video-backend/html5';

const MPD = 'https://media.invalid/movie/manifest.mpd';
const MP4 = 'https://media.invalid/movie/movie.mp4';

function fakeSource(): IStreamSource & { attach: ReturnType<typeof vi.fn> } {
	return {
		kind: 'dash',
		attach: vi.fn(async () => {}),
		detach: vi.fn(),
		destroy: vi.fn(),
		state: () => 'idle',
	} as unknown as IStreamSource & { attach: ReturnType<typeof vi.fn> };
}

function makeBackend(): Html5VideoBackend {
	const container = document.createElement('div');
	document.body.appendChild(container);

	return new Html5VideoBackend(container);
}

describe('a consumer-registered stream factory reaching playback', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('attaches the resolved source instead of setting src on the element', async () => {
		const backend = makeBackend();
		const source = fakeSource();

		backend.setStreamResolver(url => (url.endsWith('.mpd') ? source : undefined));

		await backend.load(MPD);

		expect(source.attach, 'the factory\'s source drives the element').toHaveBeenCalledTimes(1);
		expect(backend.mediaElement().getAttribute('src'), 'no plain src was set').toBeNull();
	});

	// The native path awaits metadata the test DOM never emits, so these two
	// start the load and assert which branch it took rather than waiting for a
	// completion that only a real media element can deliver.
	it('leaves a progressive file on the element, so the built-in path is unchanged', async () => {
		const backend = makeBackend();
		const source = fakeSource();

		backend.setStreamResolver(url => (url.endsWith('.mpd') ? source : undefined));

		void backend.load(MP4);
		await Promise.resolve();

		expect(source.attach, 'nothing claimed it').not.toHaveBeenCalled();
		expect(backend.mediaElement().getAttribute('src')).toContain('movie.mp4');
	});

	it('behaves exactly as before when no resolver is wired', async () => {
		const backend = makeBackend();

		void backend.load(MP4);
		await Promise.resolve();

		expect(backend.mediaElement().getAttribute('src')).toContain('movie.mp4');
	});

	it('destroys the previous source before attaching the next one', async () => {
		const backend = makeBackend();
		const first = fakeSource();
		const second = fakeSource();
		let next = first;

		backend.setStreamResolver(() => next);

		await backend.load(MPD);
		next = second;
		await backend.load(MPD);

		expect(first.destroy, 'the first source is released').toHaveBeenCalledTimes(1);
		expect(second.attach).toHaveBeenCalledTimes(1);
	});
});
