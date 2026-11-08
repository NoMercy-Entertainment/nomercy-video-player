// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { IUrlResolver, UrlResolverContext } from '@nomercy-entertainment/nomercy-player-core';
import { describePlugin, StubPlayer } from '@nomercy-entertainment/nomercy-player-core/testing';
import { TwitchPlugin } from '../../plugins/twitch';
import { lookUpLiveStream, proxiedUrl } from '../../plugins/twitch/stream';

const PROXY = 'http://127.0.0.1:5097';
const CHANNEL_LINK = 'https://www.twitch.tv/some_channel';
const VOD_LINK = 'https://www.twitch.tv/videos/123';
const token = { value: '{"a":1}', signature: 'sig1' };

function decodeProxied(url: string): string {
	return atob((url.split('/').at(-2) ?? '').replaceAll('-', '+').replaceAll('_', '/'));
}

function answerWith(data: object): void {
	vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data }))));
}

describe('lookUpLiveStream', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('builds the live address for a channel that is streaming', async () => {
		answerWith({ user: { stream: { id: '1' } }, streamPlaybackAccessToken: token });

		const address = new URL(await lookUpLiveStream('some_channel') ?? '');

		expect(address.origin + address.pathname).toBe('https://usher.ttvnw.net/api/channel/hls/some_channel.m3u8');
		expect(address.searchParams.get('sig')).toBe('sig1');
		expect(address.searchParams.get('allow_source')).toBe('true');
	});

	it('finds nothing for a channel that is offline', async () => {
		answerWith({ user: { stream: null }, streamPlaybackAccessToken: token });

		expect(await lookUpLiveStream('some_channel')).toBeUndefined();
	});
});

describe('proxiedUrl', () => {
	it('ends in .m3u8 so the player treats it as HLS, and survives the round trip', () => {
		const target = 'https://usher.ttvnw.net/api/channel/hls/a.m3u8?sig=a&token=%7B%7D';
		const proxied = proxiedUrl(PROXY, target);

		expect(proxied.startsWith(`${PROXY}/`)).toBe(true);
		expect(proxied.endsWith('/index.m3u8')).toBe(true);
		expect(decodeProxied(proxied)).toBe(target);
	});
});

class RawStubPlayer extends StubPlayer {
	readonly options = {};
	resolver: IUrlResolver | undefined;
	readonly chosen: (number | 'auto')[] = [];
	readonly backendKinds: string[] = [];
	readonly reloaded: number[] = [];
	current: { url: string } | undefined;

	item(target?: number): { url: string } | undefined {
		if (target !== undefined)
			this.reloaded.push(target);

		return this.current;
	}

	override index(): number {
		return 0;
	}

	backend(kind?: string): object | Promise<void> {
		if (kind !== undefined) {
			this.backendKinds.push(kind);

			return Promise.resolve();
		}

		return {
			kind: 'html5',
			volume: () => 1,
			mute: () => {},
			setQuality: (level: number | 'auto') => this.chosen.push(level),
		};
	}

	preloadStrategy(): { assetsToPreload: () => string[] } {
		return { assetsToPreload: () => [] };
	}

	override urlResolver(): IUrlResolver | undefined;
	override urlResolver(next: IUrlResolver | undefined): void;
	override urlResolver(next?: IUrlResolver): IUrlResolver | undefined | void {
		if (next)
			this.resolver = next;

		return this.resolver;
	}
}

let player: RawStubPlayer;
const context: UrlResolverContext = {
	auth: undefined,
	baseUrl: undefined,
	category: 'media',
	defaultResolve: async url => ({ raw: url, href: url, scheme: '', origin: '', pathname: '', ext: '', search: '', searchParams: new URLSearchParams(), hash: '', relative: false }),
};

async function resolve(url: string): Promise<string> {
	const resolver = player.resolver;
	if (!resolver)
		throw new Error('The plugin installed no resolver');

	return (await resolver(url, context)).href;
}

function announceLoad(url: string): void {
	player.emit('beforeLoad', {
		data: { item: { id: url, title: 'A title', url } },
		preventDefault: () => {},
		isDefaultPrevented: () => false,
		stopImmediatePropagation: () => {},
		isPropagationStopped: () => false,
		delay: () => {},
		isDelayed: () => false,
	});
}

describePlugin(TwitchPlugin, (ctx) => {
	afterEach(() => {
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it('moves a live channel to Twitch\'s own player when chosen, and back again', async () => {
		answerWith({ user: { stream: { id: '1' } }, streamPlaybackAccessToken: token });
		player.current = { url: CHANNEL_LINK };

		ctx.plugin.useTwitchPlayer(true);
		announceLoad(CHANNEL_LINK);

		expect(ctx.plugin.usesTwitchPlayer()).toBe(true);
		expect(player.reloaded).toEqual([0]);
		expect(player.backendKinds).toEqual(['twitch']);
		expect(await resolve(CHANNEL_LINK)).toBe(CHANNEL_LINK);

		ctx.plugin.useTwitchPlayer(false);
		announceLoad(CHANNEL_LINK);

		expect(player.reloaded).toEqual([0, 0]);
		expect(decodeProxied(await resolve(CHANNEL_LINK))).toContain('usher.ttvnw.net');
	});

	it.each([
		['a film', 'https://cdn.example/film.m3u8'],
		['a VOD, which is always on the embed', VOD_LINK],
	])('does not restart %s when the choice changes', (_name, url) => {
		player.current = { url };

		ctx.plugin.useTwitchPlayer(true);

		expect(player.reloaded).toEqual([]);
	});

	it('remembers the choice for the next visit', () => {
		const saved: boolean[] = [];
		Object.assign(ctx.plugin, { storage: { getJSON: () => true, setJSON: (_key: string, value: boolean) => saved.push(value) } });

		ctx.plugin.use();
		expect(ctx.plugin.usesTwitchPlayer()).toBe(true);

		ctx.plugin.useTwitchPlayer(false);
		expect(saved).toEqual([false]);
	});

	it('plays a live channel through the player, with only its first list proxied', async () => {
		answerWith({ user: { stream: { id: '1' } }, streamPlaybackAccessToken: token });

		announceLoad(CHANNEL_LINK);
		const href = await resolve(CHANNEL_LINK);

		expect(player.backendKinds).toEqual([]);
		expect(decodeProxied(href)).toContain('usher.ttvnw.net/api/channel/hls/some_channel.m3u8');
	});

	it('keeps a VOD on the embed, because Twitch locks its video to twitch.tv', async () => {
		announceLoad(VOD_LINK);

		expect(player.backendKinds).toEqual(['twitch']);
		expect(await resolve(VOD_LINK)).toBe(VOD_LINK);
	});

	it('leaves every other link alone', async () => {
		expect(await resolve('https://cdn.example/film.m3u8')).toBe('https://cdn.example/film.m3u8');
	});

	it('picks the tallest level once, and leaves a later choice alone', async () => {
		answerWith({ user: { stream: { id: '1' } }, streamPlaybackAccessToken: token });
		announceLoad(CHANNEL_LINK);
		await resolve(CHANNEL_LINK);
		const levels = [{ index: 0, label: '360p', height: 360, bitrate: 1 }, { index: 1, label: '1080p', height: 1080, bitrate: 2 }];

		player.emit('levels', { levels });
		player.emit('levels', { levels });

		expect(player.chosen).toEqual([1]);
	});

	it('says so and refuses to load when a channel is offline', async () => {
		answerWith({ user: { stream: null }, streamPlaybackAccessToken: token });
		const emitted = vi.spyOn(player, 'emit');

		await expect(resolve(CHANNEL_LINK)).rejects.toThrow();

		expect(emitted).toHaveBeenCalledWith('display-message', { text: 'some_channel is offline', ms: 6000 });
	});

	it('says the stream ended when a live stream finishes', async () => {
		answerWith({ user: { stream: { id: '1' } }, streamPlaybackAccessToken: token });
		announceLoad(CHANNEL_LINK);
		await resolve(CHANNEL_LINK);
		const emitted = vi.spyOn(player, 'emit');

		player.emit('ended', undefined);

		expect(emitted).toHaveBeenCalledWith('plugin:twitch:channel:ended', { channel: 'some_channel' });
	});
}, {
	opts: { proxyUrl: PROXY },
	createPlayer: () => {
		player = new RawStubPlayer();

		return player;
	},
});
