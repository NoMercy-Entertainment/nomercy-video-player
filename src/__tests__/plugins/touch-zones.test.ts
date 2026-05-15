/**
 * Regression test: touch-zones center zone single-tap must call togglePlayback
 * regardless of whether controls are visible.
 *
 * Root cause of mobile playback regression: buildPlayback() guarded the
 * single-tap handler with `if (this.controlsVisible)`, so after the desktop-ui
 * center button was dismissed and controls auto-hid, taps on the center area
 * did nothing. Fix: unconditional call.
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

    const setup = (): NMVideoPlayer<any> => new NMVideoPlayer('test').setup({});

    describe('center zone single-tap', () => {
        it('calls togglePlayback when controlsVisible is false (controls hidden)', async () => {
            const player = setup();
            player.addPlugin(touchZonesPlugin, { doubleClickDelay: 300 });
            await player.ready();

            const toggleSpy = vi.fn().mockResolvedValue(undefined);
            (player as any).togglePlayback = toggleSpy;

            const inst = player.getPlugin(TouchZonesPlugin)!;
            expect(inst).toBeDefined();

            // Ensure controlsVisible stays false — do NOT emit 'activity: { active: true }'.
            // The plugin's default is false, so no setup needed.

            // Find the center touch box. It sits in column 2 of the grid.
            const container = document.getElementById('test')!;
            const boxes = container.querySelectorAll<HTMLElement>('.nm-touch-box');
            // Non-mobile layout: 3 boxes — seek-back (col1), playback (col2), seek-forward (col3).
            // Mobile layout: 5 boxes. Either way, the playback box has
            // gridColumnStart === '2' and gridColumnEnd === '3'.
            const centerBox = Array.from(boxes).find(
                box => box.style.gridColumnStart === '2' && box.style.gridColumnEnd === '3',
            );
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
            const boxes = container.querySelectorAll<HTMLElement>('.nm-touch-box');
            const centerBox = Array.from(boxes).find(
                box => box.style.gridColumnStart === '2' && box.style.gridColumnEnd === '3',
            );
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
            const boxes = container.querySelectorAll<HTMLElement>('.nm-touch-box');
            const centerBox = Array.from(boxes).find(
                box => box.style.gridColumnStart === '2' && box.style.gridColumnEnd === '3',
            );
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
});
