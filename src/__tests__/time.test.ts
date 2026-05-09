/**
 * Time / position tests for NMVideoPlayer. Mirrors music.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NMVideoPlayer } from '../index';

describe('NMVideoPlayer — time', () => {
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

	it('currentTime() returns 0 initially', () => {
		expect(setup().currentTime()).toBe(0);
	});

	it('currentTime(t) emits beforeSeek then seek', async () => {
		const p = setup();
		const order: string[] = [];
		p.on('beforeSeek' as any, () => order.push('beforeSeek'));
		p.on('seek' as any, () => order.push('seek'));
		await (p.currentTime(10) as Promise<void>);
		expect(order).toEqual(['beforeSeek', 'seek']);
		expect(p.currentTime()).toBe(10);
	});

	it('preventDefault on beforeSeek leaves the value unchanged + emits seekPrevented', async () => {
		const p = setup();
		await (p.currentTime(5) as Promise<void>);
		let preventedReason: string | undefined;
		p.on('beforeSeek' as any, (e: any) => { e.preventDefault(); });
		p.on('seekPrevented' as any, (data: any) => { preventedReason = data.reason; });
		await (p.currentTime(99) as Promise<void>);
		expect(p.currentTime()).toBe(5);
		expect(preventedReason).toBe('listener-prevented');
	});

	it('clamps negative values to 0', () => {
		const p = setup();
		p.currentTime(-5);
		expect(p.currentTime()).toBe(0);
	});

	it('playbackRate() round-trips and emits backend:ratechange', () => {
		const p = setup();
		expect(p.playbackRate()).toBe(1);
		let rate: number | undefined;
		p.on('backend:ratechange' as any, (data: any) => { rate = data.rate; });
		p.playbackRate(1.5);
		expect(p.playbackRate()).toBe(1.5);
		expect(rate).toBe(1.5);
	});

	it('playbackRates() returns the standard set', () => {
		const rates = setup().playbackRates();
		expect(rates).toContain(1);
		expect(Array.isArray(rates)).toBe(true);
	});

	it('timeData() exposes the aggregated TimeState shape', async () => {
		const p = setup();
		await (p.currentTime(3) as Promise<void>);
		const data = p.timeData();
		expect(data.position).toBe(3);
		expect(data.duration).toBe(0);
		expect(data.buffered).toBe(0);
	});
});
