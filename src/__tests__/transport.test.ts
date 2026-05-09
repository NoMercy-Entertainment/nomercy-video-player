/**
 * Transport tests for NMVideoPlayer. Mirrors the music player's transport
 * contract — same cancellable-action shape, same BeforeEvent payload, same
 * `<action>Prevented` events. Video adds fullscreen / pip / theater toggles
 * which are tested separately.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlayerError, StateError } from '@nomercy-entertainment/nomercy-player-core';
import { NMVideoPlayer } from '../index';

describe('NMVideoPlayer — transport', () => {
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

	const setup = (): NMVideoPlayer => new NMVideoPlayer('test').setup({});

	describe('play()', () => {
		it('returns a Promise', () => {
			expect(setup().play()).toBeInstanceOf(Promise);
		});

		it('emits beforePlay before play', async () => {
			const p = setup();
			const order: string[] = [];
			p.on('beforePlay' as any, () => order.push('beforePlay'));
			p.on('play' as any, () => order.push('play'));
			await p.play();
			expect(order).toEqual(['beforePlay', 'play']);
		});

		it('listener can mutate data, post-event sees mutated value', async () => {
			const p = setup();
			let received: { source?: string } | undefined;
			p.on('beforePlay' as any, (e: any) => { e.data.source = 'remote'; });
			p.on('play' as any, (data: any) => { received = data; });
			await p.play({ source: 'user' });
			expect(received?.source).toBe('remote');
		});

		it('preventDefault → emits playPrevented, NOT play', async () => {
			const p = setup();
			let playFired = false;
			let preventedReason: string | undefined;
			p.on('beforePlay' as any, (e: any) => { e.preventDefault(); });
			p.on('play' as any, () => { playFired = true; });
			p.on('playPrevented' as any, (data: any) => { preventedReason = data.reason; });
			await p.play();
			expect(playFired).toBe(false);
			expect(preventedReason).toBe('listener-prevented');
		});

		it('stopImmediatePropagation skips later listeners', async () => {
			const p = setup();
			const calls: string[] = [];
			p.on('beforePlay' as any, (e: any) => { calls.push('first'); e.stopImmediatePropagation(); });
			p.on('beforePlay' as any, () => calls.push('second'));
			await p.play();
			expect(calls).toEqual(['first']);
		});

		it('stamps "beforePlay" onto dispatching() while listeners run', async () => {
			const p = setup();
			let observed: ReadonlyArray<string> | undefined;
			p.on('beforePlay' as any, () => { observed = p.dispatching(); });
			await p.play();
			expect(observed).toEqual(['beforePlay']);
			expect(p.dispatching()).toEqual([]);
		});
	});

	describe('pause()', () => {
		it('emits beforePause before pause', async () => {
			const p = setup();
			const order: string[] = [];
			p.on('beforePause' as any, () => order.push('beforePause'));
			p.on('pause' as any, () => order.push('pause'));
			await p.pause();
			expect(order).toEqual(['beforePause', 'pause']);
		});

		it('preventDefault → emits pausePrevented', async () => {
			const p = setup();
			let pauseFired = false;
			let preventedReason: string | undefined;
			p.on('beforePause' as any, (e: any) => { e.preventDefault(); });
			p.on('pause' as any, () => { pauseFired = true; });
			p.on('pausePrevented' as any, (data: any) => { preventedReason = data.reason; });
			await p.pause();
			expect(pauseFired).toBe(false);
			expect(preventedReason).toBe('listener-prevented');
		});
	});

	describe('stop()', () => {
		it('emits beforeStop + stop (cancellable transport pre-event)', async () => {
			const p = setup();
			const order: string[] = [];
			p.on('beforeStop' as any, () => order.push('beforeStop'));
			p.on('stop' as any, () => order.push('stop'));
			await p.stop();
			expect(order).toEqual(['beforeStop', 'stop']);
		});
	});

	describe('togglePlayback()', () => {
		it('plays when paused', async () => {
			const p = setup();
			let played = false;
			p.on('play' as any, () => { played = true; });
			await p.togglePlayback();
			expect(played).toBe(true);
		});

		it('pauses after a successful play', async () => {
			const p = setup();
			await p.togglePlayback();
			let paused = false;
			p.on('pause' as any, () => { paused = true; });
			await p.togglePlayback();
			expect(paused).toBe(true);
		});
	});

	describe('restart()', () => {
		it('emits seek to 0 then play', async () => {
			const p = setup();
			const order: string[] = [];
			p.on('seek' as any, (data: any) => order.push(`seek:${data.time}`));
			p.on('play' as any, () => order.push('play'));
			await p.restart();
			expect(order).toContain('seek:0');
			expect(order[order.length - 1]).toBe('play');
		});
	});

	describe('rewind() / forward()', () => {
		it('rewind emits beforeSeek with negative delta', () => {
			const p = setup();
			let beforeSeekTime: number | undefined;
			p.on('beforeSeek' as any, (e: any) => { beforeSeekTime = e.data.time; });
			p.rewind(5);
			expect(beforeSeekTime).toBe(-5);
		});

		it('forward emits beforeSeek with positive delta', () => {
			const p = setup();
			let beforeSeekTime: number | undefined;
			p.on('beforeSeek' as any, (e: any) => { beforeSeekTime = e.data.time; });
			p.forward(10);
			expect(beforeSeekTime).toBe(10);
		});
	});

	describe('error spec', () => {
		it('rejects with spec-compliant StateError when called before setup()', async () => {
			const p = new NMVideoPlayer('test');
			let err: unknown;
			try { await p.pause(); }
			catch (e) { err = e; }
			expect(err).toBeInstanceOf(PlayerError);
			expect(err).toBeInstanceOf(StateError);
			expect((err as PlayerError).code).toBe('core:player/not-ready');
			expect((err as PlayerError).scope).toEqual({ kind: 'core' });
		});
	});
});
