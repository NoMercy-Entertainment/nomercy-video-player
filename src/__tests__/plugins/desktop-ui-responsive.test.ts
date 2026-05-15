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

            simulateWidth(400);    // sm (≤ 480 px)

            const smEvent = events.find(e => e.to === 'sm');
            expect(smEvent).toBeDefined();

            // Fit-based algorithm at 400px:
            // Available = 400 - 148 (chrome reserve) = 252px.
            // Default priority: play → mute → volume(null, skip) → fullscreen → settings → next…
            // play(40) + mute-with-slider(136) + fullscreen(40) = 216 ≤ 252 → visible.
            // settings(40) → 256 > 252 → hidden.
            // next and beyond are hidden (still don't fit after settings is dropped).
            expect(smEvent!.visibleButtons).toContain('play');
            expect(smEvent!.visibleButtons).toContain('mute');
            expect(smEvent!.visibleButtons).toContain('fullscreen');
            expect(smEvent!.hiddenButtons).toContain('settings');
            expect(smEvent!.hiddenButtons).toContain('next');
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
        it('fires layout:breakpoint with the sm tier name from collapseStages at 400px', async () => {
            const player = setup({ collapseStages: [1, 3, 5] });
            await player.ready();

            const events: Array<LayoutBreakpointPayload> = [];
            onBreakpoint(player, (data) => events.push(data));

            // 400px container — sm tier fires (collapseStages feeds the breakpoint event name).
            // The fit algorithm determines actual button visibility, not the rank threshold.
            // Available width = 400 - 148 (chrome) = 252px.
            // play(40) + mute-with-slider-reservation(136) + fullscreen(40) = 216 ≤ 252 → visible.
            // settings(40) = 256 > 252 → hidden.
            simulateWidth(400);

            const smEvent = events.find(e => e.to === 'sm');
            expect(smEvent).toBeDefined();

            // play and mute survive the fit pass.
            expect(smEvent!.visibleButtons).toContain('play');
            expect(smEvent!.visibleButtons).toContain('mute');
            // settings is the first button that exceeds available width.
            expect(smEvent!.hiddenButtons).toContain('settings');
        });
    });

    // ── buttonPriority reordering ─────────────────────────────────────────────

    describe('buttonPriority reordering', () => {
        it('most-important buttons survive the fit pass when container is narrow', async () => {
            const player = setup({
                // seekBack/seekForward are opt-in; enable them so priority ordering
                // can be demonstrated against them.
                buttons: { seekBack: true, seekForward: true },
                buttonPriority: [
                    // fullscreen first — most important.
                    'fullscreen', 'play', 'settings', 'mute', 'seekBack',
                    'seekForward', 'next', 'previous', 'chapterPrev', 'chapterNext',
                    'theater', 'pip', 'speed', 'quality', 'subtitles', 'audio',
                    'aspectRatio', 'playlist', 'volume',
                ],
            });
            await player.ready();

            const events: Array<LayoutBreakpointPayload> = [];
            onBreakpoint(player, (data) => events.push(data));

            // 400px: available = 252px.
            // fullscreen(40) + play(40) + settings(40) = 120 ≤ 252 → visible.
            // mute with slider-reservation (136px footprint) → 256 > 252 → hidden.
            // seekBack: accumulated is still 120, 120+40=160 ≤ 252 → visible.
            // seekForward: 160+40=200 ≤ 252 → visible.
            // The fit algorithm continues after a skipped button so smaller
            // buttons that fit can still show — unlike the old rank cutoff.
            simulateWidth(400);

            const smEvent = events.find(e => e.to === 'sm');
            expect(smEvent).toBeDefined();

            // High-priority buttons are visible.
            expect(smEvent!.visibleButtons).toContain('fullscreen');
            expect(smEvent!.visibleButtons).toContain('play');
            expect(smEvent!.visibleButtons).toContain('settings');

            // mute's slider reservation pushes it past the available width.
            expect(smEvent!.hiddenButtons).toContain('mute');

            // seekBack and seekForward ARE visible: they're only 40px and fit
            // in the space freed by skipping mute.
            expect(smEvent!.visibleButtons).toContain('seekBack');
            expect(smEvent!.visibleButtons).toContain('seekForward');
        });
    });

    // ── Chapter button defaults + content gating ──────────────────────────────

    describe('chapter button defaults', () => {
        it('seekBack and seekForward default to hidden (not in DEFAULT_ON_BUTTONS)', async () => {
            // Zero-config setup — seekBack/seekForward should be hidden by default.
            const player = setup();
            await player.ready();

            const container = document.getElementById('test')!;
            const seekBackBtn = container.querySelector<HTMLButtonElement>('#seek-back');
            const seekFwdBtn  = container.querySelector<HTMLButtonElement>('#seek-forward');

            // Both should be hidden (hidden attribute present) by default.
            expect(seekBackBtn?.hidden).toBe(true);
            expect(seekFwdBtn?.hidden).toBe(true);
        });

        it('consumer opts seekBack back in via buttons option', async () => {
            const player = setup({ buttons: { seekBack: true } });
            await player.ready();

            // With seekBack explicitly enabled, the DOM node should be created without
            // hidden=true from the initial buildBottomRow pass.
            const container = document.getElementById('test')!;
            const seekBackBtn = container.querySelector<HTMLButtonElement>('#seek-back');
            expect(seekBackBtn?.hidden).toBe(false);
        });

        it('chapterPrev and chapterNext are content-gated hidden when no chapters', async () => {
            // No chapters loaded → content gating should mark them hidden.
            const player = setup();
            await player.ready();

            const container = document.getElementById('test')!;
            const chapBackBtn = container.querySelector<HTMLButtonElement>('#chapter-back');
            const chapFwdBtn  = container.querySelector<HTMLButtonElement>('#chapter-forward');

            // Content gating hides these when chapters() returns [].
            expect(chapBackBtn?.hidden).toBe(true);
            expect(chapFwdBtn?.hidden).toBe(true);
            // The data-content-hidden attribute signals content gating (not opt-out).
            expect(chapBackBtn?.getAttribute('data-content-hidden')).toBe('true');
            expect(chapFwdBtn?.getAttribute('data-content-hidden')).toBe('true');
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
