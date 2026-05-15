/**
 * Locks the video-only toggle methods: theater / fullscreen / pip.
 * Mirrors `transport.test.ts` setup conventions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserPolicyError } from '@nomercy-entertainment/nomercy-player-core';
import type { IPlatform } from '@nomercy-entertainment/nomercy-player-core';
import { FullscreenState, NMVideoPlayer, PipState, TheaterState } from '../index';

interface FakeFsHandles {
	enter: ReturnType<typeof vi.fn>;
	exit: ReturnType<typeof vi.fn>;
	setActive: (a: boolean) => void;
}
interface FakePipHandles extends FakeFsHandles {}

const buildFakePlatform = (
	opts: { fullscreen?: boolean; pip?: boolean } = { fullscreen: true, pip: true },
): { platform: IPlatform; fs: FakeFsHandles; pip: FakePipHandles } => {
	let fsActive = false;
	let pipActive = false;

	const fsEnter = vi.fn(async (_target: HTMLElement) => { fsActive = true; });
	const fsExit = vi.fn(async () => { fsActive = false; });
	const pipEnter = vi.fn(async (_v: HTMLVideoElement) => { pipActive = true; });
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
		fs: {
			enter: fsEnter,
			exit: fsExit,
			setActive: (a) => { fsActive = a; },
		},
		pip: {
			enter: pipEnter,
			exit: pipExit,
			setActive: (a) => { pipActive = a; },
		},
	};
};

describe('NMVideoPlayer — video toggles (theater / fullscreen / pip)', () => {
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

	// ── theater ──

	describe('theater', () => {
		it('theaterState() reads OFF by default', async () => {
			const p = new NMVideoPlayer('test').setup({});
			await p.ready();
			expect(p.theaterState()).toBe(TheaterState.OFF);
		});

		it('theaterState(true) flips on and emits theater { active }', async () => {
			const p = new NMVideoPlayer('test').setup({});
			await p.ready();
			let payload: { active: boolean } | undefined;
			p.on('theater' as any, (data: any) => { payload = data; });

			(p as any).theaterState(true);

			expect(p.theaterState()).toBe(TheaterState.ON);
			expect(payload).toEqual({ active: true });
		});

		it('theaterState(TheaterState.ON) accepts the enum form', async () => {
			const p = new NMVideoPlayer('test').setup({});
			await p.ready();
			(p as any).theaterState(TheaterState.ON);
			expect(p.theaterState()).toBe(TheaterState.ON);
		});

		it('toggleTheater() flips off → on → off and emits theater per call', async () => {
			const p = new NMVideoPlayer('test').setup({});
			await p.ready();
			const events: boolean[] = [];
			p.on('theater' as any, (data: any) => { events.push(data.active); });

			p.toggleTheater();
			expect(p.theaterState()).toBe(TheaterState.ON);
			p.toggleTheater();
			expect(p.theaterState()).toBe(TheaterState.OFF);

			expect(events).toEqual([true, false]);
		});
	});

	// ── fullscreen ──

	describe('fullscreen', () => {
		it('fullscreenState() reads via platform.fullscreen.isActive', async () => {
			const fake = buildFakePlatform();
			const p = new NMVideoPlayer('test').setup({ platform: fake.platform });
			await p.ready();
			expect(p.fullscreenState()).toBe(FullscreenState.OFF);
			fake.fs.setActive(true);
			expect(p.fullscreenState()).toBe(FullscreenState.ON);
		});

		it('without platform.fullscreen → throws BrowserPolicyError when toggled', async () => {
			const fake = buildFakePlatform({ fullscreen: false, pip: true });
			const p = new NMVideoPlayer('test').setup({ platform: fake.platform });
			await p.ready();
			let err: unknown;
			try { (p as any).fullscreenState(true); }
			catch (e) { err = e; }
			expect(err).toBeInstanceOf(BrowserPolicyError);
			expect((err as BrowserPolicyError).code).toBe('core:policy/fullscreenUnsupported');
		});

		it('toggleFullscreen() calls platform.fullscreen.enter / exit and emits fullscreen', async () => {
			const fake = buildFakePlatform();
			const p = new NMVideoPlayer('test').setup({ platform: fake.platform });
			await p.ready();

			const events: boolean[] = [];
			p.on('fullscreen' as any, (data: any) => { events.push(data.active); });

			p.toggleFullscreen(); // OFF → ON
			expect(fake.fs.enter).toHaveBeenCalledTimes(1);
			fake.fs.setActive(true);

			p.toggleFullscreen(); // ON → OFF
			expect(fake.fs.exit).toHaveBeenCalledTimes(1);

			expect(events).toEqual([true, false]);
		});
	});

	// ── pip ──

	describe('pip', () => {
		it('pipState() reads via platform.pip.isActive', async () => {
			const fake = buildFakePlatform();
			const p = new NMVideoPlayer('test').setup({ platform: fake.platform });
			await p.ready();
			expect(p.pipState()).toBe(PipState.OFF);
			fake.pip.setActive(true);
			expect(p.pipState()).toBe(PipState.ON);
		});

		it('without platform.pip → throws when toggled', async () => {
			const fake = buildFakePlatform({ fullscreen: true, pip: false });
			const p = new NMVideoPlayer('test').setup({ platform: fake.platform });
			await p.ready();
			let err: unknown;
			try { (p as any).pipState(true); }
			catch (e) { err = e; }
			expect(err).toBeInstanceOf(BrowserPolicyError);
			expect((err as BrowserPolicyError).code).toBe('core:policy/pipUnsupported');
		});

		it('togglePip() calls platform.pip.enter / exit and emits pip', async () => {
			const fake = buildFakePlatform();
			const p = new NMVideoPlayer('test').setup({ platform: fake.platform });
			await p.ready();

			const events: boolean[] = [];
			p.on('pip' as any, (data: any) => { events.push(data.active); });

			p.togglePip(); // OFF → ON
			expect(fake.pip.enter).toHaveBeenCalledTimes(1);
			fake.pip.setActive(true);

			p.togglePip(); // ON → OFF
			expect(fake.pip.exit).toHaveBeenCalledTimes(1);

			expect(events).toEqual([true, false]);
		});
	});

	// ── aspectRatio ──

	describe('aspectRatio', () => {
		it('reads uniform by default', async () => {
			const p = new NMVideoPlayer('test').setup({});
			await p.ready();
			expect(p.aspectRatio()).toBe('uniform');
		});

		it('setter updates _aspectRatio and emits aspectRatio event', async () => {
			const p = new NMVideoPlayer('test').setup({});
			await p.ready();

			const events: string[] = [];
			p.on('aspectRatio' as any, (data: any) => { events.push(data.value); });

			p.aspectRatio('fill');
			p.aspectRatio('exactfit');
			p.aspectRatio('none');
			p.aspectRatio('uniform');

			expect(p.aspectRatio()).toBe('uniform');
			expect(events).toEqual(['fill', 'exactfit', 'none', 'uniform']);
		});

		it('applies object-fit to the video element when backend exists', async () => {
			const p = new NMVideoPlayer('test').setup({});
			await p.ready();

			p.backend();
			const videoEl = document.querySelector<HTMLVideoElement>('#test video');
			expect(videoEl).not.toBeNull();

			p.aspectRatio('fill');
			expect(videoEl!.style.objectFit).toBe('fill');

			p.aspectRatio('exactfit');
			expect(videoEl!.style.objectFit).toBe('cover');

			p.aspectRatio('none');
			expect(videoEl!.style.objectFit).toBe('none');

			p.aspectRatio('uniform');
			expect(videoEl!.style.objectFit).toBe('contain');
		});

		it('survives aspectRatio() call before backend exists, then applies on backend init', async () => {
			const p = new NMVideoPlayer('test').setup({});
			await p.ready();

			// No backend yet — videoElement is undefined. Call must not throw.
			p.aspectRatio('exactfit');
			expect(p.aspectRatio()).toBe('exactfit');

			// Allocating the backend now must pick up the pre-set value.
			p.backend();
			const videoEl = document.querySelector<HTMLVideoElement>('#test video');
			expect(videoEl).not.toBeNull();
			expect(videoEl!.style.objectFit).toBe('cover');
		});

		it('options.stretching seeds the initial value when no user call preceded backend init', async () => {
			(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
			document.body.innerHTML = '<div id="test2"></div>';
			const p = new NMVideoPlayer('test2').setup({ stretching: 'none' } as any);
			await p.ready();

			p.backend();
			const videoEl = document.querySelector<HTMLVideoElement>('#test2 video');
			expect(videoEl).not.toBeNull();
			expect(videoEl!.style.objectFit).toBe('none');
		});

		it('user aspectRatio() call beats options.stretching when set before backend init', async () => {
			(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
			document.body.innerHTML = '<div id="test3"></div>';
			const p = new NMVideoPlayer('test3').setup({ stretching: 'none' } as any);
			await p.ready();

			p.aspectRatio('fill');

			p.backend();
			const videoEl = document.querySelector<HTMLVideoElement>('#test3 video');
			expect(videoEl).not.toBeNull();
			// User's choice must win over options.stretching.
			expect(videoEl!.style.objectFit).toBe('fill');
		});
	});
});
