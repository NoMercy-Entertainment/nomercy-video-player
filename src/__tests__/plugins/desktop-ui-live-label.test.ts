// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/** A live source says LIVE in the time slot, draws the bar over its live window, and has a way back to the live edge. */

import type { IVideoPlayer } from '../../types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Html5VideoBackend } from '../../adapters/video-backend/html5';
import { NMVideoPlayer } from '../../index';
import { DesktopUiPlugin, desktopUiPlugin } from '../../plugins/desktop-ui';
import enBundle from '../../plugins/desktop-ui/i18n/en';

const MockResizeObserver = vi.fn(function (this: unknown) {
	return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
});

class LiveBackend extends Html5VideoBackend {
	liveNow = false;

	override isLive(): boolean {
		return this.liveNow;
	}

	goLive(live: boolean): void {
		this.liveNow = live;
		this.emit('live', { live });
	}
}

function windowOf(start: number, end: number): TimeRanges {
	return { length: 1, start: () => start, end: () => end } as TimeRanges;
}

describe('DesktopUiPlugin — live', () => {
	let player: IVideoPlayer;
	let backend: LiveBackend;

	beforeEach(async () => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
		vi.stubGlobal('ResizeObserver', MockResizeObserver);
		backend = new LiveBackend(document.createElement('div'));
		player = new NMVideoPlayer('test').setup({ backendFactory: () => backend }) as unknown as IVideoPlayer;
		await player.addPlugin(desktopUiPlugin).ready();
		await player.backend('html5');
	});

	afterEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		vi.unstubAllGlobals();
	});

	const timeSlot = (): string => document.querySelector('.remaining-time')?.textContent ?? '';
	const fillWidth = (): string => document.querySelector<HTMLElement>('.slider-progress')?.style.width ?? '';

	it('shows the LIVE label for a live source even when the duration is a finite number', () => {
		backend.goLive(true);
		player.emit('duration', { duration: 6 });

		expect(timeSlot()).toBe(enBundle['plugin.desktop-ui.time.live']);
	});

	it('shows the LIVE label for an Infinity duration, as before', () => {
		player.emit('duration', { duration: Number.POSITIVE_INFINITY });

		expect(timeSlot()).toBe(enBundle['plugin.desktop-ui.time.live']);
	});

	it('keeps the remaining time for a recorded source', () => {
		player.emit('duration', { duration: 125 });

		expect(timeSlot()).toBe('-2:05');
	});

	it('draws the bar over the live window, not over the moving duration', () => {
		vi.spyOn(player, 'seekable').mockReturnValue(windowOf(100, 200));
		backend.goLive(true);
		player.emit('duration', { duration: 6 });

		player.emit('time', { time: 150 } as never);

		expect(fillWidth()).toBe('50%');
	});

	it('puts a viewer at the live edge on the label click', () => {
		vi.spyOn(player, 'seekable').mockReturnValue(windowOf(100, 200));
		const seek = vi.spyOn(player, 'time').mockResolvedValue(undefined as never);
		backend.goLive(true);
		player.emit('duration', { duration: 6 });

		document.querySelector<HTMLElement>('.remaining-time')!.click();

		expect(seek).toHaveBeenCalledWith(200);
	});

	it('maps a scrub position onto the live window', () => {
		vi.spyOn(player, 'seekable').mockReturnValue(windowOf(100, 200));
		backend.goLive(true);
		const bar = document.querySelector<HTMLElement>('.slider-bar')!;
		vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 200 } as DOMRect);
		const plugin = player.getPlugin(DesktopUiPlugin) as unknown as { getScrubTime: (event: Event) => { scrubTimePlayer: number } };

		const scrub = plugin.getScrubTime(new MouseEvent('mousemove', { clientX: 50 }));

		expect(scrub.scrubTimePlayer).toBe(125);
	});

	it('does not toggle remaining/total for a live source', () => {
		vi.spyOn(player, 'seekable').mockReturnValue(windowOf(100, 200));
		vi.spyOn(player, 'time').mockResolvedValue(undefined as never);
		backend.goLive(true);
		player.emit('duration', { duration: 6 });

		document.querySelector<HTMLElement>('.remaining-time')!.click();

		expect(timeSlot()).toBe(enBundle['plugin.desktop-ui.time.live']);
	});

	it('marks the label as behind the edge once the viewer falls back', () => {
		vi.spyOn(player, 'seekable').mockReturnValue(windowOf(100, 200));
		backend.goLive(true);
		player.emit('duration', { duration: 6 });

		player.emit('time', { time: 120 } as never);
		expect(document.querySelector('.remaining-time')!.classList.contains('behind-live')).toBe(true);

		player.emit('time', { time: 199 } as never);
		expect(document.querySelector('.remaining-time')!.classList.contains('behind-live')).toBe(false);
	});

	it('goes back to the remaining time when the source stops being live', () => {
		backend.goLive(true);
		player.emit('duration', { duration: 125 });
		expect(timeSlot()).toBe(enBundle['plugin.desktop-ui.time.live']);

		backend.goLive(false);

		expect(timeSlot()).toBe('-2:05');
	});
});
