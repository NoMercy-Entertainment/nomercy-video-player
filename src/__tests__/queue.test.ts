/**
 * Queue tests for NMVideoPlayer. Mirrors the music player queue contract —
 * same delegation to MediaList<T>, same re-emit contract.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NMVideoPlayer } from '../index';
import type { VideoPlaylistItem } from '../types';

const item = (id: string): VideoPlaylistItem => ({ id, title: `episode ${id}` } as VideoPlaylistItem);

describe('NMVideoPlayer — queue', () => {
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

	describe('initial state', () => {
		it('queue() empty initially', () => {
			expect(setup().queue()).toEqual([]);
		});

		it('queueLength() is 0 initially', () => {
			expect(setup().queueLength()).toBe(0);
		});

		it('current()/currentIndex() reflect empty queue', () => {
			const p = setup();
			expect(p.current()).toBeUndefined();
			expect(p.currentIndex()).toBe(-1);
		});
	});

	describe('mutations + re-emit', () => {
		it('queue([items]) replaces and emits queue', () => {
			const p = setup();
			let emitted: ReadonlyArray<VideoPlaylistItem> | undefined;
			p.on('queue' as any, (items: any) => { emitted = items; });
			p.queue([item('a'), item('b')]);
			expect(p.queue().length).toBe(2);
			expect(emitted?.length).toBe(2);
		});

		it('queueAppend emits queue:append', () => {
			const p = setup();
			let payload: { from: number } | undefined;
			p.on('queue:append' as any, (data: any) => { payload = data; });
			p.queue([item('a')]);
			p.queueAppend(item('b'));
			expect(payload?.from).toBe(1);
		});

		it('queueRemove emits queue:remove with id', () => {
			const p = setup();
			let removedId: string | undefined;
			p.on('queue:remove' as any, (data: any) => { removedId = data.id; });
			p.queue([item('a'), item('b')]);
			p.queueRemove('a');
			expect(removedId).toBe('a');
		});

		it('queueClear emits queue:clear with previousLength', () => {
			const p = setup();
			let cleared: { previousLength: number } | undefined;
			p.on('queue:clear' as any, (data: any) => { cleared = data; });
			p.queue([item('a'), item('b'), item('c')]);
			p.queueClear();
			expect(cleared?.previousLength).toBe(3);
			expect(p.queue()).toEqual([]);
		});
	});

	describe('cursor', () => {
		it('current moves the cursor and emits "current"', () => {
			const p = setup();
			p.queue([item('a'), item('b'), item('c')]);
			let payload: { index: number } | undefined;
			p.on('current' as any, (data: any) => { payload = data; });
			p.current('c');
			expect(p.current()?.id).toBe('c');
			expect(payload?.index).toBe(2);
		});
	});
});
