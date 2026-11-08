// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Regression: desktop-ui icon state must reflect divergence from default.
 *
 * Convention: outline icon = current value equals default. Filled icon = current
 * value diverges from default. The `.btn.is-active` class on a button forces the
 * filled (hover) icon path visible via CSS.
 *
 * Buttons covered (STATE-VALUE model — Stoney 2026-06-29):
 *   speed    — default 1.0x; is-active when rate !== 1
 *   audio    — is-active when selected track is not the manifest default track
 *   aspect   — default 'uniform'; is-active when aspect !== 'uniform'
 *   subtitle — is-active when a subtitle track is active (index >= 0)
 *   quality  — is-active when user has pinned a manual quality level (not auto)
 *   pip      — is-active while picture-in-picture is engaged
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NMVideoPlayer } from '../../index';
import { desktopUiPlugin } from '../../plugins/desktop-ui';

type ResizeCallback = (entries: Array<{ contentRect: { width: number } }>) => void;
const MockResizeObserver = vi.fn(function (this: unknown, _cb: ResizeCallback) {
	return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
});

async function makePlayer(): Promise<NMVideoPlayer> {
	const player = new NMVideoPlayer('test').setup({});
	await player.addPlugin(desktopUiPlugin, {
		buttons: {
			speed: true,
			audio: true,
			aspectRatio: true,
			pip: true,
		},
	}).ready();
	return player;
}

describe('DesktopUiPlugin — icon state (is-active divergence)', () => {
	beforeEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const container = document.createElement('div');
		container.id = 'test';
		container.className = 'nomercyplayer';
		document.body.appendChild(container);
		vi.stubGlobal('ResizeObserver', MockResizeObserver);
	});

	afterEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		vi.unstubAllGlobals();
	});

	// ── Speed ─────────────────────────────────────────────────────────────────

	it('speed button has no is-active at default rate (1.0)', async () => {
		const player = await makePlayer();

		Object.assign(player, { playbackRate: () => 1 });
		player.emit('backend:ratechange' as never, {} as never);

		const speedBtn = document.querySelector<HTMLButtonElement>('#speed');
		expect(speedBtn).toBeTruthy();
		expect(speedBtn!.classList.contains('is-active')).toBe(false);
	});

	it('speed button gains is-active when rate diverges from 1.0', async () => {
		const player = await makePlayer();

		Object.assign(player, { playbackRate: () => 1.5 });
		player.emit('backend:ratechange' as never, {} as never);

		const speedBtn = document.querySelector<HTMLButtonElement>('#speed');
		expect(speedBtn).toBeTruthy();
		expect(speedBtn!.classList.contains('is-active')).toBe(true);
	});

	it('speed button loses is-active when rate returns to 1.0', async () => {
		const player = await makePlayer();

		Object.assign(player, { playbackRate: () => 0.75 });
		player.emit('backend:ratechange' as never, {} as never);

		const speedBtn = document.querySelector<HTMLButtonElement>('#speed');
		expect(speedBtn!.classList.contains('is-active')).toBe(true);

		Object.assign(player, { playbackRate: () => 1 });
		player.emit('backend:ratechange' as never, {} as never);

		expect(speedBtn!.classList.contains('is-active')).toBe(false);
	});

	it('speed button aria-label is static base label at default rate (1.0)', async () => {
		const player = await makePlayer();

		Object.assign(player, { playbackRate: () => 1 });
		player.emit('backend:ratechange' as never, {} as never);

		const speedBtn = document.querySelector<HTMLButtonElement>('#speed');
		expect(speedBtn).toBeTruthy();
		// At 1× the label must not include a rate suffix — the static tooltip is enough.
		expect(speedBtn!.getAttribute('aria-label')).not.toMatch(/×/);
	});

	it('speed button aria-label includes current rate when diverged from 1.0', async () => {
		const player = await makePlayer();

		Object.assign(player, { playbackRate: () => 1.5 });
		player.emit('backend:ratechange' as never, {} as never);

		const speedBtn = document.querySelector<HTMLButtonElement>('#speed');
		expect(speedBtn).toBeTruthy();
		// Screen-reader users must be able to read the active rate without opening the menu.
		expect(speedBtn!.getAttribute('aria-label')).toMatch(/1\.5/);
		expect(speedBtn!.getAttribute('aria-label')).toMatch(/×/);
	});

	it('speed button aria-label reverts to static label when rate returns to 1.0', async () => {
		const player = await makePlayer();

		Object.assign(player, { playbackRate: () => 2 });
		player.emit('backend:ratechange' as never, {} as never);

		const speedBtn = document.querySelector<HTMLButtonElement>('#speed');
		expect(speedBtn!.getAttribute('aria-label')).toMatch(/2/);

		Object.assign(player, { playbackRate: () => 1 });
		player.emit('backend:ratechange' as never, {} as never);

		expect(speedBtn!.getAttribute('aria-label')).not.toMatch(/×/);
	});

	// ── Aspect ratio ──────────────────────────────────────────────────────────

	it('aspect-ratio button has no is-active at default (uniform)', async () => {
		const player = await makePlayer();

		Object.assign(player, { aspectRatio: () => 'uniform' });
		player.emit('aspectRatio' as never, {} as never);

		const aspectBtn = document.querySelector<HTMLButtonElement>('#aspect-ratio');
		expect(aspectBtn).toBeTruthy();
		expect(aspectBtn!.classList.contains('is-active')).toBe(false);
	});

	it('aspect-ratio button gains is-active when aspect diverges from uniform', async () => {
		const player = await makePlayer();

		Object.assign(player, { aspectRatio: () => 'fill' });
		player.emit('aspectRatio' as never, {} as never);

		const aspectBtn = document.querySelector<HTMLButtonElement>('#aspect-ratio');
		expect(aspectBtn).toBeTruthy();
		expect(aspectBtn!.classList.contains('is-active')).toBe(true);
	});

	it('aspect-ratio button loses is-active when returning to uniform', async () => {
		const player = await makePlayer();

		Object.assign(player, { aspectRatio: () => 'exactfit' });
		player.emit('aspectRatio' as never, {} as never);

		const aspectBtn = document.querySelector<HTMLButtonElement>('#aspect-ratio');
		expect(aspectBtn!.classList.contains('is-active')).toBe(true);

		Object.assign(player, { aspectRatio: () => 'uniform' });
		player.emit('aspectRatio' as never, {} as never);

		expect(aspectBtn!.classList.contains('is-active')).toBe(false);
	});

	// ── Subtitles icon on/off swap ────────────────────────────────────────────

	it('subtitles button shows the "on" icon when a track is active (index >= 0)', async () => {
		const player = await makePlayer();

		player.emit('subtitle' as never, { track: 0 } as never);

		const subsBtn = document.querySelector<HTMLButtonElement>('[id="subtitles"]');
		expect(subsBtn).not.toBeNull();

		const iconTarget = subsBtn!.querySelector('.btn-icon') ?? subsBtn!;
		// An active button shows the hover glyph (`.is-active` swaps it in), and
		// the active glyph is the filled one: it lacks the "18.75 5.5" inner box
		// contour that the outline carries.
		const activePath = iconTarget.querySelector<SVGPathElement>('path.icon-hover');
		expect(activePath).not.toBeNull();
		expect(activePath!.getAttribute('d')).not.toContain('18.75 5.5');
	});

	it('subtitles button shows the "off" icon when no track is active (-1)', async () => {
		const player = await makePlayer();

		// Activate then deactivate
		player.emit('subtitle' as never, { track: 0 } as never);
		player.emit('subtitle' as never, { track: -1 } as never);

		const subsBtn = document.querySelector<HTMLButtonElement>('[id="subtitles"]');
		expect(subsBtn).not.toBeNull();

		const iconTarget = subsBtn!.querySelector('.btn-icon') ?? subsBtn!;
		const normalPath = iconTarget.querySelector<SVGPathElement>('path.icon-normal');
		expect(normalPath).not.toBeNull();

		// The "off" icon's normal path contains the box rectangle ("18.75 5.5").
		expect(normalPath!.getAttribute('d')).toContain('18.75 5.5');
	});

	it('subtitles button shows the "off" icon when track is null', async () => {
		const player = await makePlayer();

		player.emit('subtitle' as never, { track: null } as never);

		const subsBtn = document.querySelector<HTMLButtonElement>('[id="subtitles"]');
		const iconTarget = subsBtn!.querySelector('.btn-icon') ?? subsBtn!;
		const normalPath = iconTarget.querySelector<SVGPathElement>('path.icon-normal');
		expect(normalPath!.getAttribute('d')).toContain('18.75 5.5');
	});

	it('icon differs between active (track=0) and inactive (track=-1) states', async () => {
		const player = await makePlayer();

		player.emit('subtitle' as never, { track: 0 } as never);
		const subsBtn = document.querySelector<HTMLButtonElement>('[id="subtitles"]');
		const iconTarget = subsBtn!.querySelector('.btn-icon') ?? subsBtn!;
		const shown = (): string | null => iconTarget
			.querySelector<SVGPathElement>(subsBtn!.classList.contains('is-active') ? 'path.icon-hover' : 'path.icon-normal')!
			.getAttribute('d');
		const onPath = shown();

		player.emit('subtitle' as never, { track: -1 } as never);
		const offPath = shown();

		expect(onPath).not.toBe(offPath);
	});

	// ── Audio track ───────────────────────────────────────────────────────────

	it('audio button has no is-active when playing the manifest-default track', async () => {
		const player = await makePlayer();

		const tracks = [
			{ id: 'en', label: 'English', default: true },
			{ id: 'nl', label: 'Dutch', default: false },
		];
		Object.assign(player, { audioTracks: () => tracks });

		const audioBtn = document.querySelector<HTMLButtonElement>('#audio');
		expect(audioBtn).toBeTruthy();

		player.emit('audioTrack' as never, { id: 0 } as never);
		expect(audioBtn!.classList.contains('is-active')).toBe(false);
	});

	it('audio button gains is-active when a non-default track is selected', async () => {
		const player = await makePlayer();

		const tracks = [
			{ id: 'en', label: 'English', default: true },
			{ id: 'nl', label: 'Dutch', default: false },
		];
		Object.assign(player, { audioTracks: () => tracks });

		const audioBtn = document.querySelector<HTMLButtonElement>('#audio');
		expect(audioBtn).toBeTruthy();

		player.emit('audioTrack' as never, { id: 1 } as never);
		expect(audioBtn!.classList.contains('is-active')).toBe(true);
	});

	it('audio button loses is-active when returning to the default track', async () => {
		const player = await makePlayer();

		const tracks = [
			{ id: 'en', label: 'English', default: true },
			{ id: 'nl', label: 'Dutch', default: false },
		];
		Object.assign(player, { audioTracks: () => tracks });

		const audioBtn = document.querySelector<HTMLButtonElement>('#audio');

		player.emit('audioTrack' as never, { id: 1 } as never);
		expect(audioBtn!.classList.contains('is-active')).toBe(true);

		player.emit('audioTrack' as never, { id: 0 } as never);
		expect(audioBtn!.classList.contains('is-active')).toBe(false);
	});

	it('audio button has no is-active when only one track exists', async () => {
		const player = await makePlayer();

		const tracks = [{ id: 'en', label: 'English', default: true }];
		Object.assign(player, { audioTracks: () => tracks });

		const audioBtn = document.querySelector<HTMLButtonElement>('#audio');

		player.emit('audioTrack' as never, { id: 0 } as never);
		expect(audioBtn!.classList.contains('is-active')).toBe(false);
	});

	// ── Subtitles is-active ───────────────────────────────────────────────────

	it('subtitles button has no is-active when no track is active', async () => {
		const player = await makePlayer();

		player.emit('subtitle' as never, { track: -1 } as never);

		const subsBtn = document.querySelector<HTMLButtonElement>('[id="subtitles"]');
		expect(subsBtn).not.toBeNull();
		expect(subsBtn!.classList.contains('is-active')).toBe(false);
	});

	it('subtitles button gains is-active when a track is active', async () => {
		const player = await makePlayer();

		player.emit('subtitle' as never, { track: 0 } as never);

		const subsBtn = document.querySelector<HTMLButtonElement>('[id="subtitles"]');
		expect(subsBtn!.classList.contains('is-active')).toBe(true);
	});

	it('subtitles button loses is-active when track is deactivated', async () => {
		const player = await makePlayer();

		player.emit('subtitle' as never, { track: 0 } as never);
		expect(document.querySelector<HTMLButtonElement>('[id="subtitles"]')!.classList.contains('is-active')).toBe(true);

		player.emit('subtitle' as never, { track: -1 } as never);
		expect(document.querySelector<HTMLButtonElement>('[id="subtitles"]')!.classList.contains('is-active')).toBe(false);
	});

	// ── Quality is-active ─────────────────────────────────────────────────────

	it('quality button has no is-active when quality is auto', async () => {
		const player = await makePlayer();

		player.emit('quality:requested' as never, { level: 'auto' } as never);

		const qualityBtn = document.querySelector<HTMLButtonElement>('#quality');
		expect(qualityBtn).toBeTruthy();
		expect(qualityBtn!.classList.contains('is-active')).toBe(false);
	});

	it('quality button gains is-active when user pins a manual level', async () => {
		const player = await makePlayer();

		player.emit('quality:requested' as never, { level: 2 } as never);

		const qualityBtn = document.querySelector<HTMLButtonElement>('#quality');
		expect(qualityBtn!.classList.contains('is-active')).toBe(true);
	});

	it('quality button loses is-active when user returns to auto', async () => {
		const player = await makePlayer();

		player.emit('quality:requested' as never, { level: 2 } as never);
		expect(document.querySelector<HTMLButtonElement>('#quality')!.classList.contains('is-active')).toBe(true);

		player.emit('quality:requested' as never, { level: 'auto' } as never);
		expect(document.querySelector<HTMLButtonElement>('#quality')!.classList.contains('is-active')).toBe(false);
	});

	// ── PiP is-active ─────────────────────────────────────────────────────────

	it('pip button has no is-active when pip is inactive', async () => {
		const player = await makePlayer();

		Object.defineProperty(document, 'pictureInPictureElement', { value: null, configurable: true });
		player.emit('pip' as never, {} as never);

		const pipBtn = document.querySelector<HTMLButtonElement>('#pip');
		expect(pipBtn).toBeTruthy();
		expect(pipBtn!.classList.contains('is-active')).toBe(false);
	});

	it('pip button gains is-active when pip is engaged', async () => {
		const player = await makePlayer();

		const fakeVideoEl = document.createElement('video');
		Object.defineProperty(document, 'pictureInPictureElement', { value: fakeVideoEl, configurable: true });
		player.emit('pip' as never, {} as never);

		const pipBtn = document.querySelector<HTMLButtonElement>('#pip');
		expect(pipBtn!.classList.contains('is-active')).toBe(true);

		Object.defineProperty(document, 'pictureInPictureElement', { value: null, configurable: true });
	});

	it('pip button loses is-active when pip exits', async () => {
		const player = await makePlayer();

		const fakeVideoEl = document.createElement('video');
		Object.defineProperty(document, 'pictureInPictureElement', { value: fakeVideoEl, configurable: true });
		player.emit('pip' as never, {} as never);
		expect(document.querySelector<HTMLButtonElement>('#pip')!.classList.contains('is-active')).toBe(true);

		Object.defineProperty(document, 'pictureInPictureElement', { value: null, configurable: true });
		player.emit('pip' as never, {} as never);
		expect(document.querySelector<HTMLButtonElement>('#pip')!.classList.contains('is-active')).toBe(false);
	});
});
