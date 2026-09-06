// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * `registerStream` has to reach the load path.
 *
 * The registry, the resolver and the backend branch each had their own test and
 * all three passed while nothing joined them: `setup()` never handed the backend
 * a resolver, so a registered factory was stored and never asked and every URL
 * fell through to the element. A documentation pass found it by reading the
 * published build, where the wiring is still absent.
 *
 * Entered at `nmplayer(id)` rather than at the backend, because the defect was
 * the wiring between them. A backend-level test cannot fail on it.
 *
 * The first item is loaded by `setup()` itself, so neither case calls `load()`:
 * a second load would attach twice, and the built-in path never settles under
 * happy-dom, which has no media pipeline to fire `loadedmetadata`.
 *
 * That load lands after `ready()` resolves, which is the timing the quickstart
 * page documents, so both cases wait for the load path's own `mediaReady`.
 */

import type { IStreamFactory, IStreamSource } from '@nomercy-entertainment/nomercy-player-core';

import type { NMVideoPlayer } from '../index';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import nmplayer from '../index';

/** The load path emits `mediaReady` once the backend holds the item. */
function afterItemLoaded(player: NMVideoPlayer): Promise<void> {
	return new Promise<void>((resolve) => {
		const done = (): void => resolve();
		player.on('mediaReady', done);
		setTimeout(done, 1000);
	});
}

const MEDIA = 'https://raw.githubusercontent.com/NoMercy-Entertainment/nomercy-media/master/Films/Sintel.(2010)';
const DASH_URL = `${MEDIA}/Sintel.(2010).NoMercy.mpd`;
const MP4_URL = `${MEDIA}/Sintel.(2010).NoMercy.mp4`;

function makeContainer(id: string): void {
	const div = document.createElement('div');
	div.id = id;
	document.body.appendChild(div);
}

/** Claims `.mpd` only, which neither built-in factory nor the element branch takes. */
function makeDashFactory(attach: (element: HTMLMediaElement) => void): IStreamFactory {
	return {
		id: 'dash',
		canPlay: (url: string) => /\.mpd(?:[?#]|$)/iu.test(url),
		create: (): IStreamSource => ({
			id: 'dash',
			attach: async (element: HTMLMediaElement) => {
				attach(element);
			},
			destroy: () => {},
		}) as unknown as IStreamSource,
	} as unknown as IStreamFactory;
}

describe('a factory registered through the player reaches the load path', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('attaches the consumer source for a URL the built-ins do not claim', async () => {
		makeContainer('sr-1');
		const attach = vi.fn();

		const player = nmplayer('sr-1');
		player.registerStream(makeDashFactory(attach));
		player.setup({ playlist: [{ id: 'sintel', title: 'Sintel', url: DASH_URL }] });
		await player.ready();
		await afterItemLoaded(player);

		expect(attach).toHaveBeenCalledTimes(1);
		expect(attach.mock.calls[0]?.[0]).toBeInstanceOf(HTMLElement);

		await player.dispose();
	});

	it('leaves a URL the factory does not claim on the built-in path', async () => {
		makeContainer('sr-2');
		const attach = vi.fn();

		const player = nmplayer('sr-2');
		player.registerStream(makeDashFactory(attach));
		player.setup({ playlist: [{ id: 'sintel', title: 'Sintel', url: MP4_URL }] });
		await player.ready();
		await afterItemLoaded(player);

		expect(attach).not.toHaveBeenCalled();

		await player.dispose();
	});
});
