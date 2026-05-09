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

	it('volume() defaults to 1.0', () => {
		expect(setup().volume()).toBe(1);
	});

	it('volume(v) round-trips and clamps', () => {
		const p = setup();
		p.volume(0.5);
		expect(p.volume()).toBe(0.5);
		p.volume(2);
		expect(p.volume()).toBe(1);
		p.volume(-1);
		expect(p.volume()).toBe(0);
	});

	it('mute() then volume() returns 0; unmute() restores', () => {
		const p = setup();
		p.volume(0.7);
		p.mute();
		expect(p.volume()).toBe(0);
		p.unmute();
		expect(p.volume()).toBe(0.7);
	});

	it('volumeUp / volumeDown with explicit step', () => {
		const p = setup();
		p.volume(0.5);
		p.volumeUp(0.1);
		expect(p.volume()).toBeCloseTo(0.6);
		p.volumeDown(0.2);
		expect(p.volume()).toBeCloseTo(0.4);
	});

	it('emits "volume" with the new level', () => {
		const p = setup();
		let level: number | undefined;
		p.on('volume' as any, (data: any) => { level = data.level; });
		p.volume(0.3);
		expect(level).toBe(0.3);
	});
});
