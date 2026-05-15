/**
 * Regression test: touch-zones center zone single-tap must call togglePlayback
 * regardless of whether controls are visible.
 *
 * Root cause of mobile playback regression: buildPlayback() guarded the
 * single-tap handler with `if (this.controlsVisible)`, so after the desktop-ui
 * center button was dismissed and controls auto-hid, taps on the center area
 * did nothing. Fix: unconditional call.
 *
 * Also covers:
 *   - Left/right zone single-tap toggles controls (show when hidden, hide when visible).
 *   - Left/right zone double-tap seeks without toggling controls.
 *   - `doubleTapThreshold` option sets the timing window.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NMVideoPlayer } from '../../index';
import { TouchZonesPlugin, touchZonesPlugin } from '../../plugins/touch-zones';

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

    const setup = (opts?: Record<string, unknown>): NMVideoPlayer<any> =>
        new NMVideoPlayer('test').setup({});

    const findZoneBox = (container: Element, colStart: string, colEnd: string): HTMLElement | undefined =>
        Array.from(container.querySelectorAll<HTMLElement>('.nm-touch-box')).find(
            box => box.style.gridColumnStart === colStart && box.style.gridColumnEnd === colEnd,
        );

    // ── Center zone single-tap ────────────────────────────────────────────────

    describe('center zone single-tap', () => {
        it('calls togglePlayback when controlsVisible is false (controls hidden)', async () => {
            const player = setup();
            player.addPlugin(touchZonesPlugin, { doubleClickDelay: 300 });
            await player.ready();

            const toggleSpy = vi.fn().mockResolvedValue(undefined);
            (player as any).togglePlayback = toggleSpy;

            // Ensure controlsVisible stays false — do NOT emit 'activity: { active: true }'.
            // The plugin's default is false, so no setup needed.

            // Find the center touch box. It sits in column 2 of the grid.
            const container = document.getElementById('test')!;
            const centerBox = findZoneBox(container, '2', '3');
            expect(centerBox).toBeDefined();

            // Simulate a single tap: one click, then wait past the doubleTap delay.
            centerBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 350));

            expect(toggleSpy).toHaveBeenCalledTimes(1);
        });

        it('calls togglePlayback when controlsVisible is true (controls visible)', async () => {
            const player = setup();
            player.addPlugin(touchZonesPlugin, { doubleClickDelay: 300 });
            await player.ready();

            const toggleSpy = vi.fn().mockResolvedValue(undefined);
            (player as any).togglePlayback = toggleSpy;

            // Make controls visible via the activity event.
            player.emit('activity' as any, { active: true });

            const container = document.getElementById('test')!;
            const centerBox = findZoneBox(container, '2', '3');
            expect(centerBox).toBeDefined();

            centerBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 350));

            expect(toggleSpy).toHaveBeenCalledTimes(1);
        });

        it('does NOT call togglePlayback on double-tap (toggles fullscreen instead)', async () => {
            const player = setup();
            player.addPlugin(touchZonesPlugin, { doubleClickDelay: 300 });
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
        it('emits activity { active: true } when controls are hidden (left zone)', async () => {
            const player = setup();
            player.addPlugin(touchZonesPlugin, { doubleClickDelay: 300 });
            await player.ready();

            const emitSpy = vi.spyOn(player, 'emit');

            // Controls start hidden (default controlsVisible = false).
            const container = document.getElementById('test')!;
            const leftBox = findZoneBox(container, '1', '2');
            expect(leftBox).toBeDefined();

            leftBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 350));

            const activityCalls = emitSpy.mock.calls.filter(
                call => call[0] === 'activity',
            );
            expect(activityCalls).toHaveLength(1);
            expect((activityCalls[0]![1] as { active: boolean }).active).toBe(true);
        });

        it('emits activity { active: false } when controls are visible (left zone)', async () => {
            const player = setup();
            player.addPlugin(touchZonesPlugin, { doubleClickDelay: 300 });
            await player.ready();

            // Make controls visible.
            player.emit('activity' as any, { active: true });

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

        it('emits activity { active: true } when controls are hidden (right zone)', async () => {
            const player = setup();
            player.addPlugin(touchZonesPlugin, { doubleClickDelay: 300 });
            await player.ready();

            const emitSpy = vi.spyOn(player, 'emit');

            const container = document.getElementById('test')!;
            const rightBox = findZoneBox(container, '3', '4');
            expect(rightBox).toBeDefined();

            rightBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 350));

            const activityCalls = emitSpy.mock.calls.filter(
                call => call[0] === 'activity',
            );
            expect(activityCalls).toHaveLength(1);
            expect((activityCalls[0]![1] as { active: boolean }).active).toBe(true);
        });
    });

    // ── Left/right zone double-tap — seeks, does not touch controls ───────────

    describe('seek zone double-tap', () => {
        it('calls rewind on double-tap of left zone', async () => {
            const player = setup();
            player.addPlugin(touchZonesPlugin, { doubleClickDelay: 300 });
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
            player.addPlugin(touchZonesPlugin, { doubleClickDelay: 300 });
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

        it('treats taps outside doubleTapThreshold as separate single-taps', async () => {
            const player = setup();
            // Very short threshold: 80ms.
            player.addPlugin(touchZonesPlugin, { doubleTapThreshold: 80 });
            await player.ready();

            const rewindSpy = vi.fn().mockResolvedValue(undefined);
            (player as any).rewind = rewindSpy;

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

            // Two activity toggles should have fired (one per single-tap).
            const activityCalls = emitSpy.mock.calls.filter(call => call[0] === 'activity');
            expect(activityCalls).toHaveLength(2);
        });

        it('doubleClickDelay takes precedence over doubleTapThreshold when both are set', async () => {
            const player = setup();
            // doubleClickDelay = 200, doubleTapThreshold = 100.
            // Taps 150ms apart: outside doubleTapThreshold but inside doubleClickDelay.
            // doubleClickDelay wins → taps count as double-tap → seek fires.
            player.addPlugin(touchZonesPlugin, { doubleClickDelay: 200, doubleTapThreshold: 100 });
            await player.ready();

            const rewindSpy = vi.fn().mockResolvedValue(undefined);
            (player as any).rewind = rewindSpy;

            const container = document.getElementById('test')!;
            const leftBox = findZoneBox(container, '1', '2');
            expect(leftBox).toBeDefined();

            leftBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 150));
            leftBox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 250));

            expect(rewindSpy).toHaveBeenCalledTimes(1);
        });
    });
});
