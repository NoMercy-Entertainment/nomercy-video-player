// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Pins the v1 compatibility wall — `V1VideoCompatPlugin` attaches the legacy
 * v1 method surface onto a live v2 player instance. Every shim must delegate
 * to the real v2 API, warn once per call, and never touch the prototype so
 * players without the plugin stay clean.
 *
 * Construction mirrors `constructor.test.ts` / `video-toggles.test.ts`:
 * real players, real setup pipeline, `Object.assign` stubs only for track
 * surfaces the happy-dom backend cannot populate.
 */

import type { IPlatform } from '@nomercy-entertainment/nomercy-player-core';
import type { VideoPlaylistItem } from '../../types';
import { Logger, NotImplementedError, Plugin, SetupState } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NMVideoPlayer } from '../../index';
import { V1VideoCompatPlugin } from '../../plugins/v1-compat';
import { PlayState, VolumeState } from '../../types';

const flush = async (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

interface FakeControllerHandles {
	enter: ReturnType<typeof vi.fn>;
	exit: ReturnType<typeof vi.fn>;
	setActive: (active: boolean) => void;
}

function buildFakePlatform(opts: { fullscreen?: boolean; pip?: boolean } = { fullscreen: true, pip: true }): { platform: IPlatform; fs: FakeControllerHandles; pip: FakeControllerHandles } {
	let fsActive = false;
	let pipActive = false;

	const fsEnter = vi.fn(async (_target: HTMLElement) => { fsActive = true; });
	const fsExit = vi.fn(async () => { fsActive = false; });
	const pipEnter = vi.fn(async (_video: HTMLVideoElement) => { pipActive = true; });
	const pipExit = vi.fn(async () => { pipActive = false; });

	const platform: IPlatform = {
		wakeLock: {
			acquire: async () => {},
			release: async () => {},
			isHeld: () => false,
		},
		network: {
			isOnline: () => true,
			type: () => 'wifi',
			downlinkMbps: () => undefined,
			rttMs: () => undefined,
			subscribe: () => () => {},
		},
		visibility: {
			isVisible: () => true,
			subscribe: () => () => {},
		},
		capabilities: {
			canDecode: async () => ({ supported: true, smooth: true, powerEfficient: true }),
		},
		fullscreen: opts.fullscreen
			? {
					enter: fsEnter,
					exit: fsExit,
					isActive: () => fsActive,
					isSupported: () => true,
					subscribe: () => () => {},
				}
			: undefined,
		pip: opts.pip
			? {
					enter: pipEnter,
					exit: pipExit,
					isActive: () => pipActive,
					isSupported: () => true,
					subscribe: () => () => {},
				}
			: undefined,
	};

	return {
		platform,
		fs: { enter: fsEnter, exit: fsExit, setActive: (active) => { fsActive = active; } },
		pip: { enter: pipEnter, exit: pipExit, setActive: (active) => { pipActive = active; } },
	};
}

async function buildCompatPlayer(config: Record<string, unknown> = {}): Promise<NMVideoPlayer<VideoPlaylistItem>> {
	const player = new NMVideoPlayer('test');
	player.addPlugin(V1VideoCompatPlugin);
	player.setup({ logLevel: 'silent', ...config });
	await player.ready();
	return player;
}

describe('V1VideoCompatPlugin', () => {
	beforeEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	// ── installation & isolation ────────────────────────────────────────────────

	describe('installation', () => {
		it('use() attaches the shims to the player instance, not the prototype', async () => {
			const player = await buildCompatPlayer();

			expect(typeof player.seek).toBe('function');
			expect(typeof player.speed).toBe('function');
			expect(typeof player.muted).toBe('function');
			expect(typeof player.enterFullscreen).toBe('function');

			expect(Object.hasOwn(player, 'seek')).toBe(true);
			expect('seek' in NMVideoPlayer.prototype).toBe(false);
			expect('speed' in NMVideoPlayer.prototype).toBe(false);
			expect(Object.hasOwn(NMVideoPlayer.prototype, 'isPlaying')).toBe(false);
		});

		it('a second player without the plugin has no shims (no leakage)', async () => {
			await buildCompatPlayer();

			const otherDiv = document.createElement('div');
			otherDiv.id = 'test-clean';
			document.body.appendChild(otherDiv);
			const cleanPlayer = new NMVideoPlayer('test-clean').setup({ logLevel: 'silent' });
			await cleanPlayer.ready();

			expect('seek' in cleanPlayer).toBe(false);
			expect('speeds' in cleanPlayer).toBe(false);
			expect('enterFullscreen' in cleanPlayer).toBe(false);
			expect('isPlaying' in cleanPlayer).toBe(false);
		});

		it('double install throws core:plugin/duplicate-id (registration is guarded)', async () => {
			const player = await buildCompatPlayer();
			expect(() => player.addPlugin(V1VideoCompatPlugin)).toThrow(/core:plugin\/duplicate-id/);
		});

		it('the plugin is retrievable by its id', async () => {
			const player = await buildCompatPlayer();
			expect(player.getPluginById('v1-video-compat')).toBeInstanceOf(V1VideoCompatPlugin);
		});

		it('every shim call logs one deprecation warning', async () => {
			const sink = vi.fn();
			const rootLogger = new Logger({ prefix: 'nmplayer', level: 'warn' });
			rootLogger.addSink(sink);

			const player = await buildCompatPlayer({ logger: rootLogger });
			player.speeds();

			const warnCalls = sink.mock.calls.filter(call => call[0] === 'warn');
			expect(warnCalls).toHaveLength(1);
			expect(String(warnCalls[0]![2])).toContain('@deprecated player.speeds()');

			player.speeds();
			expect(sink.mock.calls.filter(call => call[0] === 'warn')).toHaveLength(2);
		});
	});

	// ── removal ─────────────────────────────────────────────────────────────────

	describe('removal', () => {
		it('removePluginById emits plugin:disposed and stops the event bridges', async () => {
			const player = await buildCompatPlayer();

			const speedEvents: unknown[] = [];
			const playlistEvents: unknown[] = [];
			player.on('speed' as any, (data: any) => { speedEvents.push(data); });
			player.on('playlist' as any, (data: any) => { playlistEvents.push(data); });

			player.emit('playbackRate' as any, { rate: 1.5 } as any);
			player.queue([{ id: 'bridge-a' } as VideoPlaylistItem]);
			expect(speedEvents).toHaveLength(1);
			expect(playlistEvents).toHaveLength(1);

			let disposedId: string | undefined;
			player.on('plugin:disposed' as any, (data: any) => { disposedId = data.id; });
			player.removePluginById('v1-video-compat');
			expect(disposedId).toBe('v1-video-compat');

			player.emit('playbackRate' as any, { rate: 2 } as any);
			player.queue([{ id: 'bridge-b' } as VideoPlaylistItem]);
			expect(speedEvents).toHaveLength(1);
			expect(playlistEvents).toHaveLength(1);
		});

		it('instance shims remain callable after removal (implemented behavior: no uninstall pass)', async () => {
			const player = await buildCompatPlayer();
			player.removePluginById('v1-video-compat');
			expect(typeof player.seek).toBe('function');
			expect('seek' in NMVideoPlayer.prototype).toBe(false);
		});
	});

	// ── setup shim ──────────────────────────────────────────────────────────────

	describe('setup shim (v1 repeat-setup source swap)', () => {
		it('a second setup() call does not throw and queues the incoming playlist', async () => {
			const player = await buildCompatPlayer();
			expect(player.setupState()).not.toBe(SetupState.NOT_SETUP);

			const items: VideoPlaylistItem[] = [{ id: 'swap-a' }, { id: 'swap-b' }];
			const returned = player.setup({ playlist: items });

			expect(returned).toBe(player);
			expect(player.queue()).toHaveLength(2);
			expect(player.queue()[0]!.id).toBe('swap-a');
		});

		it('a second setup() with muted: true mutes the player', async () => {
			const player = await buildCompatPlayer();
			player.setup({ muted: true });
			await flush();
			expect(player.volumeState()).toBe(VolumeState.MUTED);
		});

		it('a second setup() with muted: false unmutes the player', async () => {
			const player = await buildCompatPlayer();
			await player.mute();
			player.setup({ muted: false });
			await flush();
			expect(player.volumeState()).toBe(VolumeState.UNMUTED);
		});

		it('a second setup() with autoPlay plays item 0 of the incoming playlist', async () => {
			const player = await buildCompatPlayer();
			const itemCalls: Array<{ target: unknown; opts: unknown }> = [];
			Object.assign(player, {
				item: (target?: unknown, opts?: unknown) => {
					if (target === undefined)
						return undefined;
					itemCalls.push({ target, opts });
				},
			});

			player.setup({ playlist: [{ id: 'auto-a' }], autoPlay: true });

			expect(itemCalls).toHaveLength(1);
			expect(itemCalls[0]!.target).toBe(0);
			expect(itemCalls[0]!.opts).toEqual({ autoplay: true });
		});
	});

	// ── transport shims ─────────────────────────────────────────────────────────

	describe('transport shims', () => {
		it('seek() clamps to [0, duration] and delegates to time()', async () => {
			const player = await buildCompatPlayer();
			const seeks: number[] = [];
			Object.assign(player, {
				duration: () => 300,
				time: (seconds?: number) => {
					if (seconds === undefined)
						return 0;
					seeks.push(seconds);
					return Promise.resolve();
				},
			});

			expect(player.seek(500)).toBe(300);
			expect(player.seek(-5)).toBe(0);
			expect(player.seek(100)).toBe(100);
			expect(seeks).toEqual([300, 0, 100]);
		});

		it('seek() passes the raw value through when duration is unknown (0)', async () => {
			const player = await buildCompatPlayer();
			const seeks: number[] = [];
			Object.assign(player, {
				duration: () => 0,
				time: (seconds?: number) => {
					if (seconds === undefined)
						return 0;
					seeks.push(seconds);
					return Promise.resolve();
				},
			});

			expect(player.seek(500)).toBe(500);
			expect(seeks).toEqual([500]);
		});

		it('speed() reads playbackRate(); speed(rate) writes it', async () => {
			const player = await buildCompatPlayer();
			expect(player.speed()).toBe(player.playbackRate());

			player.speed(1.5);
			await flush();
			expect(player.playbackRate()).toBe(1.5);
			expect(player.speed()).toBe(1.5);
		});

		it('speeds() returns playbackRates()', async () => {
			const player = await buildCompatPlayer();
			expect(player.speeds()).toEqual(player.playbackRates());
		});

		it('hasSpeeds() derives from playbackRates().length > 1', async () => {
			const player = await buildCompatPlayer();
			expect(player.hasSpeeds()).toBe(player.playbackRates().length > 1);

			Object.assign(player, { playbackRates: () => [1] });
			expect(player.hasSpeeds()).toBe(false);

			Object.assign(player, { playbackRates: () => [1, 1.5] });
			expect(player.hasSpeeds()).toBe(true);
		});

		it('muted() get reflects volumeState; muted(state) mutes / unmutes', async () => {
			const player = await buildCompatPlayer();
			expect(player.muted()).toBe(false);

			player.muted(true);
			await flush();
			expect(player.volumeState()).toBe(VolumeState.MUTED);
			expect(player.muted()).toBe(true);

			player.muted(false);
			await flush();
			expect(player.volumeState()).toBe(VolumeState.UNMUTED);
			expect(player.muted()).toBe(false);
		});

		it('gain() returns 0 before a backend exists and the element volume after', async () => {
			const player = await buildCompatPlayer();
			expect(player.gain()).toBe(0);

			player.backend();
			expect(player.gain()).toBe(player.videoElement!.volume);
		});

		it('isPlaying property derives from playState()', async () => {
			const player = await buildCompatPlayer();
			expect(player.isPlaying).toBe(false);

			Object.assign(player, { playState: () => PlayState.PLAYING });
			expect(player.isPlaying).toBe(true);
		});
	});

	// ── display shims ───────────────────────────────────────────────────────────

	describe('display shims', () => {
		it('allowFullscreen defaults to true and setAllowFullscreen writes it', async () => {
			const player = await buildCompatPlayer();
			expect(player.allowFullscreen).toBe(true);

			player.setAllowFullscreen(false);
			expect(player.allowFullscreen).toBe(false);
		});

		it('enterFullscreen() delegates to fullscreen(true); exitFullscreen() to fullscreen(false)', async () => {
			const fake = buildFakePlatform();
			const player = await buildCompatPlayer({ platform: fake.platform });

			player.enterFullscreen();
			expect(fake.fs.enter).toHaveBeenCalledTimes(1);

			player.exitFullscreen();
			expect(fake.fs.exit).toHaveBeenCalledTimes(1);
		});

		it('setAllowFullscreen(false) gates enterFullscreen() but never exitFullscreen()', async () => {
			const fake = buildFakePlatform();
			const player = await buildCompatPlayer({ platform: fake.platform });

			player.setAllowFullscreen(false);
			player.enterFullscreen();
			expect(fake.fs.enter).not.toHaveBeenCalled();

			player.exitFullscreen();
			expect(fake.fs.exit).toHaveBeenCalledTimes(1);
		});

		it('stretchOptions lists the four v1 stretch modes', async () => {
			const player = await buildCompatPlayer();
			expect(player.stretchOptions).toEqual(['uniform', 'fill', 'exactfit', 'none']);
		});

		it('aspect() reads aspectRatio(); aspect(value) and setAspect(value) write it', async () => {
			const player = await buildCompatPlayer();
			expect(player.aspect()).toBe('uniform');

			player.aspect('fill');
			expect(player.aspectRatio()).toBe('fill');
			expect(player.aspect()).toBe('fill');

			player.setAspect('none');
			expect(player.aspectRatio()).toBe('none');
		});

		it('width()/height() read the container client box and element() returns the container', async () => {
			const player = await buildCompatPlayer();
			expect(player.width()).toBe(player.container.clientWidth);
			expect(player.height()).toBe(player.container.clientHeight);
			expect(player.element()).toBe(player.container);
		});

		it('resize() is a safe no-op (reads videoRect, never throws pre-backend)', async () => {
			const player = await buildCompatPlayer();
			expect(() => player.resize()).not.toThrow();
		});

		it('state() mirrors playState()', async () => {
			const player = await buildCompatPlayer();
			expect(player.state()).toBe(player.playState());
		});

		it('currentTime() reads time(); currentTime(seconds) writes it', async () => {
			const player = await buildCompatPlayer();
			const seeks: number[] = [];
			Object.assign(player, {
				time: (seconds?: number) => {
					if (seconds === undefined)
						return 42;
					seeks.push(seconds);
					return Promise.resolve();
				},
			});

			expect(player.currentTime()).toBe(42);
			player.currentTime(12);
			expect(seeks).toEqual([12]);
		});

		it('currentSrc() returns an empty string before a backend exists', async () => {
			const player = await buildCompatPlayer();
			expect(player.currentSrc()).toBe('');
		});

		it('hasPIP() reflects platform().pip presence', async () => {
			const withPip = buildFakePlatform({ fullscreen: true, pip: true });
			const player = await buildCompatPlayer({ platform: withPip.platform });
			expect(player.hasPIP()).toBe(true);
		});

		it('hasPIP() is false when the platform has no pip controller', async () => {
			const withoutPip = buildFakePlatform({ fullscreen: true, pip: false });
			const player = await buildCompatPlayer({ platform: withoutPip.platform });
			expect(player.hasPIP()).toBe(false);
		});

		it('hasPIP() is false when the pip controller reports no support', async () => {
			const fake = buildFakePlatform({ fullscreen: true, pip: true });
			vi.spyOn(fake.platform.pip!, 'isSupported').mockReturnValue(false);
			const player = await buildCompatPlayer({ platform: fake.platform });
			expect(player.hasPIP()).toBe(false);
		});

		it('setFloatingPlayer(active) delegates to pip()', async () => {
			const fake = buildFakePlatform();
			const player = await buildCompatPlayer({ platform: fake.platform });

			player.setFloatingPlayer(true);
			expect(fake.pip.enter).toHaveBeenCalledTimes(1);

			player.setFloatingPlayer(false);
			expect(fake.pip.exit).toHaveBeenCalledTimes(1);
		});
	});

	// ── track shims ─────────────────────────────────────────────────────────────

	describe('track shims', () => {
		it('subtitleIndex() returns -1 with no selection and the index with one', async () => {
			const player = await buildCompatPlayer();
			expect(player.subtitleIndex()).toBe(-1);

			Object.assign(player, { subtitle: () => ({ index: 2, track: { id: 'de' } }) });
			expect(player.subtitleIndex()).toBe(2);
		});

		it('subtitleIndexBy(language) searches subtitles() by language', async () => {
			const player = await buildCompatPlayer();
			Object.assign(player, {
				subtitles: () => [
					{ id: 'en', language: 'en', label: 'English', kind: 'subtitles', url: 'en.vtt', default: false },
					{ id: 'nl', language: 'nl', label: 'Dutch', kind: 'subtitles', url: 'nl.vtt', default: false },
				],
			});
			expect(player.subtitleIndexBy('nl')).toBe(1);
			expect(player.subtitleIndexBy('fr')).toBe(-1);
		});

		it('hasSubtitles() derives from subtitles().length', async () => {
			const player = await buildCompatPlayer();
			expect(player.hasSubtitles()).toBe(false);

			Object.assign(player, { subtitles: () => [{ id: 'en', url: 'en.vtt', kind: 'subtitles', label: 'English', default: false }] });
			expect(player.hasSubtitles()).toBe(true);
		});

		it('subtitleFile() rejects with NotImplementedError', async () => {
			const player = await buildCompatPlayer();
			await expect(player.subtitleFile('https://x/en.vtt')).rejects.toBeInstanceOf(NotImplementedError);
		});

		it('audioTrackIndex() returns -1 with no selection and the index with one', async () => {
			const player = await buildCompatPlayer();
			expect(player.audioTrackIndex()).toBe(-1);

			Object.assign(player, { audioTrack: () => ({ index: 1, track: { id: 'nl' } }) });
			expect(player.audioTrackIndex()).toBe(1);
		});

		it('hasAudioTracks() and audioTrackIndexByLanguage() derive from audioTracks()', async () => {
			const player = await buildCompatPlayer();
			expect(player.hasAudioTracks()).toBe(false);
			expect(player.audioTrackIndexByLanguage('nl')).toBe(-1);

			Object.assign(player, {
				audioTracks: () => [
					{ id: 'en', language: 'en', label: 'English', default: true },
					{ id: 'nl', language: 'nl', label: 'Dutch', default: false },
				],
			});
			expect(player.hasAudioTracks()).toBe(true);
			expect(player.audioTrackIndexByLanguage('nl')).toBe(1);
		});

		it('hasQualities() derives from qualityLevels().length', async () => {
			const player = await buildCompatPlayer();
			expect(player.hasQualities()).toBe(false);

			Object.assign(player, { qualityLevels: () => [{ index: 0, height: 1080 }] });
			expect(player.hasQualities()).toBe(true);
		});

		it('chapterFile() rejects with NotImplementedError', async () => {
			const player = await buildCompatPlayer();
			await expect(player.chapterFile('https://x/chapters.vtt')).rejects.toBeInstanceOf(NotImplementedError);
		});

		it('chapterText() reads the current chapter title; chapterText(idx) reads by index', async () => {
			const player = await buildCompatPlayer();
			expect(player.chapterText()).toBe('');
			expect(player.chapterText(0)).toBe('');

			Object.assign(player, {
				chapter: () => ({ index: 1, start: 10, end: 20, title: 'Current' }),
				chapters: () => [
					{ index: 0, start: 0, end: 10, title: 'Intro' },
					{ index: 1, start: 10, end: 20, title: 'Current' },
				],
			});
			expect(player.chapterText()).toBe('Current');
			expect(player.chapterText(0)).toBe('Intro');
			expect(player.chapterText(9)).toBe('');
		});
	});

	// ── skipper shims ───────────────────────────────────────────────────────────

	describe('skipper shims', () => {
		it('skippers() always returns an empty list', async () => {
			const player = await buildCompatPlayer();
			expect(player.skippers()).toEqual([]);
		});

		it('skip() throws NotImplementedError synchronously', async () => {
			const player = await buildCompatPlayer();
			expect(() => player.skip()).toThrow(NotImplementedError);
		});

		it('skipFile() rejects with NotImplementedError', async () => {
			const player = await buildCompatPlayer();
			await expect(player.skipFile('https://x/skip.json')).rejects.toBeInstanceOf(NotImplementedError);
		});
	});

	// ── playlist shims ──────────────────────────────────────────────────────────

	describe('playlist shims', () => {
		it('playlist() reads queue(); playlist(items) writes it', async () => {
			const player = await buildCompatPlayer();
			expect(player.playlist()).toEqual([]);

			player.playlist([{ id: 'pl-a' }, { id: 'pl-b' }]);
			expect(player.queue()).toHaveLength(2);
			expect(player.playlist()).toEqual(player.queue());
		});

		it('playlistItem() returns the current item, or {} when the queue is empty', async () => {
			const player = await buildCompatPlayer();
			expect(player.playlistItem()).toEqual({});

			player.queue([{ id: 'cur-a' } as VideoPlaylistItem]);
			expect((player.playlistItem() as VideoPlaylistItem).id).toBe('cur-a');
		});

		it('playlistIndex() mirrors index()', async () => {
			const player = await buildCompatPlayer();
			expect(player.playlistIndex()).toBe(player.index());

			player.queue([{ id: 'idx-a' } as VideoPlaylistItem]);
			expect(player.playlistIndex()).toBe(player.index());
		});

		it('playVideo(target) selects the item with autoplay forced on', async () => {
			const player = await buildCompatPlayer();
			const itemCalls: Array<{ target: unknown; opts: unknown }> = [];
			Object.assign(player, {
				item: (target?: unknown, opts?: unknown) => {
					if (target === undefined)
						return undefined;
					itemCalls.push({ target, opts });
				},
			});

			player.playVideo(1, { startAt: 30 });
			expect(itemCalls).toEqual([{ target: 1, opts: { startAt: 30, autoplay: true } }]);
		});

		it('load(items[]) replaces the queue instead of loading a single item', async () => {
			const player = await buildCompatPlayer();
			player.load([{ id: 'arr-a' }, { id: 'arr-b' }] as unknown as VideoPlaylistItem);
			expect(player.queue()).toHaveLength(2);
		});

		it('setPlaylist(items) replaces the queue', async () => {
			const player = await buildCompatPlayer();
			player.setPlaylist([{ id: 'sp-a' }]);
			expect(player.queue()).toHaveLength(1);
			expect(player.queue()[0]!.id).toBe('sp-a');
		});

		it('setEpisode(season, episode) selects the matching queue index and no-ops on a miss', async () => {
			const player = await buildCompatPlayer();
			player.queue([
				{ id: 's1e1', season: 1, episode: 1 },
				{ id: 's1e2', season: 1, episode: 2 },
				{ id: 's2e1', season: 2, episode: 1 },
			] as VideoPlaylistItem[]);

			const itemCalls: Array<{ target: unknown; opts: unknown }> = [];
			Object.assign(player, {
				item: (target?: unknown, opts?: unknown) => {
					if (target === undefined)
						return undefined;
					itemCalls.push({ target, opts });
				},
			});

			player.setEpisode(1, 2);
			expect(itemCalls).toEqual([{ target: 1, opts: undefined }]);

			player.setEpisode(9, 9);
			expect(itemCalls).toHaveLength(1);
		});

		it('isFirstPlaylistItem / isLastPlaylistItem / hasPlaylists derive from the queue cursor', async () => {
			const player = await buildCompatPlayer();
			player.queue([{ id: 'q-a' }, { id: 'q-b' }] as VideoPlaylistItem[]);

			expect(player.hasPlaylists()).toBe(true);
			expect(player.isFirstPlaylistItem()).toBe(player.index() === 0);
			expect(player.isLastPlaylistItem()).toBe(player.index() === player.queueLength() - 1);
		});

		it('hasPlaylists() is false for a single-item queue', async () => {
			const player = await buildCompatPlayer();
			player.queue([{ id: 'solo' } as VideoPlaylistItem]);
			expect(player.hasPlaylists()).toBe(false);
		});

		it('seasons() groups queue items by season with episode counts', async () => {
			const player = await buildCompatPlayer();
			player.queue([
				{ id: 's1e1', season: 1, episode: 1, seasonName: 'Season One' },
				{ id: 's1e2', season: 1, episode: 2, seasonName: 'Season One' },
				{ id: 's2e1', season: 2, episode: 1, seasonName: 'Season Two' },
				{ id: 'movie' },
			] as VideoPlaylistItem[]);

			expect(player.seasons()).toEqual([
				{ season: 1, episodes: 2, seasonName: 'Season One' },
				{ season: 2, episodes: 1, seasonName: 'Season Two' },
			]);
		});

		it('tracks() reads the current item raw tracks field, filtered by kind', async () => {
			const player = await buildCompatPlayer();
			expect(player.tracks()).toEqual([]);

			player.queue([{
				id: 'wire-1',
				tracks: [
					{ kind: 'subtitles', file: 'https://x/en.vtt', label: 'English', language: 'eng' },
					{ kind: 'thumbnails', file: 'https://x/sprite.vtt' },
					{ kind: 'fonts', file: 'https://x/fonts.json' },
				],
			} as unknown as VideoPlaylistItem]);

			expect(player.tracks()).toHaveLength(3);
			expect(player.tracks('subtitles')).toHaveLength(1);
			expect(player.tracks('subtitles')[0]!.file).toBe('https://x/en.vtt');
			expect(player.tracks('chapters')).toEqual([]);
		});
	});

	// ── legacy wire-format ingestion ────────────────────────────────────────────

	describe('legacy tracks[] ingestion maps to v2 subtitles', () => {
		it('wire tracks [{ kind: subtitles, file }] surface through subtitles()', async () => {
			const player = await buildCompatPlayer();
			player.queue([{
				id: 'wire-subs',
				url: 'https://x/video.mp4',
				tracks: [
					{ kind: 'subtitles', file: 'https://x/en.vtt', label: 'English', language: 'eng' },
					{ kind: 'thumbnails', file: 'https://x/sprite.vtt' },
				],
			} as unknown as VideoPlaylistItem]);

			const subtitleTracks = player.subtitles();
			expect(subtitleTracks).toHaveLength(1);
			expect(subtitleTracks[0]!.url).toBe('https://x/en.vtt');
			expect(subtitleTracks[0]!.kind).toBe('subtitles');
			expect(subtitleTracks[0]!.label).toBe('English');
			expect(subtitleTracks[0]!.language).toBe('eng');
		});

		it('queue ingest derives previewSpriteUrl and fonts from wire tracks', async () => {
			const player = await buildCompatPlayer();
			player.queue([{
				id: 'wire-derived',
				tracks: [
					{ kind: 'thumbnails', file: 'https://x/sprite.vtt' },
					{ kind: 'fonts', file: 'https://x/fonts.json' },
				],
			} as unknown as VideoPlaylistItem]);

			const current = player.item()!;
			expect(current.previewSpriteUrl).toBe('https://x/sprite.vtt');
			expect(current.fonts).toEqual([{ file: 'https://x/fonts.json' }]);
		});

		it('canonical subtitles[] field also surfaces through subtitles()', async () => {
			const player = await buildCompatPlayer();
			player.queue([{
				id: 'typed-subs',
				subtitles: [{ url: 'https://x/nl.vtt', language: 'nl', label: 'Dutch' }],
			} as unknown as VideoPlaylistItem]);

			const subtitleTracks = player.subtitles();
			expect(subtitleTracks).toHaveLength(1);
			expect(subtitleTracks[0]!.url).toBe('https://x/nl.vtt');
			expect(subtitleTracks[0]!.language).toBe('nl');
		});
	});

	// ── utility shims ───────────────────────────────────────────────────────────

	describe('utility shims', () => {
		it('displayMessage(text) emits display-message; a duration adds remove-message later', async () => {
			const player = await buildCompatPlayer();
			const displayed: string[] = [];
			const removed: string[] = [];
			player.on('display-message' as any, (text: any) => { displayed.push(text); });
			player.on('remove-message' as any, (text: any) => { removed.push(text); });

			player.displayMessage('hello');
			expect(displayed).toEqual(['hello']);
			expect(removed).toEqual([]);

			player.displayMessage('bye', 20);
			expect(displayed).toEqual(['hello', 'bye']);
			await new Promise((resolve) => { setTimeout(resolve, 60); });
			expect(removed).toEqual(['bye']);
		});

		it('snakeToCamel and spaceToCamel convert legacy v1 event-name spellings to camelCase', async () => {
			const player = await buildCompatPlayer();
			expect(player.snakeToCamel('play_state_change')).toBe('playStateChange');
			expect(player.snakeToCamel('alreadyCamel')).toBe('alreadyCamel');
			expect(player.spaceToCamel('full screen')).toBe('fullScreen');
			expect(player.spaceToCamel('full-screen')).toBe('fullScreen');
		});

		it('doubleTap fires the callback on two clicks inside the threshold, not on one', async () => {
			const player = await buildCompatPlayer();
			const target = document.createElement('button');
			document.body.appendChild(target);
			const callback = vi.fn();

			player.doubleTap(target, callback, 500);

			target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(callback).not.toHaveBeenCalled();

			target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(callback).toHaveBeenCalledTimes(1);
		});
	});

	// ── translation shims ───────────────────────────────────────────────────────

	describe('translation shims', () => {
		it('addTranslation(key, value) registers for the active language; localize(key) reads it', async () => {
			const player = await buildCompatPlayer();
			player.addTranslation('v1.greeting', 'Hello');
			expect(player.t('v1.greeting')).toBe('Hello');
			expect(player.localize('v1.greeting')).toBe('Hello');
		});

		it('addTranslations accepts the v1 entry-array form', async () => {
			const player = await buildCompatPlayer();
			player.addTranslations([
				{ key: 'v1.first', value: 'First' },
				{ key: 'v1.second', value: 'Second' },
			] as never);
			expect(player.t('v1.first')).toBe('First');
			expect(player.t('v1.second')).toBe('Second');
		});

		it('addTranslations still accepts the v2 bundle form', async () => {
			const player = await buildCompatPlayer();
			const lang = player.language();
			player.addTranslations({ [lang]: { 'v1.bundle': 'Bundled' } });
			expect(player.t('v1.bundle')).toBe('Bundled');
		});

		it('setTitle(title) writes document.title', async () => {
			const player = await buildCompatPlayer();
			player.setTitle('Episode 3');
			expect(document.title).toBe('Episode 3');
		});
	});

	// ── lifecycle shims ─────────────────────────────────────────────────────────

	describe('lifecycle shims', () => {
		it('loadSource(url) delegates to load({ id: url, url })', async () => {
			const player = await buildCompatPlayer();
			let dispatched: VideoPlaylistItem | undefined;
			player.on('beforeLoad' as any, (event: any) => {
				dispatched = event.data.item;
				event.preventDefault();
			});

			await player.loadSource('https://x/movie.mp4');

			expect(dispatched).toEqual({ id: 'https://x/movie.mp4', url: 'https://x/movie.mp4' });
		});

		it('registerPlugin / usePlugin delegate to addPlugin', async () => {
			class ProbeRegisterPlugin extends Plugin<NMVideoPlayer> {
				static override readonly id: string = 'v1-probe-register';
				static override readonly version: string = '1.0.0';
				static override readonly description: string = 'Probe plugin for the registerPlugin shim.';
			}
			class ProbeUsePlugin extends Plugin<NMVideoPlayer> {
				static override readonly id: string = 'v1-probe-use';
				static override readonly version: string = '1.0.0';
				static override readonly description: string = 'Probe plugin for the usePlugin shim.';
			}

			const player = await buildCompatPlayer();

			expect(player.registerPlugin(ProbeRegisterPlugin)).toBe(player);
			expect(player.usePlugin(ProbeUsePlugin)).toBe(player);
			await player.ready();

			expect(player.getPluginById('v1-probe-register')).toBeInstanceOf(ProbeRegisterPlugin);
			expect(player.getPluginById('v1-probe-use')).toBeInstanceOf(ProbeUsePlugin);
		});

		it('plugin(id) delegates to getPluginById', async () => {
			const player = await buildCompatPlayer();
			expect(player.plugin('v1-video-compat')).toBe(player.getPluginById('v1-video-compat'));
			expect(player.plugin('absent')).toBeUndefined();
		});
	});

	// ── event bridges ───────────────────────────────────────────────────────────

	describe('event bridges (v2 → v1 names)', () => {
		it('playbackRate events re-emit as the v1 speed event', async () => {
			const player = await buildCompatPlayer();
			const speedPayloads: unknown[] = [];
			player.on('speed' as any, (data: any) => { speedPayloads.push(data); });

			player.speed(1.25);
			await flush();

			expect(speedPayloads.length).toBeGreaterThan(0);
			expect(speedPayloads[0]).toEqual({ rate: 1.25 });
		});

		it('queue events re-emit as the v1 playlist event', async () => {
			const player = await buildCompatPlayer();
			const playlistPayloads: unknown[] = [];
			player.on('playlist' as any, (items: any) => { playlistPayloads.push(items); });

			player.queue([{ id: 'ev-a' }, { id: 'ev-b' }] as VideoPlaylistItem[]);

			expect(playlistPayloads).toHaveLength(1);
			expect((playlistPayloads[0] as VideoPlaylistItem[]).map(entry => entry.id)).toEqual(['ev-a', 'ev-b']);
		});
	});
});
