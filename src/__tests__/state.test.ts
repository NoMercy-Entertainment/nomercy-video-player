/**
 * State-enum tests for NMVideoPlayer. Mirrors music + adds video-specific
 * state enums.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NMVideoPlayer } from '../index';
import { PlayState, RepeatState, ShuffleState, VolumeState } from '../types';

describe('NMVideoPlayer — state enums', () => {
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

	const setup = (cfg = {}): NMVideoPlayer => new NMVideoPlayer('test').setup(cfg);

	describe('playState()', () => {
		it('returns IDLE before any transport action', () => {
			expect(setup().playState()).toBe(PlayState.IDLE);
		});

		it('transitions to PLAYING after play()', async () => {
			const p = setup();
			await p.play();
			expect(p.playState()).toBe(PlayState.PLAYING);
		});

		it('transitions to PAUSED after pause()', async () => {
			const p = setup();
			await p.play();
			await p.pause();
			expect(p.playState()).toBe(PlayState.PAUSED);
		});

		it('transitions to STOPPED after stop()', async () => {
			const p = setup();
			await p.play();
			await p.stop();
			expect(p.playState()).toBe(PlayState.STOPPED);
		});
	});

	describe('volumeState() / mute / unmute', () => {
		it('returns UNMUTED initially', () => {
			expect(setup().volumeState()).toBe(VolumeState.UNMUTED);
		});

		it('transitions to MUTED after mute()', () => {
			const p = setup();
			p.mute();
			expect(p.volumeState()).toBe(VolumeState.MUTED);
		});

		it('toggleMute flips state', () => {
			const p = setup();
			p.toggleMute();
			expect(p.volumeState()).toBe(VolumeState.MUTED);
			p.toggleMute();
			expect(p.volumeState()).toBe(VolumeState.UNMUTED);
		});
	});

	describe('repeatState() — overloaded read/write', () => {
		it('returns OFF initially', () => {
			expect(setup().repeatState()).toBe(RepeatState.OFF);
		});

		it('round-trips through the writer', () => {
			const p = setup();
			p.repeatState(RepeatState.ALL);
			expect(p.repeatState()).toBe(RepeatState.ALL);
		});
	});

	describe('shuffleState() — overloaded read/write', () => {
		it('returns OFF initially', () => {
			expect(setup().shuffleState()).toBe(ShuffleState.OFF);
		});

		it('accepts a boolean shorthand', () => {
			const p = setup();
			p.shuffleState(true);
			expect(p.shuffleState()).toBe(ShuffleState.ON);
		});
	});
});
