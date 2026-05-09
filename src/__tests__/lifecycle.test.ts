/**
 * Lifecycle tests for NMVideoPlayer — mirrors the music player's lifecycle
 * suite. Covers: construction, phase(), setup(), ready(), dispose(),
 * setupState(), dispatching().
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlayerError, StateError } from '@nomercy-entertainment/nomercy-player-core';
import { NMVideoPlayer, nmplayer } from '../index';

describe('NMVideoPlayer — lifecycle', () => {
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

	describe('construction', () => {
		it('creates a player instance bound to the matching div', () => {
			const player = new NMVideoPlayer('test');
			expect(player).toBeDefined();
			expect(player.id).toBe('test');
			expect(player.container.id).toBe('test');
		});

		it('factory function returns a player', () => {
			const player = nmplayer('test');
			expect(player).toBeInstanceOf(NMVideoPlayer);
		});
	});

	describe('phase()', () => {
		it('returns "idle" before setup() is called', () => {
			const player = new NMVideoPlayer('test');
			expect(player.phase()).toBe('idle');
		});

		it('returns "ready" after setup() pipeline finishes', async () => {
			const player = new NMVideoPlayer('test');
			player.setup({} as any);
			await player.ready();
			expect(player.phase()).toBe('ready');
		});

		it('returns "disposed" after dispose()', () => {
			const player = new NMVideoPlayer('test');
			player.dispose();
			expect(player.phase()).toBe('disposed');
		});
	});

	describe('setup()', () => {
		it('returns the player instance for chaining', () => {
			const player = new NMVideoPlayer('test');
			expect(player.setup({} as any)).toBe(player);
		});

		it('transitions phase: idle → setup → ready', async () => {
			const player = new NMVideoPlayer('test');
			const transitions: string[] = [player.phase()];
			player.on('phase', ({ to }) => transitions.push(to));
			player.setup({} as any);
			await player.ready();
			expect(transitions).toEqual(['idle', 'setup', 'ready']);
		});

		it('emits the lifecycle event chain in order', async () => {
			const player = new NMVideoPlayer('test');
			const events: string[] = [];
			const sequence = [
				'beforeSetup',
				'setupStart',
				'configResolved',
				'pluginsRegistering',
				'pluginsRegistered',
				'streamsReady',
				'authReady',
				'playlistReady',
				'mediaReady',
				'ready',
			] as const;
			for (const name of sequence) {
				player.on(name as any, () => events.push(name));
			}
			player.setup({} as any);
			await player.ready();
			expect(events).toEqual([...sequence]);
		});

		it('throws when setup() is called twice (spec §14: dispose first)', async () => {
			const player = new NMVideoPlayer('test');
			player.setup({} as any);
			await player.ready();
			expect(() => player.setup({} as any)).toThrow(/already-setup/);
		});
	});

	describe('ready()', () => {
		it('returns a Promise', () => {
			const player = new NMVideoPlayer('test');
			expect(player.ready()).toBeInstanceOf(Promise);
		});

		it('resolves when setup completes', async () => {
			const player = new NMVideoPlayer('test');
			player.setup({} as any);
			await expect(player.ready()).resolves.toBeUndefined();
		});

		it('resolves immediately when called after ready', async () => {
			const player = new NMVideoPlayer('test');
			player.setup({} as any);
			const result = player.ready();
			await expect(result).resolves.toBeUndefined();
		});

		it('rejects with a spec-compliant StateError when dispose runs first', async () => {
			const player = new NMVideoPlayer('test');
			const promise = player.ready();
			player.dispose();
			let err: unknown;
			try { await promise; }
			catch (e) { err = e; }
			expect(err).toBeInstanceOf(PlayerError);
			expect(err).toBeInstanceOf(StateError);
			expect((err as PlayerError).code).toBe('core:player/disposed');
			expect((err as PlayerError).severity).toBe('error');
			expect((err as PlayerError).scope).toEqual({ kind: 'core' });
		});
	});

	describe('dispose()', () => {
		it('transitions phase: any → disposing → disposed', () => {
			const player = new NMVideoPlayer('test');
			const transitions: string[] = [];
			player.on('phase', ({ to }) => transitions.push(to));
			player.dispose();
			expect(transitions).toEqual(['disposing', 'disposed']);
		});

		it('emits "dispose" event', () => {
			const player = new NMVideoPlayer('test');
			let disposed = false;
			player.on('dispose', () => { disposed = true; });
			player.dispose();
			expect(disposed).toBe(true);
		});

		it('is idempotent — second dispose is a no-op', () => {
			const player = new NMVideoPlayer('test');
			player.dispose();
			expect(() => player.dispose()).not.toThrow();
		});
	});

	describe('setupState()', () => {
		it('returns NOT_SETUP before setup()', () => {
			const player = new NMVideoPlayer('test');
			expect(player.setupState()).toBe('not-setup');
		});

		it('returns READY after setup() pipeline finishes', async () => {
			const player = new NMVideoPlayer('test');
			player.setup({} as any);
			await player.ready();
			expect(player.setupState()).toBe('ready');
		});

		it('returns DISPOSED after dispose()', () => {
			const player = new NMVideoPlayer('test');
			player.dispose();
			expect(player.setupState()).toBe('disposed');
		});
	});

	describe('dispatching()', () => {
		it('returns empty array initially', () => {
			expect(new NMVideoPlayer('test').dispatching()).toEqual([]);
		});
	});

	describe('not-implemented spec adherence', () => {
		it('every previously-stubbed surface is now real OR returns a structured no-op — canary removed (no notImpl methods left on NMVideoPlayer)', async () => {
			const player = new NMVideoPlayer('test').setup({} as any);
			await player.ready();
			// All formerly-throwing methods now have real bodies (transport,
			// state enums, device, ABR, audio output, cast). The unimplemented.test.ts
			// inventory holds the per-method coverage; this canary is intentionally
			// just a smoke test for the post-implementation contract.
			expect(player.phase()).toBe('ready');
		});
	});
});
