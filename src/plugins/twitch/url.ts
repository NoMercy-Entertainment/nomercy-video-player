// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/** What a Twitch link points at. A `video` with `length` above 0 is a slice of that VOD. */
export type TwitchSource
	= | { readonly type: 'clip'; readonly slug: string }
		| { readonly type: 'video'; readonly video: string; readonly start: number; readonly length: number }
		| { readonly type: 'channel'; readonly channel: string };

const WEB_HOSTS = new Set(['twitch.tv', 'www.twitch.tv', 'm.twitch.tv']);
const CLIP_HOST = 'clips.twitch.tv';
const PLAYER_HOST = 'player.twitch.tv';
const SLICE_SCHEME = 'twitch-vod:';
const RESERVED_PATHS = new Set(['directory', 'downloads', 'jobs', 'p', 'search', 'settings', 'subscriptions', 'turbo', 'videos', 'wallet']);
const CLOCK_PATTERN = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/u;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

/** Accepts plain seconds and Twitch's `1h2m3s` form. */
function parseOffset(value: string | null): number {
	if (!value)
		return 0;

	const seconds = Number(value);
	if (Number.isFinite(seconds))
		return seconds;

	const clock = CLOCK_PATTERN.exec(value);

	return clock
		? Number(clock[1] ?? 0) * SECONDS_PER_HOUR + Number(clock[2] ?? 0) * SECONDS_PER_MINUTE + Number(clock[3] ?? 0)
		: 0;
}

/** Builds a VOD source, adding the `v` prefix the SDK expects. */
function video(id: string, start: string | null, length = 0): TwitchSource {
	return { type: 'video', video: id.startsWith('v') ? id : `v${id}`, start: parseOffset(start), length };
}

/** Reads `player.twitch.tv/?video=` and `?channel=` links. */
function parsePlayerUrl(url: URL): TwitchSource | undefined {
	const id = url.searchParams.get('video');
	if (id)
		return video(id, url.searchParams.get('time'));

	const channel = url.searchParams.get('channel');

	return channel ? { type: 'channel', channel } : undefined;
}

/** Reads `clips.twitch.tv/<slug>` and its `/embed?clip=` form. */
function parseClipHostUrl(url: URL, path: readonly string[]): TwitchSource | undefined {
	const slug = path[0] === 'embed' ? url.searchParams.get('clip') : path[0];

	return slug ? { type: 'clip', slug } : undefined;
}

/** Reads VOD, clip and channel links on the main site. */
function parseWebUrl(url: URL, path: readonly string[]): TwitchSource | undefined {
	const [first, second, third] = path;

	if (first === 'videos' && second)
		return video(second, url.searchParams.get('t'));
	if (second === 'clip' && third)
		return { type: 'clip', slug: third };
	if (first && !second && !RESERVED_PATHS.has(first))
		return { type: 'channel', channel: first };

	return undefined;
}

/** Reads any regular Twitch link, plus `twitch-vod://<id>?t=<start>&d=<length>` for a slice of a VOD. */
export function parseTwitchUrl(value: string): TwitchSource | undefined {
	if (!URL.canParse(value))
		return undefined;

	const url = new URL(value);
	const path = url.pathname.split('/').filter(Boolean);

	if (url.protocol === SLICE_SCHEME)
		return video(url.hostname, url.searchParams.get('t'), Number(url.searchParams.get('d') ?? 0));
	if (url.hostname === CLIP_HOST)
		return parseClipHostUrl(url, path);
	if (url.hostname === PLAYER_HOST)
		return parsePlayerUrl(url);

	return WEB_HOSTS.has(url.hostname) ? parseWebUrl(url, path) : undefined;
}
