// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Touch-zones center zone single-tap must call togglePlayback regardless of
 * whether controls are visible, and regardless of whether the device is
 * touch-capable (the old `_isMobile` guard was the bug).
 *
 * Covered scenarios:
 *   - Cold single-tap (controls hidden) on desktop → togglePlayback called.
 *   - Cold single-tap (controls hidden) on touch-capable device → togglePlayback
 *     called (regression: old code silently no-oped here).
 *   - Single-tap with controls visible → togglePlayback called.
 *   - Double-tap → toggleFullscreen, NOT togglePlayback.
 *   - disableClickToPause:true → single-tap suppressed.
 *   - Left/right zone single-tap toggles controls (show when hidden, hide when visible).
 *   - Left/right zone double-tap seeks without toggling controls.
 *   - `doubleTapThreshold` option sets the timing window.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NMVideoPlayer } from '../../index';
import { touchZonesPlugin } from '../../plugins/touch-zones';

describe('TouchZonesPlugin', () => {
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

	const setup = (_opts?: Record<string, unknown>): NMVideoPlayer<any> =>
		new NMVideoPlayer('test').setup({});

	const findZoneBox = (container: Element, colStart: string, colEnd: string): HTMLElement | undefined =>
		Array.from(container.querySelectorAll<HTMLElement>('.nm-touch-box')).find(
			box => box.style.gridColumnStart === colStart && box.style.gridColumnEnd === colEnd,
		);

	// ── Center zone single-tap ────────────────────────────────────────────────

	describe('center zone single-tap', () => {
		it('on desktop calls togglePlayback even when controls are hidden (mouse single-click is unconditional)', async () => {
			// JSDOM has no ontouchstart and maxTouchPoints=0, so detectMobile() returns false (= desktop).
			const player = setup();
			player.addPlugin(touchZonesPlugin, { doubleTapThreshold: 300 });
			await player.ready();

			const toggleSpy = vi.fn().mockResolvedValue(undefined);
			(player as any).togglePlayback = toggleSpy;

			const container = document.getElementById('test')!;
			const centerBox = findZoneBox(container, '2', '3');
			expect(centerBox).toBeDefined();

			centerBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 350));

			expect(toggleSpy).toHaveBeenCalledTimes(1);
		});

		it('REGRESSION: on touch-capable device (cold tap, controls hidden) calls togglePlayback — was silently no-oping before fix', async () => {
			// Force touch-capable detection by patching maxTouchPoints before plugin init.
			// This is the exact scenario that was broken: _isMobile=true + controlsVisible=false
			// → old guard `!this._isMobile || this.controlsVisible` evaluated to false → skip.
			const originalMax = navigator.maxTouchPoints;
			Object.defineProperty(navigator, 'maxTouchPoints', { value: 1, configurable: true });

			try {
				const player = setup();
				player.addPlugin(touchZonesPlugin, { doubleTapThreshold: 300 });
				await player.ready();

				const toggleSpy = vi.fn().mockResolvedValue(undefined);
				(player as any).togglePlayback = toggleSpy;

				const container = document.getElementById('test')!;
				const centerBox = findZoneBox(container, '2', '3');
				expect(centerBox).toBeDefined();

				// Cold tap — controlsVisible is false, _isMobile is true.
				// The fixed code calls togglePlayback unconditionally.
				centerBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
				await new Promise(resolve => setTimeout(resolve, 350));

				expect(toggleSpy).toHaveBeenCalledTimes(1);
			}
			finally {
				Object.defineProperty(navigator, 'maxTouchPoints', { value: originalMax, configurable: true });
			}
		});

		it('disableClickToPause:true suppresses single-tap togglePlayback', async () => {
			const player = setup();
			player.addPlugin(touchZonesPlugin, { doubleTapThreshold: 300, disableClickToPause: true });
			await player.ready();

			const toggleSpy = vi.fn().mockResolvedValue(undefined);
			(player as any).togglePlayback = toggleSpy;

			const container = document.getElementById('test')!;
			const centerBox = findZoneBox(container, '2', '3');
			expect(centerBox).toBeDefined();

			centerBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 350));

			expect(toggleSpy).not.toHaveBeenCalled();
		});

		it('setup({ disableClickToPause: true }) suppresses single-tap without the plugin option', async () => {
			const player = new NMVideoPlayer('test').setup({ disableClickToPause: true });
			player.addPlugin(touchZonesPlugin, { doubleTapThreshold: 300 });
			await player.ready();

			const toggleSpy = vi.fn().mockResolvedValue(undefined);
			(player as any).togglePlayback = toggleSpy;

			const container = document.getElementById('test')!;
			const centerBox = findZoneBox(container, '2', '3');
			expect(centerBox).toBeDefined();

			centerBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 350));

			expect(toggleSpy).not.toHaveBeenCalled();
		});

		it('disableClickToPause:true does NOT suppress double-tap toggleFullscreen', async () => {
			const player = setup();
			player.addPlugin(touchZonesPlugin, { doubleTapThreshold: 300, disableClickToPause: true });
			await player.ready();

			const toggleSpy = vi.fn().mockResolvedValue(undefined);
			const fullscreenSpy = vi.fn().mockResolvedValue(undefined);
			(player as any).togglePlayback = toggleSpy;
			(player as any).toggleFullscreen = fullscreenSpy;

			const container = document.getElementById('test')!;
			const centerBox = findZoneBox(container, '2', '3');
			expect(centerBox).toBeDefined();

			centerBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 50));
			centerBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 350));

			expect(fullscreenSpy).toHaveBeenCalledTimes(1);
			expect(toggleSpy).not.toHaveBeenCalled();
		});

		it('calls togglePlayback when controlsVisible is true (controls visible)', async () => {
			const player = setup();
			player.addPlugin(touchZonesPlugin, { doubleTapThreshold: 300 });
			await player.ready();

			const toggleSpy = vi.fn().mockResolvedValue(undefined);
			(player as any).togglePlayback = toggleSpy;

			// Make controls visible via the activity event. The plugin debounces
			// its controlsVisible flag by doubleTapThreshold+10ms, so wait past
			// that before clicking — otherwise onSingle reads the pre-tap value.
			player.emit('activity' as any, { active: true });
			await new Promise(resolve => setTimeout(resolve, 320));

			const container = document.getElementById('test')!;
			const centerBox = findZoneBox(container, '2', '3');
			expect(centerBox).toBeDefined();

			centerBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 350));

			expect(toggleSpy).toHaveBeenCalledTimes(1);
		});

		it('does NOT call togglePlayback on double-tap (toggles fullscreen instead)', async () => {
			const player = setup();
			player.addPlugin(touchZonesPlugin, { doubleTapThreshold: 300 });
			await player.ready();

			const toggleSpy = vi.fn().mockResolvedValue(undefined);
			const fullscreenSpy = vi.fn().mockResolvedValue(undefined);
			(player as any).togglePlayback = toggleSpy;
			(player as any).toggleFullscreen = fullscreenSpy;

			const container = document.getElementById('test')!;
			const centerBox = findZoneBox(container, '2', '3');
			expect(centerBox).toBeDefined();

			// Two clicks spaced within the doubleTap window (but gap > 0).
			// doubleTap requires gap > 0 && gap < delay, so we need a real
			// time gap. Schedule the second click 50ms after the first.
			centerBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 50));
			centerBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 350));

			expect(fullscreenSpy).toHaveBeenCalledTimes(1);
			expect(toggleSpy).not.toHaveBeenCalled();
		});
	});

	// ── Left/right zone single-tap — show/hide controls toggle ───────────────

	describe('seek zone single-tap', () => {
		it('does NOT emit activity when controls are hidden (left zone) — container touchstart handles wake', async () => {
			const player = setup();
			player.addPlugin(touchZonesPlugin, { doubleTapThreshold: 300 });
			await player.ready();

			// The player's own activity tracker shows controls at setup
			// (initial bump). Drive them hidden first, and wait past the
			// plugin's controlsVisible debounce so onSingle reads false.
			player.emit('activity' as any, { active: false });
			await new Promise(resolve => setTimeout(resolve, 320));

			const emitSpy = vi.spyOn(player, 'emit');

			const container = document.getElementById('test')!;
			const leftBox = findZoneBox(container, '1', '2');
			expect(leftBox).toBeDefined();

			leftBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 350));

			const activityCalls = emitSpy.mock.calls.filter(
				call => call[0] === 'activity',
			);
			expect(activityCalls).toHaveLength(0);
		});

		it('emits activity { active: false } when controls are visible (left zone)', async () => {
			const player = setup();
			player.addPlugin(touchZonesPlugin, { doubleTapThreshold: 300 });
			await player.ready();

			// Make controls visible. Wait past the controlsVisible debounce
			// (doubleTapThreshold+10ms) before tapping so onSingle reads true.
			player.emit('activity' as any, { active: true });
			await new Promise(resolve => setTimeout(resolve, 320));

			const emitSpy = vi.spyOn(player, 'emit');

			const container = document.getElementById('test')!;
			const leftBox = findZoneBox(container, '1', '2');
			expect(leftBox).toBeDefined();

			leftBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 350));

			const activityCalls = emitSpy.mock.calls.filter(
				call => call[0] === 'activity',
			);
			expect(activityCalls).toHaveLength(1);
			expect((activityCalls[0]![1] as { active: boolean }).active).toBe(false);
		});

		it('does NOT emit activity when controls are hidden (right zone) — container touchstart handles wake', async () => {
			const player = setup();
			player.addPlugin(touchZonesPlugin, { doubleTapThreshold: 300 });
			await player.ready();

			// Same as the left-zone case: hide the controls the player's own
			// tracker surfaced at setup, then wait out the debounce.
			player.emit('activity' as any, { active: false });
			await new Promise(resolve => setTimeout(resolve, 320));

			const emitSpy = vi.spyOn(player, 'emit');

			const container = document.getElementById('test')!;
			const rightBox = findZoneBox(container, '3', '4');
			expect(rightBox).toBeDefined();

			rightBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 350));

			const activityCalls = emitSpy.mock.calls.filter(
				call => call[0] === 'activity',
			);
			expect(activityCalls).toHaveLength(0);
		});
	});

	// ── Left/right zone double-tap — seeks, does not touch controls ───────────

	describe('seek zone double-tap', () => {
		it('calls rewind on double-tap of left zone', async () => {
			const player = setup();
			player.addPlugin(touchZonesPlugin, { doubleTapThreshold: 300 });
			await player.ready();

			const rewindSpy = vi.fn().mockResolvedValue(undefined);
			(player as any).rewind = rewindSpy;

			const container = document.getElementById('test')!;
			const leftBox = findZoneBox(container, '1', '2');
			expect(leftBox).toBeDefined();

			leftBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 50));
			leftBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 350));

			expect(rewindSpy).toHaveBeenCalledTimes(1);
		});

		it('calls forward on double-tap of right zone', async () => {
			const player = setup();
			player.addPlugin(touchZonesPlugin, { doubleTapThreshold: 300 });
			await player.ready();

			const forwardSpy = vi.fn().mockResolvedValue(undefined);
			(player as any).forward = forwardSpy;

			const container = document.getElementById('test')!;
			const rightBox = findZoneBox(container, '3', '4');
			expect(rightBox).toBeDefined();

			rightBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 50));
			rightBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 350));

			expect(forwardSpy).toHaveBeenCalledTimes(1);
		});
	});

	// ── doubleTapThreshold option ─────────────────────────────────────────────

	describe('doubleTapThreshold option', () => {
		it('uses doubleTapThreshold as the timing window', async () => {
			const player = setup();
			// Very short threshold: 100ms.
			player.addPlugin(touchZonesPlugin, { doubleTapThreshold: 100 });
			await player.ready();

			const rewindSpy = vi.fn().mockResolvedValue(undefined);
			(player as any).rewind = rewindSpy;

			const container = document.getElementById('test')!;
			const leftBox = findZoneBox(container, '1', '2');
			expect(leftBox).toBeDefined();

			// Two taps 50ms apart (within 100ms window) → double-tap → seek.
			leftBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 50));
			leftBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 150));

			expect(rewindSpy).toHaveBeenCalledTimes(1);
		});

		it('treats taps outside doubleTapThreshold as separate single-taps (controls visible)', async () => {
			const player = setup();
			// Very short threshold: 80ms.
			player.addPlugin(touchZonesPlugin, { doubleTapThreshold: 80 });
			await player.ready();

			const rewindSpy = vi.fn().mockResolvedValue(undefined);
			(player as any).rewind = rewindSpy;

			// Make controls visible so single-taps fire activity-false (hide).
			player.emit('activity' as any, { active: true });

			const emitSpy = vi.spyOn(player, 'emit');

			const container = document.getElementById('test')!;
			const leftBox = findZoneBox(container, '1', '2');
			expect(leftBox).toBeDefined();

			// Two taps 120ms apart (beyond the 80ms window) → two single-taps.
			leftBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 120));
			leftBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await new Promise(resolve => setTimeout(resolve, 150));

			// No seek should have fired.
			expect(rewindSpy).not.toHaveBeenCalled();

			// First single-tap fires activity:false (hide). Second tap: controls
			// are now hidden, so it fires nothing. Total: 1 activity emission.
			const activityCalls = emitSpy.mock.calls.filter(call => call[0] === 'activity');
			expect(activityCalls).toHaveLength(1);
			expect((activityCalls[0]![1] as { active: boolean }).active).toBe(false);
		});
	});

	// ── Seek-indicator accumulation on rapid double-taps ──────────────────────
	//
	// The doubleTap closure uses Date.now() for gap detection. With fake timers
	// we must advance system time (vi.setSystemTime) so Date.now() moves, AND
	// advance the event-loop timers (vi.advanceTimersByTime) so the singleTimer
	// / collapseTimer callbacks fire at the right moments.

	describe('seek indicator accumulation', () => {
		// The doubleTap closure uses Date.now() for gap detection. We set up
		// the player with real timers, then switch to fake timers for the
		// timing-sensitive assertions, driving both Date.now() (vi.setSystemTime)
		// and the event-loop (vi.advanceTimersByTime) in lockstep.

		it('rapid double-taps accumulate seek amount in the indicator before the collapse timer fires', async () => {
			// Set up player with real timers.
			const player = setup();
			player.addPlugin(touchZonesPlugin, { doubleTapThreshold: 300, seekSeconds: 10 });
			await player.ready();

			const rewindSpy = vi.fn().mockResolvedValue(undefined);
			(player as any).rewind = rewindSpy;

			const container = document.getElementById('test')!;
			const leftBox = findZoneBox(container, '1', '2');
			expect(leftBox).toBeDefined();

			// Switch to fake timers after setup so await player.ready() ran normally.
			vi.useFakeTimers();
			const t0 = Date.now();

			// First double-tap: two clicks 50 ms apart → gap < 300 ms → onDouble fires.
			vi.setSystemTime(t0);
			leftBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			vi.setSystemTime(t0 + 50);
			leftBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			// Advance event loop to flush any singleTimers that might have been set.
			vi.advanceTimersByTime(50);

			// Second double-tap: first click must be >= 300 ms from lastTap (t0+50)
			// so the gap test fails and a singleTimer is queued. Second click 50ms
			// later → gap 50 < 300 → onDouble fires again.
			vi.setSystemTime(t0 + 400);
			leftBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			vi.setSystemTime(t0 + 450);
			leftBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			// Advance event loop, but stay well under the 1000 ms collapse timer.
			vi.advanceTimersByTime(50);

			expect(rewindSpy).toHaveBeenCalledTimes(2);

			// Both seeks accumulated: -20s (two × 10s).
			const indicator = container.querySelector<HTMLElement>('.nm-seek-indicator--left, .nm-seek-indicator');
			expect(indicator).not.toBeNull();
			const textEl = indicator!.querySelector('span');
			expect(textEl).not.toBeNull();
			expect(textEl!.textContent).toBe('-20s');

			vi.useRealTimers();
		});

		it('indicator resets to per-tap amount after the 1000 ms collapse timer fires', async () => {
			const player = setup();
			player.addPlugin(touchZonesPlugin, { doubleTapThreshold: 300, seekSeconds: 10 });
			await player.ready();

			const rewindSpy = vi.fn().mockResolvedValue(undefined);
			(player as any).rewind = rewindSpy;

			const container = document.getElementById('test')!;
			const leftBox = findZoneBox(container, '1', '2');
			expect(leftBox).toBeDefined();

			vi.useFakeTimers();
			const t0 = Date.now();

			// First double-tap.
			vi.setSystemTime(t0);
			leftBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			vi.setSystemTime(t0 + 50);
			leftBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			vi.advanceTimersByTime(50);

			// Advance PAST the 1000 ms collapse timer — accumulated resets to 0.
			vi.setSystemTime(t0 + 1200);
			vi.advanceTimersByTime(1150);

			// Second double-tap after reset.
			vi.setSystemTime(t0 + 1250);
			leftBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			vi.setSystemTime(t0 + 1300);
			leftBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			vi.advanceTimersByTime(50);

			// Indicator must show only the fresh 10s, not the accumulated 20s.
			const indicator = container.querySelector<HTMLElement>('.nm-seek-indicator--left, .nm-seek-indicator');
			const textEl = indicator!.querySelector('span');
			expect(textEl!.textContent).toBe('-10s');

			vi.useRealTimers();
		});

		it('rapid double-taps on the right zone accumulate forward seek amount', async () => {
			const player = setup();
			player.addPlugin(touchZonesPlugin, { doubleTapThreshold: 300, seekSeconds: 10 });
			await player.ready();

			const forwardSpy = vi.fn().mockResolvedValue(undefined);
			(player as any).forward = forwardSpy;

			const container = document.getElementById('test')!;
			const rightBox = findZoneBox(container, '3', '4');
			expect(rightBox).toBeDefined();

			vi.useFakeTimers();
			const t0 = Date.now();

			// First double-tap.
			vi.setSystemTime(t0);
			rightBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			vi.setSystemTime(t0 + 50);
			rightBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			vi.advanceTimersByTime(50);

			// Second double-tap before the collapse timer.
			vi.setSystemTime(t0 + 400);
			rightBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			vi.setSystemTime(t0 + 450);
			rightBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			vi.advanceTimersByTime(50);

			expect(forwardSpy).toHaveBeenCalledTimes(2);

			const indicator = container.querySelector<HTMLElement>('.nm-seek-indicator--right, .nm-seek-indicator');
			expect(indicator).not.toBeNull();
			const textEl = indicator!.querySelector('span');
			expect(textEl!.textContent).toBe('+20s');

			vi.useRealTimers();
		});
	});
});
