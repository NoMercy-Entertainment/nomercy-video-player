// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { describePlugin, StubPlayer } from '@nomercy-entertainment/nomercy-player-core/testing';
import { TwitchPlugin } from '../../plugins/twitch';
import { TwitchEmbedBackend } from '../../plugins/twitch/TwitchEmbedBackend';

interface FakeItem { url?: string }

class FakeBackend {
	level = 1;
	muted = false;
	readonly kind: string;

	constructor(kind: string) {
		this.kind = kind;
	}

	volume(value?: number): number {
		if (value !== undefined)
			this.level = value;

		return this.level;
	}

	mute(): void {
		this.muted = true;
	}
}

/** The stub has no backend or preload surface, and these are what the plugin drives. */
class BackendStubPlayer extends StubPlayer {
	readonly options: { backendFactory?: (kind: string, config: object) => object } = {};
	active = new FakeBackend('html5');
	readonly strategy = { assetsToPreload: (item: FakeItem): string[] => [item.url ?? ''] };

	embed: TwitchEmbedBackend | undefined;

	backend(kind?: string): FakeBackend | TwitchEmbedBackend | Promise<void> {
		if (kind === undefined)
			return this.embed ?? this.active;

		this.active = new FakeBackend(kind);

		return Promise.resolve();
	}

	preloadStrategy(): BackendStubPlayer['strategy'] {
		return this.strategy;
	}
}

let player: BackendStubPlayer;

async function announceLoad(url: string): Promise<boolean> {
	const delays: Promise<unknown>[] = [];
	player.emit('beforeLoad', {
		data: { item: { id: url, title: 'A title', url } },
		preventDefault: () => {},
		isDefaultPrevented: () => false,
		stopImmediatePropagation: () => {},
		isPropagationStopped: () => false,
		delay: promise => delays.push(promise),
		isDelayed: () => delays.length > 0,
	});
	await Promise.all(delays);

	return delays.length > 0;
}

class FakeTwitchSdkPlayer {
	static readonly PLAYING = 'playing';
	static readonly PAUSE = 'pause';
	static readonly ENDED = 'ended';
	static readonly OFFLINE = 'offline';
	static latest: FakeTwitchSdkPlayer;

	handlers = new Map<string, () => void>();

	constructor() {
		FakeTwitchSdkPlayer.latest = this;
	}

	play(): void {}
	pause(): void {}
	enableCaptions(): void {}
	disableCaptions(): void {}
	seek(): void {}
	setVolume(): void {}
	setMuted(): void {}
	getCurrentTime(): number { return 0; }
	getDuration(): number { return 0; }
	getQuality(): string { return 'auto'; }
	getQualities(): { group: string; name: string; height: number; width: number; bitrate: number }[] { return []; }
	setQuality(): void {}
	addEventListener(event: string, handler: () => void): void { this.handlers.set(event, handler); }
	fire(event: string): void { this.handlers.get(event)?.(); }
}

describePlugin(TwitchPlugin, () => {
	it('moves to the embed for a VOD and back to html5 for anything else', async () => {
		await announceLoad('https://www.twitch.tv/videos/123');
		expect(player.active.kind).toBe('twitch');

		await announceLoad('https://raw.githubusercontent.com/org/film.m3u8');
		expect(player.active.kind).toBe('html5');
	});

	it('keeps clips on html5 without swapping', async () => {
		expect(await announceLoad('https://clips.twitch.tv/SomeSlug')).toBe(false);
		expect(player.active.kind).toBe('html5');
	});

	it('gives the new backend the slider level, not the old backend\'s loudness', async () => {
		player.emit('volume', { level: 30 });
		player.active.volume(0.09);

		await announceLoad('https://www.twitch.tv/videos/123');

		expect(player.active.kind).toBe('twitch');
		expect(player.active.volume()).toBe(0.3);
	});

	it('carries mute across a swap and keeps the level for unmuting', async () => {
		player.emit('volume', { level: 30 });
		player.emit('mute', { muted: true });

		await announceLoad('https://www.twitch.tv/videos/123');

		expect(player.active.muted).toBe(true);
		expect(player.active.volume()).toBe(0.3);
	});

	it.each([
		['offline', 'some_channel is offline', 'channel:offline'],
		['stream-ended', 'The stream by some_channel has ended', 'channel:ended'],
	] as const)('tells the viewer and listeners when a channel is %s', async (reason, text, event) => {
		const emitted = vi.spyOn(player, 'emit');
		const backend = player.options.backendFactory?.('twitch', {});
		if (!(backend instanceof TwitchEmbedBackend))
			throw new Error('The plugin did not build the Twitch backend');

		vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
			if (node instanceof HTMLScriptElement)
				node.onload?.(new Event('load'));

			return node;
		});
		window.Twitch = { Player: FakeTwitchSdkPlayer };
		await backend.load('https://www.twitch.tv/some_channel');
		if (reason === 'stream-ended')
			FakeTwitchSdkPlayer.latest.fire('playing');
		FakeTwitchSdkPlayer.latest.fire('offline');
		backend.dispose();
		vi.restoreAllMocks();

		expect(emitted).toHaveBeenCalledWith('display-message', { text, ms: 6000 });
		expect(emitted).toHaveBeenCalledWith(`plugin:twitch:${event}`, { channel: 'some_channel' });
	});

	describe('titles', () => {
		function titleAfterLoad(title: string, url: string): Promise<string> {
			const item = { id: 'item', title, url };
			const delays: Promise<unknown>[] = [];
			player.emit('beforeLoad', {
				data: { item },
				preventDefault: () => {},
				isDefaultPrevented: () => false,
				stopImmediatePropagation: () => {},
				isPropagationStopped: () => false,
				delay: (promise: Promise<unknown>) => delays.push(promise),
				isDelayed: () => delays.length > 0,
			});

			return Promise.all(delays).then(() => item.title);
		}

		beforeEach(() => {
			vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { video: { title: 'From Twitch' } } }))));
		});

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it('fills in a missing title from Twitch', async () => {
			expect(await titleAfterLoad('', 'https://www.twitch.tv/videos/123')).toBe('From Twitch');
		});

		it('replaces a title that is only the link', async () => {
			const link = 'https://www.twitch.tv/videos/123';

			expect(await titleAfterLoad(link, link)).toBe('From Twitch');
		});

		it('tells the UI again once the title is known', async () => {
			const link = 'https://www.twitch.tv/videos/123';
			const announced: (string | undefined)[] = [];
			player.emit('item', { item: { id: 'item', title: '', url: link }, index: 0 });
			const listener = (payload: { item?: { title?: string } }): void => {
				announced.push(payload.item?.title);
			};
			player.on('item', listener);

			await titleAfterLoad('', link);
			player.off('item', listener);

			expect(announced).toEqual(['From Twitch']);
		});

		it('keeps a title the consumer chose', async () => {
			expect(await titleAfterLoad('My title', 'https://www.twitch.tv/videos/123')).toBe('My title');
		});

		it('still loads when Twitch cannot be reached', async () => {
			vi.stubGlobal('fetch', vi.fn(async () => {
				throw new Error('offline');
			}));

			expect(await titleAfterLoad('', 'https://www.twitch.tv/videos/123')).toBe('');
		});
	});

	it('makes room in the embed when the player controls show and hide', () => {
		const backend = player.options.backendFactory?.('twitch', {});
		if (!(backend instanceof TwitchEmbedBackend))
			throw new Error('The plugin did not build the Twitch backend');
		const makeRoom = vi.spyOn(backend, 'makeRoomForControls');
		player.embed = backend;

		player.emit('activity', { active: true });
		player.emit('activity', { active: false });

		expect(makeRoom.mock.calls).toEqual([[true], [false]]);
		backend.dispose();
	});

	it('ignores control activity on any other backend', () => {
		expect(() => player.emit('activity', { active: true })).not.toThrow();
		expect(player.active.kind).toBe('html5');
	});

	it('does not prefetch Twitch links but still prefetches files', () => {
		player.emit('ready', undefined);

		expect(player.strategy.assetsToPreload({ url: 'https://www.twitch.tv/videos/123' })).toEqual([]);
		expect(player.strategy.assetsToPreload({ url: 'https://clips.twitch.tv/SomeSlug' })).toEqual([]);
		expect(player.strategy.assetsToPreload({ url: 'https://cdn.example/film.m3u8' })).toEqual(['https://cdn.example/film.m3u8']);
	});
}, {
	createPlayer: () => {
		player = new BackendStubPlayer();

		return player;
	},
});
