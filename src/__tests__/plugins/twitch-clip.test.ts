// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { clipStreamFactory, lookUpClip } from '../../plugins/twitch/clip';

const CLIP_LINK = 'https://clips.twitch.tv/SomeSlug';

function answerWith(clip: object | null): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { clip } })));
	vi.stubGlobal('fetch', fetchMock);

	return fetchMock;
}

const playableClip = {
	title: 'A clip',
	durationSeconds: 25,
	videoQualities: [
		{ quality: '480', sourceURL: 'https://cdn.example/480.mp4' },
		{ quality: '1080', sourceURL: 'https://cdn.example/1080.mp4' },
		{ quality: '720', sourceURL: 'https://cdn.example/720.mp4' },
	],
	playbackAccessToken: { signature: 'sig1', value: '{"a":1}' },
};

describe('lookUpClip', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns the tallest file, signed, with what Twitch says about it', async () => {
		answerWith(playableClip);

		expect(await lookUpClip('SomeSlug')).toEqual({
			url: 'https://cdn.example/1080.mp4?sig=sig1&token=%7B%22a%22%3A1%7D',
			title: 'A clip',
			duration: 25,
		});
	});

	it('sends the override client id and never an Authorization header', async () => {
		const fetchMock = answerWith(playableClip);

		await lookUpClip('SomeSlug', 'override-id');

		const [, init] = fetchMock.mock.calls[0] ?? [];
		expect(init.headers).toEqual({ 'Client-Id': 'override-id' });
	});

	it.each([
		['the clip is gone', null],
		['the clip has no token', { ...playableClip, playbackAccessToken: null }],
		['the clip has no files', { ...playableClip, videoQualities: [] }],
	])('finds nothing when %s', async (_reason, clip) => {
		answerWith(clip);

		expect(await lookUpClip('SomeSlug')).toBeUndefined();
	});
});

describe('clipStreamFactory', () => {
	const factory = clipStreamFactory(async slug => `https://cdn.example/${slug}.mp4`);

	it('claims clip links only', () => {
		expect(factory.canPlay(CLIP_LINK)).toBe(true);
		expect(factory.canPlay('https://www.twitch.tv/videos/123')).toBe(false);
		expect(factory.canPlay('https://raw.githubusercontent.com/org/film.m3u8')).toBe(false);
	});

	it('gives the element the resolved file and is ready after its metadata', async () => {
		const element = document.createElement('video');
		const stream = factory.create({ url: CLIP_LINK });

		const attached = stream.attach(element);
		await vi.waitFor(() => expect(element.src).toBe('https://cdn.example/SomeSlug.mp4'));
		expect(stream.state()).toBe('loading');

		element.dispatchEvent(new Event('loadedmetadata'));
		await attached;
		expect(stream.state()).toBe('ready');

		stream.detach();
		expect(element.hasAttribute('src')).toBe(false);
		expect(stream.state()).toBe('idle');
	});
});
