/**
 * Tests for the DesktopUiPlugin progressive breakpoint system.
 *
 * Covers:
 *   - Resizing through 4 breakpoints fires `layout:breakpoint` with correct from/to/visibleButtons/hiddenButtons
 *   - Consumer-provided `breakpoints` overrides defaults
 *   - `collapseStages` shorthand generates correct breakpoints
 *   - `buttonPriority` reordering changes which buttons hide first
 *   - Backwards compat: consumer with only `buttonPriority` still works
 *   - `data-breakpoint` attribute is set on the container
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NMVideoPlayer } from '../../index';
import { DesktopUiPlugin, desktopUiPlugin } from '../../plugins/desktop-ui';
import type { Breakpoint, LayoutBreakpointPayload } from '../../plugins/desktop-ui';

// ── ResizeObserver stub ───────────────────────────────────────────────────────

type ResizeCallback = (entries: Array<{ contentRect: { width: number } }>) => void;

let _observedCallback: ResizeCallback | null = null;

function simulateWidth(width: number): void {
    _observedCallback?.([{ contentRect: { width } }]);
}

const MockResizeObserver = vi.fn(function (this: unknown, callback: ResizeCallback) {
    _observedCallback = callback;
    return {
        observe: vi.fn(),
        disconnect: vi.fn(),
        unobserve: vi.fn(),
    };
});

// ── Test setup ────────────────────────────────────────────────────────────────

describe('DesktopUiPlugin — progressive breakpoint system', () => {
    beforeEach(() => {
        _observedCallback = null;

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
    });

    const setup = (opts?: Record<string, unknown>): NMVideoPlayer => {
        const player = new NMVideoPlayer('test').setup({});
        player.addPlugin(desktopUiPlugin, opts);
        return player;
    };

    /** Subscribe to layout:breakpoint events via the auto-namespaced player channel. */
    const onBreakpoint = (
        player: NMVideoPlayer,
        fn: (data: LayoutBreakpointPayload) => void,
    ): void => {
        player.on('plugin:desktop-ui:layout:breakpoint' as never, fn as never);
    };

    // ── Breakpoint transition events ──────────────────────────────────────────

    describe('breakpoint transition events', () => {
        it('fires layout:breakpoint 4 times when resizing through all tiers', async () => {
            const player = setup();
            await player.ready();

            const events: Array<{ from: string; to: string }> = [];

            onBreakpoint(player, (data) => {
                events.push({ from: data.from, to: data.to });
            });

            // Initial state is 'xl'. Step down through lg → md → sm → xs.
            simulateWidth(1200);    // xl — same as initial, no event
            simulateWidth(800);     // lg
            simulateWidth(600);     // md
            simulateWidth(400);     // sm
            simulateWidth(300);     // xs

            expect(events).toHaveLength(4);
            expect(events[0]).toEqual({ from: 'xl', to: 'lg' });
            expect(events[1]).toEqual({ from: 'lg', to: 'md' });
            expect(events[2]).toEqual({ from: 'md', to: 'sm' });
            expect(events[3]).toEqual({ from: 'sm', to: 'xs' });
        });

        it('includes visibleButtons and hiddenButtons in the sm event', async () => {
            const player = setup();
            await player.ready();

            const events: Array<LayoutBreakpointPayload> = [];
            onBreakpoint(player, (data) => events.push(data));

            simulateWidth(400);    // sm (≤ 480, hideAfterRank: 2)

            const smEvent = events.find(e => e.to === 'sm');
            expect(smEvent).toBeDefined();

            // Default priority: play(rank 0) mute(1) volume(2) fullscreen(3) settings(4) …
            // At sm, hideAfterRank: 2 → ranks 0,1,2 survive.
            // volume has no DOM button (null in buttonMap) — skipped entirely.
            // Visible: play, mute.  Hidden: fullscreen, settings, and beyond.
            expect(smEvent!.visibleButtons).toContain('play');
            expect(smEvent!.visibleButtons).toContain('mute');
            expect(smEvent!.hiddenButtons).toContain('fullscreen');
            expect(smEvent!.hiddenButtons).toContain('settings');
        });

        it('does NOT emit when the same breakpoint fires twice consecutively', async () => {
            const player = setup();
            await player.ready();

            const events: Array<{ from: string; to: string }> = [];
            onBreakpoint(player, (data) => events.push({ from: data.from, to: data.to }));

            simulateWidth(400);    // sm
            simulateWidth(450);    // still sm

            expect(events).toHaveLength(1);
            expect(events[0]!.to).toBe('sm');
        });
    });

    // ── Consumer-provided breakpoints override defaults ───────────────────────

    describe('consumer breakpoints option', () => {
        it('uses consumer-provided breakpoints instead of defaults', async () => {
            const customBreakpoints: Breakpoint[] = [
                { name: 'tiny', maxWidth: 300, hideAfterRank: 0 },
                { name: 'full', maxWidth: Infinity, hideAfterRank: Infinity },
            ];

            const player = setup({ breakpoints: customBreakpoints });
            await player.ready();

            const events: Array<{ from: string; to: string }> = [];
            onBreakpoint(player, (data) => events.push({ from: data.from, to: data.to }));

            // xl is the initial name. The first ResizeObserver fire at 400px
            // picks 'full' (> 300). This transitions from xl → full.
            simulateWidth(400);    // full
            simulateWidth(200);    // tiny

            expect(events.length).toBeGreaterThanOrEqual(1);
            const tinyTransition = events.find(e => e.to === 'tiny');
            expect(tinyTransition).toBeDefined();
        });

        it('sets data-breakpoint attribute on container after resize', async () => {
            const player = setup();
            await player.ready();

            simulateWidth(400);    // sm

            const container = document.getElementById('test');
            expect(container?.getAttribute('data-breakpoint')).toBe('sm');
        });
    });

    // ── collapseStages shorthand ──────────────────────────────────────────────

    describe('collapseStages shorthand', () => {
        it('generates correct hideAfterRank tiers from collapseStages', async () => {
            const player = setup({ collapseStages: [1, 3, 5] });
            await player.ready();

            const events: Array<LayoutBreakpointPayload> = [];
            onBreakpoint(player, (data) => events.push(data));

            // sm tier has hideAfterRank: 1 — only ranks 0 and 1 survive.
            simulateWidth(400);

            const smEvent = events.find(e => e.to === 'sm');
            expect(smEvent).toBeDefined();

            // play is rank 0, mute is rank 1 — both survive.
            // fullscreen is rank 3 — hidden at sm with stages[0]=1.
            expect(smEvent!.visibleButtons).toContain('play');
            expect(smEvent!.hiddenButtons).toContain('fullscreen');
        });
    });

    // ── buttonPriority reordering ─────────────────────────────────────────────

    describe('buttonPriority reordering', () => {
        it('hides the last-priority button first when container narrows', async () => {
            const player = setup({
                buttonPriority: [
                    // fullscreen is now the most important (rank 0)
                    'fullscreen', 'play', 'settings', 'mute', 'seekBack',
                    'seekForward', 'next', 'previous', 'chapterPrev', 'chapterNext',
                    'theater', 'pip', 'speed', 'quality', 'subtitles', 'audio',
                    'aspectRatio', 'playlist', 'volume',
                ],
            });
            await player.ready();

            const events: Array<LayoutBreakpointPayload> = [];
            onBreakpoint(player, (data) => events.push(data));

            simulateWidth(400);    // sm (hideAfterRank: 2)

            const smEvent = events.find(e => e.to === 'sm');
            expect(smEvent).toBeDefined();

            // With custom priority, fullscreen(0) play(1) settings(2) survive at sm.
            expect(smEvent!.visibleButtons).toContain('fullscreen');
            expect(smEvent!.visibleButtons).toContain('play');
            expect(smEvent!.visibleButtons).toContain('settings');

            // mute is now rank 3 — it is hidden at sm.
            expect(smEvent!.hiddenButtons).toContain('mute');
        });
    });

    // ── Backwards compatibility ───────────────────────────────────────────────

    describe('backwards compatibility', () => {
        it('consumer with only buttonPriority does not throw', () => {
            expect(() =>
                setup({
                    buttonPriority: [
                        'play', 'fullscreen', 'mute', 'settings', 'next', 'previous',
                        'seekBack', 'seekForward', 'chapterPrev', 'chapterNext',
                        'theater', 'pip', 'speed', 'quality', 'subtitles', 'audio',
                        'aspectRatio', 'playlist', 'volume',
                    ],
                }),
            ).not.toThrow();
        });

        it('zero-config consumer: no layout:breakpoint event before any resize fires', async () => {
            const player = setup();
            await player.ready();

            const events: Array<unknown> = [];
            onBreakpoint(player, (data) => events.push(data));

            expect(events).toHaveLength(0);
        });

        it('getPlugin(DesktopUiPlugin) returns the plugin instance', async () => {
            const player = setup();
            await player.ready();

            const inst = player.getPlugin(DesktopUiPlugin);
            expect(inst).toBeInstanceOf(DesktopUiPlugin);
        });
    });
});
