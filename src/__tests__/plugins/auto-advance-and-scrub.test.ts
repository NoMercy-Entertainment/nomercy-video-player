/**
 * Regression tests for the lifecycle wave sprint (Bug 1 / Bug 2 / Bug 3 / Bug 4):
 *
 * Bug 1 — startFragPrefetch flag is present in HLS.js config.
 * Bug 2 — wireSliderBar wires touchend for scrub-finalization.
 * Bug 3 — touchmove sets sliderPop --visibility to 1 while scrubbing.
 * Bug 4 — AutoAdvancePlugin for video registers and calls next() on ended.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NMVideoPlayer } from '../../index';
import { AutoAdvancePlugin, autoAdvancePlugin } from '../../plugins/auto-advance';


// ── shared setup ──────────────────────────────────────────────────────────────

function resetRegistry(): void {
	(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
}

function mountDiv(id: string): void {
	const div = document.createElement('div');
	div.id = id;
	document.body.appendChild(div);
}

function setup(id: string): NMVideoPlayer<{ id: string; url: string }> {
	return new NMVideoPlayer(id).setup({}) as NMVideoPlayer<{ id: string; url: string }>;
}


// ── Bug 4 — AutoAdvancePlugin ─────────────────────────────────────────────────

describe('AutoAdvancePlugin (video)', () => {
	beforeEach(() => {
		resetRegistry();
		mountDiv('aa-video');
	});
	afterEach(() => {
		resetRegistry();
		document.body.innerHTML = '';
	});

	it('registers without throwing and use() succeeds', async () => {
		const player = setup('aa-video');
		expect(() => player.addPlugin(autoAdvancePlugin)).not.toThrow();
		await player.ready();
		const inst = player.getPlugin(AutoAdvancePlugin);
		expect(inst).toBeDefined();
	});

	it('plugin id is "auto-advance"', () => {
		expect(AutoAdvancePlugin.id).toBe('auto-advance');
	});

	it('calls next() on ended when enabled', async () => {
		const player = setup('aa-video');
		player.addPlugin(autoAdvancePlugin);
		await player.ready();

		const nextSpy = vi.spyOn(player, 'next').mockResolvedValue(undefined);

		player.queue([
			{ id: 'a', url: 'http://example.test/a.mp4' },
			{ id: 'b', url: 'http://example.test/b.mp4' },
		]);

		player.emit('ended', undefined);
		await new Promise(resolve => setTimeout(resolve, 20));

		expect(nextSpy).toHaveBeenCalledOnce();
		expect(nextSpy).toHaveBeenCalledWith({ source: 'auto-advance' });
	});

	it('does NOT call next() on ended when opts.enabled is false', async () => {
		const player = setup('aa-video');
		player.addPlugin(autoAdvancePlugin);
		await player.ready();

		const inst = player.getPlugin(AutoAdvancePlugin)!;
		inst.options({ enabled: false });

		const nextSpy = vi.spyOn(player, 'next').mockResolvedValue(undefined);

		player.queue([
			{ id: 'a', url: 'http://example.test/a.mp4' },
			{ id: 'b', url: 'http://example.test/b.mp4' },
		]);

		player.emit('ended', undefined);
		await new Promise(resolve => setTimeout(resolve, 20));

		expect(nextSpy).not.toHaveBeenCalled();
	});

	it('advance() calls next() directly', async () => {
		const player = setup('aa-video');
		player.addPlugin(autoAdvancePlugin);
		await player.ready();

		const nextSpy = vi.spyOn(player, 'next').mockResolvedValue(undefined);
		const inst = player.getPlugin(AutoAdvancePlugin)!;
		await inst.advance();

		expect(nextSpy).toHaveBeenCalledWith({ source: 'auto-advance' });
	});
});


// ── Bug 1 — HLS.js startFragPrefetch ─────────────────────────────────────────

describe('Html5VideoBackend HLS config', () => {
	it('Html5VideoBackend is importable', async () => {
		const { Html5VideoBackend } = await import('../../adapters/video-backend/html5');
		expect(typeof Html5VideoBackend).toBe('function');
	});

	it('startFragPrefetch:true is present in the HLS constructor call', async () => {
		// The dynamic import path (`import(/* @vite-ignore */ 'hls.js')`) makes
		// vi.doMock unusable here. Instead we verify the source of the backend
		// module directly — the config object must include startFragPrefetch:true.
		// This test is intentionally a static-analysis guard: if someone removes
		// the option, this test breaks immediately rather than at playback time.
		const { readFileSync } = await import('fs');
		const { resolve, dirname } = await import('path');
		const { fileURLToPath } = await import('url');
		const dir = dirname(fileURLToPath(import.meta.url));
		const hlsPath = resolve(dir, '../../adapters/video-backend/html5.ts');
		const src = readFileSync(hlsPath, 'utf8');
		expect(src).toContain('startFragPrefetch: true');
	});
});


// ── Bug 2 + Bug 3 — wireSliderBar touch wiring ───────────────────────────────

describe('wireSliderBar touch handling', () => {
	beforeEach(() => {
		resetRegistry();
		mountDiv('scrub-test');
	});
	afterEach(() => {
		resetRegistry();
		document.body.innerHTML = '';
	});

	it('touch-action: none is set on sliderBar', async () => {
		const { DesktopUiPlugin } = await import('../../plugins/desktop-ui/index');
		const player = setup('scrub-test');
		player.addPlugin(DesktopUiPlugin);
		await player.ready();

		const sliderBar = player.container.querySelector('.slider-bar') as HTMLElement | null;
		expect(sliderBar).not.toBeNull();
		expect(sliderBar!.style.touchAction).toBe('none');
	});

	it('touchend on sliderBar finalizes the scrub (isMouseDown resets)', async () => {
		const { DesktopUiPlugin } = await import('../../plugins/desktop-ui/index');
		const player = setup('scrub-test');
		player.addPlugin(DesktopUiPlugin);
		await player.ready();

		const sliderBar = player.container.querySelector('.slider-bar') as HTMLElement;

		// Simulate touchstart to set isMouseDown.
		sliderBar.dispatchEvent(new Event('touchstart', { bubbles: true }));

		// Confirm scrubbing class was added.
		expect(sliderBar.classList.contains('slider-scrubbing')).toBe(true);

		// Simulate touchend — must finalize the scrub without relying on click.
		sliderBar.dispatchEvent(new Event('touchend', { bubbles: true }));

		// After touchend, the scrubbing class must be removed.
		expect(sliderBar.classList.contains('slider-scrubbing')).toBe(false);
	});

	it('touchmove shows sliderPop while scrubbing', async () => {
		const { DesktopUiPlugin } = await import('../../plugins/desktop-ui/index');
		const player = setup('scrub-test');
		player.addPlugin(DesktopUiPlugin);
		await player.ready();

		const sliderBar = player.container.querySelector('.slider-bar') as HTMLElement;
		const sliderPop = player.container.querySelector('.slider-pop') as HTMLElement;

		// Start scrub.
		sliderBar.dispatchEvent(new Event('touchstart', { bubbles: true }));

		// touchmove must make the pop visible.
		sliderBar.dispatchEvent(new Event('touchmove', { bubbles: true }));

		expect(sliderPop.style.getPropertyValue('--visibility')).toBe('1');
	});
});
