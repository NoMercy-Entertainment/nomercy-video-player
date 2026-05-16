/**
 * Regression tests for desktop-ui auto-hide bugs:
 *
 * Bug 1 — Controls must hide after 4 s even when a button has focus.
 *   Root cause: `focusin` was calling `bumpActivity()`, re-arming the
 *   inactivity timer on every focus arrival (including from a click/touch).
 *   Secondary cause: `mouseenter` on the bottom bar set `_isControlsHovered`
 *   via synthesised mouse events from touch, which were never matched by a
 *   real `mouseleave`, locking `_isControlsHovered = true` permanently.
 *   Fix: drop `focusin → bumpActivity`; switch hover guard to
 *   `pointerenter / pointerleave` filtered to `pointerType === 'mouse'`.
 *
 * Bug 2 — Transition gap shows the old video frame, not the next poster.
 *   Root cause: `_applyPoster()` was only called from the `'current'` event,
 *   which fires AFTER `backend.load()` resolves (after metadata + first frame).
 *   The `<video>` element had no poster attribute set during the blank window
 *   when the old source is removed and the new source starts loading.
 *   Fix: listen to `'beforeLoad'` and apply the incoming item's poster to the
 *   element BEFORE `backend.load()` is invoked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NMVideoPlayer } from '../../index';
import { DesktopUiPlugin, desktopUiPlugin } from '../../plugins/desktop-ui';

// ── Shared setup ─────────────────────────────────────────────────────────────

type ResizeCallback = (entries: Array<{ contentRect: { width: number } }>) => void;
const MockResizeObserver = vi.fn(function (this: unknown, _cb: ResizeCallback) {
    return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
});

const makePlayer = (): NMVideoPlayer => {
    const player = new NMVideoPlayer('test').setup({});
    player.addPlugin(desktopUiPlugin, { inactivityMs: 4000 });
    return player;
};

/** Stub playState so maybeHide() sees 'playing' and doesn't bail early. */
const fakePlayingState = (player: NMVideoPlayer): void => {
    Object.assign(player as object, { playState: () => 'playing' });
};

describe('DesktopUiPlugin — auto-hide (Bug 1)', () => {
    beforeEach(() => {
        (NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
        const div = document.createElement('div');
        div.id = 'test';
        div.className = 'nomercyplayer';
        document.body.appendChild(div);
        (globalThis as unknown as Record<string, unknown>).ResizeObserver = MockResizeObserver;
    });

    afterEach(() => {
        (NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
        document.body.innerHTML = '';
        delete (globalThis as unknown as Record<string, unknown>).ResizeObserver;
        vi.useRealTimers();
    });

    it('emits activity:false after 4 s even when a button has focus (no focusin re-arm)', async () => {
        vi.useFakeTimers();

        const player = makePlayer();
        await player.ready();
        fakePlayingState(player);

        const activityEvents: Array<{ active: boolean }> = [];
        player.on('activity' as never, ((data: { active: boolean }) => {
            activityEvents.push(data);
        }) as never);

        const container = document.getElementById('test')!;

        // Simulate a click on a button inside the container — this is what
        // a tap/click on a control does. pointerdown arms the timer.
        container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

        // Simulate focus arriving on a button (as happens after a click).
        const bottomBar = container.querySelector<HTMLElement>('.nm-bottom-bar');
        if (bottomBar) {
            bottomBar.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        }
        else {
            container.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        }

        // Clear the activity events recorded so far (the bumpActivity ones).
        activityEvents.length = 0;

        // Advance past the inactivity window. Controls must hide.
        vi.advanceTimersByTime(4100);

        const hiddenEvent = activityEvents.find(ev => !ev.active);
        expect(hiddenEvent).toBeDefined();
    });

    it('does not lock _isControlsHovered when a touch event synthesises mouseenter on the bottom bar', async () => {
        vi.useFakeTimers();

        const player = makePlayer();
        await player.ready();
        fakePlayingState(player);

        const activityEvents: Array<{ active: boolean }> = [];
        player.on('activity' as never, ((data: { active: boolean }) => {
            activityEvents.push(data);
        }) as never);

        const container = document.getElementById('test')!;
        const bottomBar = container.querySelector<HTMLElement>('.nm-bottom-bar');

        // Simulate a synthesised mouseenter on the bottom bar (as mobile browsers
        // emit after a touch). Previously this set _isControlsHovered = true with
        // no matching mouseleave, permanently blocking maybeHide().
        if (bottomBar) {
            bottomBar.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
        }

        // Arm the inactivity timer via a touchstart (simulates a tap).
        container.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
        activityEvents.length = 0;

        // After 4 s the controls must still hide — mouseenter alone must not block.
        vi.advanceTimersByTime(4100);

        const hiddenEvent = activityEvents.find(ev => !ev.active);
        expect(hiddenEvent).toBeDefined();
    });

    it('keeps controls visible when real mouse pointer is inside the bottom bar', async () => {
        vi.useFakeTimers();

        const player = makePlayer();
        await player.ready();
        fakePlayingState(player);

        const activityEvents: Array<{ active: boolean }> = [];
        player.on('activity' as never, ((data: { active: boolean }) => {
            activityEvents.push(data);
        }) as never);

        const container = document.getElementById('test')!;

        // The bottom bar has class 'bottom-bar' (no nm- prefix).
        const bottomBar = container.querySelector<HTMLElement>('.bottom-bar');
        expect(bottomBar).not.toBeNull();

        // Fire a real-mouse pointerenter. In happy-dom, pointerenter does not
        // bubble so it must be dispatched directly on the element.
        bottomBar!.dispatchEvent(
            new PointerEvent('pointerenter', { bubbles: false, pointerType: 'mouse' }),
        );

        // Arm the inactivity timer via a mousemove.
        container.dispatchEvent(
            new MouseEvent('mousemove', { bubbles: true, clientX: 10, clientY: 10 }),
        );
        activityEvents.length = 0;

        // Advance timer — controls must NOT hide (mouse pointer is over bottom bar).
        vi.advanceTimersByTime(4100);

        const hiddenEvent = activityEvents.find(ev => !ev.active);
        expect(hiddenEvent).toBeUndefined();
    });
});

// ── Bug 2 — poster applied before source swap ─────────────────────────────────

interface TestItem {
    id: string;
    url: string;
    image?: string;
}

describe('NMVideoPlayer — poster before source swap (Bug 2)', () => {
    beforeEach(() => {
        (NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
        document.body.innerHTML = '<div id="poster-swap-test"></div>';
    });

    afterEach(() => {
        (NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
        document.body.innerHTML = '';
    });

    it('sets video.poster from the incoming item when beforeLoad fires (before backend.load)', () => {
        const items: TestItem[] = [
            { id: 'ep1', url: '/ep1.m3u8', image: 'https://cdn/ep1-poster.jpg' },
            { id: 'ep2', url: '/ep2.m3u8', image: 'https://cdn/ep2-poster.jpg' },
        ];

        const player = new NMVideoPlayer<TestItem>('poster-swap-test').setup({ playlist: items });

        // Force backend allocation so the <video> element exists.
        player.backend();

        const videoEl = document.querySelector<HTMLVideoElement>('#poster-swap-test video');
        expect(videoEl).not.toBeNull();

        // Move cursor to ep1 — this is the currently-playing item.
        player.queue(items);
        player.current('ep1');
        expect(videoEl!.getAttribute('poster')).toBe('https://cdn/ep1-poster.jpg');

        // Capture poster value at beforeLoad time — should already reflect ep2.
        let posterAtBeforeLoad: string | null = null;
        player.on('beforeLoad' as never, (() => {
            posterAtBeforeLoad = videoEl!.getAttribute('poster');
        }) as never);

        // Manually trigger beforeLoad by calling load() with ep2.
        // load() is async and requires a real backend, so we use the
        // _dispatchBefore path directly via emitting the event.
        // Simulate what load(ep2) does: emit beforeLoad with ep2 as item.
        const ep2Item = items[1]!;
        (player as unknown as {
            _dispatchBefore: (name: string, data: unknown) => Promise<unknown>;
        })._dispatchBefore?.('beforeLoad', { item: ep2Item });

        // After the synthetic beforeLoad, the poster must already be ep2's.
        expect(posterAtBeforeLoad).toBe('https://cdn/ep2-poster.jpg');
    });

    it('clears poster when the incoming item has no image field', () => {
        const items: TestItem[] = [
            { id: 'ep1', url: '/ep1.m3u8', image: 'https://cdn/ep1-poster.jpg' },
            { id: 'ep-no-img', url: '/ep-no-img.m3u8' },
        ];

        const player = new NMVideoPlayer<TestItem>('poster-swap-test').setup({ playlist: items });
        player.backend();

        const videoEl = document.querySelector<HTMLVideoElement>('#poster-swap-test video')!;

        player.queue(items);
        player.current('ep1');
        expect(videoEl.getAttribute('poster')).toBe('https://cdn/ep1-poster.jpg');

        let posterAtBeforeLoad: string | null = 'NOT_SET';
        player.on('beforeLoad' as never, (() => {
            posterAtBeforeLoad = videoEl.getAttribute('poster');
        }) as never);

        const noImgItem = items[1]!;
        (player as unknown as {
            _dispatchBefore: (name: string, data: unknown) => Promise<unknown>;
        })._dispatchBefore?.('beforeLoad', { item: noImgItem });

        // Poster should have been cleared before the source swap.
        expect(posterAtBeforeLoad).toBeNull();
    });

    it('applies the new poster on the beforeLoad event emitted by the player', () => {
        const items: TestItem[] = [
            { id: 'a', url: '/a.m3u8', image: 'https://cdn/a.jpg' },
            { id: 'b', url: '/b.m3u8', image: 'https://cdn/b.jpg' },
        ];

        const player = new NMVideoPlayer<TestItem>('poster-swap-test').setup({ playlist: items });
        player.backend();

        const videoEl = document.querySelector<HTMLVideoElement>('#poster-swap-test video')!;

        player.queue(items);
        player.current('a');

        // The beforeLoad listener (added in the NMVideoPlayer constructor) must
        // update the poster before any handler we attach here.
        const posterSnapshots: string[] = [];
        player.on('beforeLoad' as never, (() => {
            const val = videoEl.getAttribute('poster');
            if (val) posterSnapshots.push(val);
        }) as never);

        // Emit a synthetic beforeLoad for item b.
        const bItem = items[1]!;
        (player as unknown as {
            _dispatchBefore: (name: string, data: unknown) => Promise<unknown>;
        })._dispatchBefore?.('beforeLoad', { item: bItem });

        // Our handler fires after the constructor's handler, so by the time
        // our snapshot runs the poster is already set to b's image.
        expect(posterSnapshots).toContain('https://cdn/b.jpg');
    });

    it('poster from beforeLoad uses imageBasePath resolution', async () => {
        // Relative URLs go through the async resolveUrl path so imageBasePath
        // applies correctly. The poster value is not available synchronously
        // inside the beforeLoad callback for relative URLs — check it after
        // awaiting the microtask queue to drain.
        const items: TestItem[] = [
            { id: 'a', url: '/a.m3u8', image: '/w780/a.jpg' },
            { id: 'b', url: '/b.m3u8', image: '/w780/b.jpg' },
        ];

        const player = new NMVideoPlayer<TestItem>('poster-swap-test').setup({
            imageBasePath: 'https://img.cdn/t/p',
            playlist: items,
        });
        player.backend();

        const videoEl = document.querySelector<HTMLVideoElement>('#poster-swap-test video')!;

        player.queue(items);
        player.current('a');
        await new Promise<void>(resolve => setTimeout(resolve, 0));

        const bItem = items[1]!;
        (player as unknown as {
            _dispatchBefore: (name: string, data: unknown) => Promise<unknown>;
        })._dispatchBefore?.('beforeLoad', { item: bItem });

        // Await the microtask so resolveUrl('poster').then() settles.
        await new Promise<void>(resolve => setTimeout(resolve, 0));

        expect(videoEl.getAttribute('poster')).toBe('https://img.cdn/t/p/w780/b.jpg');
    });
});
