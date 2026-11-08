// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { lookUpTitle } from '../../plugins/twitch/metadata';

function answerWith(data: object): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data })));
	vi.stubGlobal('fetch', fetchMock);

	return fetchMock;
}

describe('lookUpTitle', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('reads a clip title', async () => {
		answerWith({ clip: { title: 'A clip' } });

		expect(await lookUpTitle({ type: 'clip', slug: 'Slug' })).toBe('A clip');
	});

	it('reads a VOD title without the v prefix in the query', async () => {
		const fetchMock = answerWith({ video: { title: 'A VOD' } });

		expect(await lookUpTitle({ type: 'video', video: 'v123', start: 0, length: 0 })).toBe('A VOD');

		const [, init] = fetchMock.mock.calls[0] ?? [];
		expect(JSON.parse(init.body).variables).toEqual({ id: '123' });
		expect(init.headers.Authorization).toBeUndefined();
	});

	it('reads the stream title of a channel', async () => {
		answerWith({ user: { displayName: 'Stoney_Eagle', broadcastSettings: { title: 'Building a player' } } });

		expect(await lookUpTitle({ type: 'channel', channel: 'stoney_eagle' })).toBe('Building a player');
	});

	it('falls back to the display name when a channel has no stream title', async () => {
		answerWith({ user: { displayName: 'Stoney_Eagle', broadcastSettings: { title: '' } } });

		expect(await lookUpTitle({ type: 'channel', channel: 'stoney_eagle' })).toBe('Stoney_Eagle');
	});

	it('finds nothing for an unknown channel', async () => {
		answerWith({ user: null });

		expect(await lookUpTitle({ type: 'channel', channel: 'nobody' })).toBeUndefined();
	});
});
