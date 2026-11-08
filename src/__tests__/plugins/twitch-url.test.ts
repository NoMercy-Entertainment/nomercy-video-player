// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { parseTwitchUrl } from '../../plugins/twitch/url';

describe('parseTwitchUrl', () => {
	it.each([
		['https://clips.twitch.tv/SomeSlug-abc', { type: 'clip', slug: 'SomeSlug-abc' }],
		['https://clips.twitch.tv/embed?clip=SomeSlug&parent=x', { type: 'clip', slug: 'SomeSlug' }],
		['https://www.twitch.tv/stoney_eagle/clip/SomeSlug', { type: 'clip', slug: 'SomeSlug' }],
		['https://m.twitch.tv/stoney_eagle/clip/SomeSlug', { type: 'clip', slug: 'SomeSlug' }],
		['https://www.twitch.tv/videos/123', { type: 'video', video: 'v123', start: 0, length: 0 }],
		['https://www.twitch.tv/videos/123?t=1h2m3s', { type: 'video', video: 'v123', start: 3723, length: 0 }],
		['https://player.twitch.tv/?video=v123&time=90', { type: 'video', video: 'v123', start: 90, length: 0 }],
		['https://player.twitch.tv/?channel=stoney_eagle', { type: 'channel', channel: 'stoney_eagle' }],
		['https://www.twitch.tv/stoney_eagle', { type: 'channel', channel: 'stoney_eagle' }],
		['twitch-vod://123?t=3600&d=30', { type: 'video', video: 'v123', start: 3600, length: 30 }],
	])('reads %s', (link, expected) => {
		expect(parseTwitchUrl(link)).toEqual(expected);
	});

	it.each([
		'https://raw.githubusercontent.com/org/repo/master/film.m3u8',
		'https://www.twitch.tv/directory',
		'https://www.twitch.tv/videos',
		'https://evil.example/twitch.tv/videos/123',
		'not a link',
	])('leaves %s alone', (link) => {
		expect(parseTwitchUrl(link)).toBeUndefined();
	});
});
