// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * OctopusPlugin — load races and font handling across loads.
 *
 *  - A load that is no longer the active request never creates a renderer.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NMVideoPlayer } from '../../index';
import { OctopusPlugin, octopusPlugin } from '../../plugins/octopus';

const octopusCalls: Record<string, unknown>[] = [];
const octopusDisposed: unknown[] = [];

vi.mock('@nomercy-entertainment/nomercy-subtitle-octopus', () => {
	function MockOctopus(this: Record<string, unknown>, options: Record<string, unknown>) {
		octopusCalls.push(options);
		this.on = () => {};
		this.dispose = () => { octopusDisposed.push(this); };
	}
	return { NMSubtitleOctopus: MockOctopus };
});

type Responder = (url: string) => Response | Promise<Response>;

let fetchSpy: ReturnType<typeof vi.spyOn>;
const fetchedUrls: string[] = [];

function route(responder: Responder): void {
	(fetchSpy as ReturnType<typeof vi.fn>).mockImplementation(async (input: unknown) => {
		const url = input instanceof Request ? input.url : String(input);
		fetchedUrls.push(url);
		return responder(url);
	});
}

function text(body: string): Response {
	return new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((settle) => { resolve = settle; });
	return { promise, resolve };
}

interface PlayerInternal {
	videoElement: HTMLVideoElement;
	item: () => unknown;
	emit: (event: string, data: unknown) => void;
}

function setup(): NMVideoPlayer {
	const player = new NMVideoPlayer('test').setup({});
	(player as unknown as PlayerInternal).videoElement = document.createElement('video');
	return player;
}

beforeEach(() => {
	(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	octopusCalls.length = 0;
	octopusDisposed.length = 0;
	fetchedUrls.length = 0;

	const div = document.createElement('div');
	div.id = 'test';
	document.body.appendChild(div);

	fetchSpy = vi.spyOn(globalThis, 'fetch');
	vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:mock-${Math.random()}`);
	vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
	(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	document.body.innerHTML = '';
	vi.restoreAllMocks();
});

describe('OctopusPlugin — stale load', () => {
	it('creates no renderer when the track is turned off while its body is still fetching', async () => {
		const pending = deferred<string>();
		route(() => pending.promise.then(text));

		const player = setup();
		player.addPlugin(octopusPlugin);
		await player.ready();
		const plugin = player.getPlugin(OctopusPlugin)!;

		const load = plugin.subtitle('https://cdn.example.com/a.ass');
		await vi.waitFor(() => expect(fetchedUrls).toHaveLength(1));
		await plugin.subtitle(null);
		pending.resolve('[Script Info]\n');
		await load;

		expect(octopusCalls).toHaveLength(0);
		expect(plugin.renderer()).toBeNull();
	});

	it('creates one renderer, for the newest track, when a slower earlier load finishes last', async () => {
		const slow = deferred<string>();
		route(url => (url.endsWith('/a.ass') ? slow.promise.then(text) : text('[B]\n')));

		const player = setup();
		player.addPlugin(octopusPlugin);
		await player.ready();
		const plugin = player.getPlugin(OctopusPlugin)!;

		const loadA = plugin.subtitle('https://cdn.example.com/a.ass');
		await vi.waitFor(() => expect(fetchedUrls).toHaveLength(1));
		await plugin.subtitle('https://cdn.example.com/b.ass');
		slow.resolve('[A]\n');
		await loadA;

		expect(octopusCalls).toHaveLength(1);
		expect(String(octopusCalls[0]!.trackContent)).toContain('[B]');
		expect(octopusDisposed).toHaveLength(0);
		expect(plugin.subtitle()).toBe('https://cdn.example.com/b.ass');
	});

	it('creates one renderer when the same track is requested twice while loading', async () => {
		const pending = deferred<string>();
		route(() => pending.promise.then(text));

		const player = setup();
		player.addPlugin(octopusPlugin);
		await player.ready();
		const plugin = player.getPlugin(OctopusPlugin)!;

		const first = plugin.subtitle('https://cdn.example.com/a.ass');
		await vi.waitFor(() => expect(fetchedUrls).toHaveLength(1));
		const second = plugin.subtitle('https://cdn.example.com/a.ass');
		await vi.waitFor(() => expect(fetchedUrls).toHaveLength(2));
		pending.resolve('[A]\n');
		await Promise.all([first, second]);

		expect(octopusCalls).toHaveLength(1);
	});
});

describe('OctopusPlugin — font reuse across loads', () => {
	const fontUrl = 'https://cdn.example.com/f/a.ttf';

	function fontCount(url: string): number {
		return fetchedUrls.filter(fetched => fetched === url).length;
	}

	async function pluginWithItem(holder: { item: unknown }): Promise<{ player: NMVideoPlayer; plugin: OctopusPlugin }> {
		const player = setup();
		(player as unknown as PlayerInternal).item = () => holder.item;
		player.addPlugin(octopusPlugin);
		await player.ready();
		return { player, plugin: player.getPlugin(OctopusPlugin)! };
	}

	it('fetches each font once for two tracks of the same item', async () => {
		route(url => text(url.endsWith('.ttf') ? 'font' : '[Script Info]'));
		const { plugin } = await pluginWithItem({ item: { fonts: [{ file: fontUrl }] } });

		await plugin.subtitle('https://cdn.example.com/a.ass');
		await plugin.subtitle('https://cdn.example.com/b.ass');
		await plugin.subtitle(null);
		await plugin.subtitle('https://cdn.example.com/a.ass');

		expect(octopusCalls).toHaveLength(3);
		expect(fontCount(fontUrl)).toBe(1);
	});

	it('fetches the fonts again once the item changes', async () => {
		route(url => text(url.endsWith('.ttf') ? 'font' : '[Script Info]'));
		const { player, plugin } = await pluginWithItem({ item: { fonts: [{ file: fontUrl }] } });

		await plugin.subtitle('https://cdn.example.com/a.ass');
		player.emit('item' as never, { item: {}, index: 1 } as never);
		await plugin.subtitle('https://cdn.example.com/a.ass');

		expect(fontCount(fontUrl)).toBe(2);
	});

	it('does not keep fonts that finished downloading after the item changed', async () => {
		const slowFont = deferred<string>();
		route(url => (url.endsWith('/a.ttf') ? slowFont.promise.then(text) : text(url.endsWith('.ttf') ? 'font' : '[Script Info]')));
		const holder = { item: { fonts: [{ file: fontUrl }] } as unknown };
		const { player, plugin } = await pluginWithItem(holder);

		const stale = plugin.subtitle('https://cdn.example.com/a.ass');
		await vi.waitFor(() => expect(fontCount(fontUrl)).toBe(1));
		holder.item = { fonts: [{ file: 'https://cdn.example.com/f/b.ttf' }] };
		player.emit('item' as never, { item: {}, index: 1 } as never);
		slowFont.resolve('font');
		await stale;
		await plugin.subtitle('https://cdn.example.com/a.ass');

		expect(octopusCalls).toHaveLength(1);
		expect(Object.keys(octopusCalls[0]!.availableFonts as object)).toEqual(['b']);
	});
});

describe('OctopusPlugin — manifest fonts', () => {
	function manifestPlayer(): NMVideoPlayer {
		const player = new NMVideoPlayer('test').setup({ baseUrl: 'https://server.test' } as never);
		(player as unknown as PlayerInternal).videoElement = document.createElement('video');
		const item = { fonts: [{ file: '/api/fonts/fonts.json' }] };
		(player as unknown as PlayerInternal).item = () => item;
		return player;
	}

	it('fetches manifest-derived fonts through the player base URL', async () => {
		route((url) => {
			if (url.endsWith('fonts.json'))
				return text(JSON.stringify([{ file: 'Inter.ttf' }]));
			return text('data');
		});

		const player = manifestPlayer();
		player.addPlugin(octopusPlugin);
		await player.ready();
		await player.getPlugin(OctopusPlugin)!.subtitle('https://server.test/sub.ass');

		expect(fetchedUrls).toContain('https://server.test/api/fonts/fonts.json');
		expect(fetchedUrls).toContain('https://server.test/api/fonts/Inter.ttf');
	});

	it('reports a font that failed to download', async () => {
		route((url) => {
			if (url.endsWith('fonts.json'))
				return text(JSON.stringify([{ file: 'Inter.ttf' }]));
			if (url.endsWith('Inter.ttf'))
				return Promise.reject(new Error('network failure'));
			return text('[Script Info]');
		});

		const player = manifestPlayer();
		player.addPlugin(octopusPlugin);
		await player.ready();
		const plugin = player.getPlugin(OctopusPlugin)!;
		const report = vi.spyOn(plugin as unknown as { report: (entry: unknown) => void }, 'report');
		await plugin.subtitle('https://server.test/sub.ass');

		expect(report).toHaveBeenCalledWith(expect.objectContaining({
			code: 'plugin:octopus/font-load-failed',
			severity: 'warning',
		}));
	});
});
