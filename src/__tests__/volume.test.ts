/**
 * Volume tests for NMVideoPlayer. Mirrors music.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NMVideoPlayer } from '../index';

describe('NMVideoPlayer — volume', () => {
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

	it('volume() defaults to 100', () => {
		expect(setup().volume()).toBe(100);
	});

	it('volume(v) round-trips and clamps', () => {
		const p = setup();
		p.volume(50);
		expect(p.volume()).toBe(50);
		p.volume(200);
		expect(p.volume()).toBe(100);
		p.volume(-1);
		expect(p.volume()).toBe(0);
	});

	it('mute() then volume() returns 0; unmute() restores', () => {
		const p = setup();
		p.volume(70);
		p.mute();
		expect(p.volume()).toBe(0);
		p.unmute();
		expect(p.volume()).toBe(70);
	});

	it('volumeUp / volumeDown with explicit step', () => {
		const p = setup();
		p.volume(50);
		p.volumeUp(10);
		expect(p.volume()).toBeCloseTo(60);
		p.volumeDown(20);
		expect(p.volume()).toBeCloseTo(40);
	});

	it('emits "volume" with the new level', () => {
		const p = setup();
		let level: number | undefined;
		p.on('volume' as any, (data: any) => { level = data.level; });
		p.volume(30);
		expect(level).toBe(30);
	});
});
