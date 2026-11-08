// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { ChannelGone } from '../../plugins/twitch/TwitchEmbedBackend';
import { TwitchEmbedBackend } from '../../plugins/twitch/TwitchEmbedBackend';

const TICK_MS = 250;
const VOD = 'https://www.twitch.tv/videos/2921357378';
const VOD_SECONDS = 12022;

class FakeTwitchPlayer {
	static readonly PLAYING = 'playing';
	static readonly PAUSE = 'pause';
	static readonly ENDED = 'ended';
	static readonly OFFLINE = 'offline';
	static latest: FakeTwitchPlayer;

	length = 0;
	position = 0;
	quality = 'auto';
	qualities = [
		{ group: 'auto', name: 'Auto', height: 0, width: 0, bitrate: 0 },
		{ group: 'chunked', name: '1080p60 (source)', height: 1080, width: 1920, bitrate: 8000000 },
		{ group: '720p60', name: '720p60', height: 720, width: 1280, bitrate: 3000000 },
	];

	sentVolumes: number[] = [];
	handlers = new Map<string, () => void>();

	constructor() {
		FakeTwitchPlayer.latest = this;
	}

	captions = false;

	play(): void {}
	pause(): void {}
	enableCaptions(): void { this.captions = true; }
	disableCaptions(): void { this.captions = false; }
	seek(seconds: number): void { this.position = seconds; }
	setVolume(volume: number): void { this.sentVolumes.push(volume); }
	setMuted(): void {}
	getCurrentTime(): number { return this.position; }
	getDuration(): number { return this.length; }
	getQuality(): string { return this.quality; }
	getQualities(): { group: string; name: string; height: number; width: number; bitrate: number }[] { return this.qualities; }
	setQuality(quality: string): void { this.quality = quality; }
	addEventListener(event: string, handler: () => void): void { this.handlers.set(event, handler); }
	fire(event: string): void { this.handlers.get(event)?.(); }
}

function reportedDurations(backend: TwitchEmbedBackend): number[] {
	const durations: number[] = [];
	backend.on('loadedmetadata', data => durations.push(data.duration));

	return durations;
}

describe('TwitchEmbedBackend', () => {
	let backend: TwitchEmbedBackend;
	let container: HTMLElement;

	beforeEach(() => {
		vi.useFakeTimers();
		window.Twitch = { Player: FakeTwitchPlayer };
		vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
			if (node instanceof HTMLScriptElement)
				node.onload?.(new Event('load'));

			return node;
		});
		container = document.createElement('div');
		backend = new TwitchEmbedBackend(container, undefined, () => 'Translated enabled');
	});

	afterEach(() => {
		backend.dispose();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('offers Twitch\'s captions as one track once a stream is loaded, and turns them on and off', async () => {
		const announced = vi.fn();
		backend.on('subtitleTracks', announced);

		expect(backend.subtitleTracks()).toEqual([]);

		await backend.load(VOD);

		expect(announced).toHaveBeenCalledOnce();
		expect(backend.subtitleTracks()).toEqual([expect.objectContaining({ label: 'Translated enabled', kind: 'captions' })]);

		backend.setSubtitleTrack(0);
		expect(FakeTwitchPlayer.latest.captions).toBe(true);

		backend.setSubtitleTrack(null);
		expect(FakeTwitchPlayer.latest.captions).toBe(false);
	});

	it('tells the player the real length once the SDK knows it', async () => {
		const durations = reportedDurations(backend);
		await backend.load(VOD);

		FakeTwitchPlayer.latest.length = VOD_SECONDS;
		vi.advanceTimersByTime(TICK_MS);

		expect(durations.at(-1)).toBe(VOD_SECONDS);
	});

	it('reports each length once, not on every tick', async () => {
		const durations = reportedDurations(backend);
		await backend.load(VOD);

		FakeTwitchPlayer.latest.length = VOD_SECONDS;
		vi.advanceTimersByTime(TICK_MS * 8);

		expect(durations.filter(duration => duration === VOD_SECONDS)).toHaveLength(1);
	});

	it('reports a slice as its own length and never the whole VOD', async () => {
		const durations = reportedDurations(backend);
		await backend.load('twitch-vod://2921357378?t=3600&d=30');

		FakeTwitchPlayer.latest.length = VOD_SECONDS;
		vi.advanceTimersByTime(TICK_MS * 4);

		expect(durations).toEqual([30]);
	});

	it('ends a slice exactly once at its end', async () => {
		const ended = vi.fn();
		backend.on('ended', ended);
		await backend.load('twitch-vod://2921357378?t=3600&d=30');

		FakeTwitchPlayer.latest.position = 3630;
		vi.advanceTimersByTime(TICK_MS * 4);

		expect(ended).toHaveBeenCalledTimes(1);
		expect(backend.state()).toBe('idle');
	});

	it('moves off auto to the tallest quality and returns when Twitch slips', async () => {
		await backend.load(VOD);
		const twitch = FakeTwitchPlayer.latest;

		vi.advanceTimersByTime(TICK_MS);
		expect(twitch.quality).toBe('chunked');

		twitch.quality = '720p60';
		vi.advanceTimersByTime(TICK_MS);
		expect(twitch.quality).toBe('chunked');
	});

	describe('quality menu', () => {
		it('offers the real renditions once, without Twitch\'s auto entry', async () => {
			const offered: string[][] = [];
			backend.on('levels', ({ levels }) => offered.push(levels.map(level => level.label)));
			await backend.load(VOD);

			vi.advanceTimersByTime(TICK_MS * 4);

			expect(offered).toEqual([['1080p60 (source)', '720p60']]);
			expect(backend.qualityLevels()[1]).toEqual({ index: 1, label: '720p60', height: 720, width: 1280, bitrate: 3000000 });
		});

		it('holds a chosen rendition, and reports the switch', async () => {
			const switched: number[] = [];
			backend.on('level-switched', ({ level }) => switched.push(level));
			await backend.load(VOD);
			const twitch = FakeTwitchPlayer.latest;
			vi.advanceTimersByTime(TICK_MS);

			backend.setQuality(1);
			vi.advanceTimersByTime(TICK_MS);
			twitch.quality = 'chunked';
			vi.advanceTimersByTime(TICK_MS);

			expect(twitch.quality).toBe('720p60');
			expect(backend.currentLevel()).toBe(1);
			expect(switched).toEqual([0, 1]);
		});

		it('treats auto as the highest quality, never Twitch\'s blurry auto', async () => {
			await backend.load(VOD);
			const twitch = FakeTwitchPlayer.latest;
			backend.setQuality(1);
			vi.advanceTimersByTime(TICK_MS);

			backend.setQuality('auto');
			vi.advanceTimersByTime(TICK_MS);

			expect(twitch.quality).toBe('chunked');
		});

		it('forgets the choice for the next item', async () => {
			await backend.load(VOD);
			backend.setQuality(1);

			await backend.load(VOD);
			vi.advanceTimersByTime(TICK_MS);

			expect(FakeTwitchPlayer.latest.quality).toBe('chunked');
		});
	});

	it('sends the same loudness curve as the html5 backend when playback starts', async () => {
		backend.volume(0.3);
		await backend.load(VOD);

		FakeTwitchPlayer.latest.fire(FakeTwitchPlayer.PLAYING);

		expect(FakeTwitchPlayer.latest.sentVolumes.at(-1)).toBeCloseTo(0.09);
		expect(backend.state()).toBe('playing');
	});

	it('keeps the embed on top through the pause Twitch reports during a seek', async () => {
		await backend.load(VOD);
		const mount = container.lastElementChild;
		if (!(mount instanceof HTMLElement))
			throw new Error('The backend added no mount');

		FakeTwitchPlayer.latest.fire(FakeTwitchPlayer.PAUSE);
		expect(mount.style.zIndex).toBe('1000');

		backend.pause();
		expect(mount.style.zIndex).toBe('');
	});

	describe('sharing the screen with the player controls', () => {
		function addBar(className: string, height: number): void {
			const bar = document.createElement('div');
			bar.className = className;
			Object.defineProperty(bar, 'offsetHeight', { value: height });
			container.append(bar);
		}

		function mount(): HTMLElement {
			const found = container.querySelector<HTMLElement>('[data-twitch-embed]');
			if (!found)
				throw new Error('The backend added no mount');

			return found;
		}

		it('narrows beside an open menu, so the menu is visible and nothing covers the embed', async () => {
			const frame = document.createElement('div');
			frame.className = 'menu-frame';
			frame.getBoundingClientRect = () => ({ left: 928 }) as DOMRect;
			container.getBoundingClientRect = () => ({ right: 1200 }) as DOMRect;
			container.append(frame);

			frame.classList.add('open');
			await vi.waitFor(() => expect(mount().style.right).toBe('272px'));

			frame.classList.remove('open');
			await vi.waitFor(() => expect(mount().style.right).toBe('0px'));
		});

		it('animates every edge that makes room, instead of snapping', () => {
			expect(mount().style.transition).toMatch(/top .*bottom .*right /u);
		});

		it('lets the mouse through to the controls underneath', () => {
			expect(mount().style.pointerEvents).toBe('none');
		});

		it('fits the embed between the bars while they show, then fills the player again', () => {
			addBar('top-bar', 86);
			addBar('bottom-bar', 80);

			backend.makeRoomForControls(true);
			expect(mount().style.top).toBe('86px');
			expect(mount().style.bottom).toBe('80px');

			backend.makeRoomForControls(false);
			expect(mount().style.top).toBe('0px');
			expect(mount().style.bottom).toBe('0px');
		});

		it('keeps the full player when there is no UI plugin', () => {
			backend.makeRoomForControls(true);

			expect(mount().style.top).toBe('0px');
			expect(mount().style.bottom).toBe('0px');
		});
	});

	describe('when a channel is gone', () => {
		const CHANNEL = 'https://www.twitch.tv/some_channel';
		let gone = vi.fn<(value: ChannelGone) => void>();
		let ended = vi.fn<() => void>();

		beforeEach(async () => {
			backend.dispose();
			gone = vi.fn<(value: ChannelGone) => void>();
			ended = vi.fn<() => void>();
			backend = new TwitchEmbedBackend(container, gone);
			backend.on('ended', ended);
			await backend.load(CHANNEL);
		});

		it('says offline when the channel never played, removes the embed and ends the item', () => {
			FakeTwitchPlayer.latest.fire(FakeTwitchPlayer.OFFLINE);

			expect(gone).toHaveBeenCalledExactlyOnceWith({ channel: 'some_channel', reason: 'offline' });
			expect(ended).toHaveBeenCalledTimes(1);
			expect(container.querySelector('iframe')).toBeNull();
			expect(backend.state()).toBe('idle');
		});

		it('says the stream ended when it had been playing', () => {
			FakeTwitchPlayer.latest.fire(FakeTwitchPlayer.PLAYING);
			FakeTwitchPlayer.latest.fire(FakeTwitchPlayer.OFFLINE);
			FakeTwitchPlayer.latest.fire(FakeTwitchPlayer.ENDED);

			expect(gone).toHaveBeenCalledExactlyOnceWith({ channel: 'some_channel', reason: 'stream-ended' });
			expect(ended).toHaveBeenCalledTimes(1);
		});

		it('does not call a VOD offline', async () => {
			await backend.load(VOD);

			FakeTwitchPlayer.latest.fire(FakeTwitchPlayer.OFFLINE);

			expect(gone).not.toHaveBeenCalled();
		});
	});

	it('refuses a link the embed cannot play', async () => {
		await expect(backend.load('https://clips.twitch.tv/SomeClip')).rejects.toThrow('cannot play');
	});
});
