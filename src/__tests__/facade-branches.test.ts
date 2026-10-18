// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Pins NMVideoPlayer facade branches not covered by the per-domain suites:
 * `cycleAspectRatio()`, `videoRect()` pre-metadata, the tracked-state
 * fullscreen/pip read fallback, `_applyDefaultTracks` language matching, and
 * the cancellable `beforeDispose` path keeping the backend alive.
 *
 * Setup conventions mirror `video-toggles.test.ts`.
 */

import type { AudioTrack, IPlatform, SubtitleTrack } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FullscreenState, NMVideoPlayer, PipState } from '../index';

function buildInertPlatform(): IPlatform {
	return {
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
		// Controllers whose isActive() never flips — models headless environments
		// where requestFullscreen / requestPictureInPicture silently reject.
		fullscreen: {
			enter: async () => {},
			exit: async () => {},
			isActive: () => false,
			isSupported: () => true,
			subscribe: () => () => {},
		},
		pip: {
			enter: async () => {},
			exit: async () => {},
			isActive: () => false,
			isSupported: () => true,
			subscribe: () => () => {},
		},
	};
}

const SUBTITLE_TRACK_DEFAULTS = { kind: 'subtitles' as const, default: false };

function subtitleTrack(id: string, language: string | undefined): SubtitleTrack {
	return { id, language, label: id, url: `${id}.vtt`, ...SUBTITLE_TRACK_DEFAULTS };
}

function audioTrack(id: string, language: string | undefined): AudioTrack {
	return { id, language, label: id, default: false };
}

describe('NMVideoPlayer — facade branches', () => {
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

	// ── cycleAspectRatio ────────────────────────────────────────────────────────

	describe('cycleAspectRatio', () => {
		it('cycles uniform → fill → exactfit → none → uniform and emits aspectRatio per step', async () => {
			const player = new NMVideoPlayer('test').setup({});
			await player.ready();

			const events: string[] = [];
			player.on('aspectRatio' as any, (data: any) => { events.push(data.value); });

			expect(player.aspectRatio()).toBe('uniform');
			player.cycleAspectRatio();
			expect(player.aspectRatio()).toBe('fill');
			player.cycleAspectRatio();
			expect(player.aspectRatio()).toBe('exactfit');
			player.cycleAspectRatio();
			expect(player.aspectRatio()).toBe('none');
			player.cycleAspectRatio();
			expect(player.aspectRatio()).toBe('uniform');

			expect(events).toEqual(['fill', 'exactfit', 'none', 'uniform']);
		});

		it('applies the mapped objectFit to the video element on each step', async () => {
			const player = new NMVideoPlayer('test').setup({});
			await player.ready();
			player.backend();

			const videoEl = document.querySelector<HTMLVideoElement>('#test video')!;
			expect(videoEl).not.toBeNull();

			player.cycleAspectRatio();
			expect(videoEl.style.objectFit).toBe('fill');
			player.cycleAspectRatio();
			expect(videoEl.style.objectFit).toBe('cover');
			player.cycleAspectRatio();
			expect(videoEl.style.objectFit).toBe('none');
			player.cycleAspectRatio();
			expect(videoEl.style.objectFit).toBe('contain');
		});

		it('resumes the cycle from a value set via aspectRatio()', async () => {
			const player = new NMVideoPlayer('test').setup({});
			await player.ready();

			player.aspectRatio('exactfit');
			player.cycleAspectRatio();
			expect(player.aspectRatio()).toBe('none');
		});
	});

	// ── videoRect ───────────────────────────────────────────────────────────────

	describe('videoRect', () => {
		it('returns null before a backend exists (no video element)', async () => {
			const player = new NMVideoPlayer('test').setup({});
			await player.ready();
			expect(player.videoRect()).toBeNull();
		});

		it('returns null after backend init while metadata is missing (videoWidth 0)', async () => {
			const player = new NMVideoPlayer('test').setup({});
			await player.ready();
			player.backend();

			expect(player.videoElement).toBeDefined();
			expect(player.videoElement!.videoWidth).toBeFalsy();
			expect(player.videoRect()).toBeNull();
		});
	});

	// ── fullscreen / pip tracked-state read fallback ────────────────────────────

	describe('fullscreen/pip read fallback when the controller never reports active', () => {
		it('fullscreen() reads ON from the tracked state after fullscreen(true)', async () => {
			const player = new NMVideoPlayer('test').setup({ platform: buildInertPlatform() });
			await player.ready();

			expect(player.fullscreen()).toBe(FullscreenState.OFF);
			player.fullscreen(true);
			expect(player.fullscreen()).toBe(FullscreenState.ON);
			player.fullscreen(false);
			expect(player.fullscreen()).toBe(FullscreenState.OFF);
		});

		it('pip() reads ON from the tracked state after pip(true)', async () => {
			const player = new NMVideoPlayer('test').setup({ platform: buildInertPlatform() });
			await player.ready();
			player.backend();

			expect(player.pip()).toBe(PipState.OFF);
			player.pip(true);
			expect(player.pip()).toBe(PipState.ON);
			player.pip(false);
			expect(player.pip()).toBe(PipState.OFF);
		});
	});

	// ── _applyDefaultTracks (mediaReady auto-selection) ─────────────────────────

	interface TrackSelectionProbe {
		player: NMVideoPlayer;
		subtitleSelections: number[];
		audioSelections: number[];
	}

	async function buildTrackProbe(
		config: { defaultSubtitleLanguage?: string; defaultAudioLanguage?: string },
		subtitleLanguages: Array<string | undefined>,
		audioLanguages: Array<string | undefined> = [],
	): Promise<TrackSelectionProbe> {
		const player = new NMVideoPlayer('test').setup(config as never);
		await player.ready();

		const subtitleSelections: number[] = [];
		const audioSelections: number[] = [];
		Object.assign(player, {
			subtitles: () => subtitleLanguages.map((language, idx) => subtitleTrack(`sub-${idx}`, language)),
			subtitle: (idx?: number | null) => {
				if (idx === undefined)
					return null;
				subtitleSelections.push(idx as number);
			},
			audioTracks: () => audioLanguages.map((language, idx) => audioTrack(`aud-${idx}`, language)),
			audioTrack: (idx?: number) => {
				if (idx === undefined)
					return null;
				audioSelections.push(idx);
			},
		});

		return { player, subtitleSelections, audioSelections };
	}

	describe('_applyDefaultTracks — defaultSubtitleLanguage / defaultAudioLanguage', () => {
		it('exact language match selects that subtitle index on mediaReady', async () => {
			const probe = await buildTrackProbe({ defaultSubtitleLanguage: 'nl' }, ['en', 'nl', 'de']);
			probe.player.emit('mediaReady' as any, {} as any);
			expect(probe.subtitleSelections).toEqual([1]);
		});

		it('prefix match: target "en" selects an "en-US" track', async () => {
			const probe = await buildTrackProbe({ defaultSubtitleLanguage: 'en' }, ['nl', 'en-US']);
			probe.player.emit('mediaReady' as any, {} as any);
			expect(probe.subtitleSelections).toEqual([1]);
		});

		it('prefix match works in reverse: target "en-GB" selects an "en" track', async () => {
			const probe = await buildTrackProbe({ defaultSubtitleLanguage: 'en-GB' }, ['de', 'en']);
			probe.player.emit('mediaReady' as any, {} as any);
			expect(probe.subtitleSelections).toEqual([1]);
		});

		it('an exact match beats an earlier prefix match', async () => {
			const probe = await buildTrackProbe({ defaultSubtitleLanguage: 'en' }, ['en-US', 'en']);
			probe.player.emit('mediaReady' as any, {} as any);
			expect(probe.subtitleSelections).toEqual([1]);
		});

		it('matching is case-insensitive', async () => {
			const probe = await buildTrackProbe({ defaultSubtitleLanguage: 'EN' }, ['de', 'en']);
			probe.player.emit('mediaReady' as any, {} as any);
			expect(probe.subtitleSelections).toEqual([1]);
		});

		it('no match leaves the subtitle selection untouched', async () => {
			const probe = await buildTrackProbe({ defaultSubtitleLanguage: 'fr' }, ['en', 'nl']);
			probe.player.emit('mediaReady' as any, {} as any);
			expect(probe.subtitleSelections).toEqual([]);
		});

		it('tracks without a language tag are skipped, later exact match still wins', async () => {
			const probe = await buildTrackProbe({ defaultSubtitleLanguage: 'nl' }, [undefined, 'nl']);
			probe.player.emit('mediaReady' as any, {} as any);
			expect(probe.subtitleSelections).toEqual([1]);
		});

		it('defaultAudioLanguage selects the matching audio track (exact and prefix)', async () => {
			const exact = await buildTrackProbe({ defaultAudioLanguage: 'nl' }, [], ['en', 'nl']);
			exact.player.emit('mediaReady' as any, {} as any);
			expect(exact.audioSelections).toEqual([1]);

			(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
			document.body.innerHTML = '<div id="test"></div>';

			const prefix = await buildTrackProbe({ defaultAudioLanguage: 'en' }, [], ['nl', 'en-US']);
			prefix.player.emit('mediaReady' as any, {} as any);
			expect(prefix.audioSelections).toEqual([1]);
		});

		it('applies defaultAudioLanguage when the backend publishes its audio list after mediaReady', async () => {
			const probe = await buildTrackProbe({ defaultAudioLanguage: 'nl' }, [], ['en', 'nl']);
			const backend = probe.player.backend() as unknown as { emit: (name: string, data: unknown) => void };
			backend.emit('audioTracks', { tracks: [] });
			expect(probe.audioSelections).toEqual([1]);
		});

		it('no configured default languages selects nothing', async () => {
			const probe = await buildTrackProbe({}, ['en'], ['en']);
			probe.player.emit('mediaReady' as any, {} as any);
			expect(probe.subtitleSelections).toEqual([]);
			expect(probe.audioSelections).toEqual([]);
		});
	});

	// ── beforeDispose prevention ────────────────────────────────────────────────

	describe('dispose() prevented via beforeDispose', () => {
		it('preventDefault keeps the backend, video element, and registry entry alive', async () => {
			const player = new NMVideoPlayer('test').setup({});
			await player.ready();
			const backend = player.backend();
			expect(player.videoElement).toBeDefined();

			const preventDispose = (event: any): void => { event.preventDefault(); };
			player.on('beforeDispose' as any, preventDispose);

			await player.dispose();

			expect(player.phase()).not.toBe('disposed');
			expect(player.videoElement).toBeDefined();
			expect(player.backend()).toBe(backend);
			expect(new NMVideoPlayer('test')).toBe(player);

			player.off('beforeDispose' as any, preventDispose);
			await player.dispose();

			expect(player.phase()).toBe('disposed');
			expect(player.videoElement).toBeUndefined();
		});
	});
});
