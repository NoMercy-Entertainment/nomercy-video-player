/**
 * Touch / click zones plugin for the video player.
 *
 * Renders a transparent tap-zone overlay that sits at z-index 10 — above the
 * video element (z-index 0) but below the desktop UI controls overlay (z-index 20).
 * This ordering is intentional: touch zones intercept taps before they reach
 * the video element, but control buttons on the desktop-ui layer remain clickable.
 *
 * Layout: 3-column × 6-row CSS grid.
 *   col 1 (left third)  — seek backward zone
 *   col 2 (centre)      — play/pause + fullscreen zone
 *   col 3 (right third) — seek forward zone
 * On mobile (detected via `ontouchstart` / `maxTouchPoints`) two extra zones are
 * added in col 2, rows 1–2 (volume up) and rows 5–6 (volume down), pushing the
 * play/pause zone to rows 3–5.
 *
 * Single-tap vs double-tap behaviour:
 *   Left / right zones:  single-tap shows/hides controls (toggle); double-tap seeks ±seekSeconds.
 *   Centre zone:         single-tap toggles play/pause; double-tap toggles fullscreen.
 *   Volume zones (mobile only): single-tap shows/hides controls (toggle); double-tap adjusts volume.
 *
 * Integration: emits `player.emit('activity', { active })` to notify the
 * desktop-ui plugin that controls should be shown or hidden. All other calls
 * go through the typed player surface (rewind, forward, togglePlayback, etc.).
 *
 * Seek-feedback indicators
 * ────────────────────────
 * Each seek zone hosts a floating indicator element (z-index 15 — above the
 * zones, below desktop-ui controls at z-index 20). The indicator is lazy-mounted
 * on the first double-tap of that side and remains in the DOM for the plugin's
 * lifetime.
 *
 * Layout: a half-pill pinned to the player edge (left/right), containing an SVG
 * chevron set and a text label showing the accumulated seek seconds for the
 * current burst (e.g. "−30s" after three rapid left-taps).
 *
 * Cumulative-count behaviour:
 *   Each double-tap adds `seekSeconds` to a per-side accumulator and updates the
 *   indicator text. A ~1 s collapse timer resets the accumulator when no further
 *   taps arrive. Rapid successive taps update the same element — no stacking.
 *
 * Animation: CSS transitions on `opacity` and `transform`. The indicator gains an
 * `nm-seek-indicator--visible` class on show, loses it on hide. The transition
 * in/out is handled entirely by CSS (no JS animation frames).
 */

import { Plugin } from '@nomercy-entertainment/nomercy-player-core';
import type { NMVideoPlayer } from '@nomercy-entertainment/nomercy-video-player';

export interface TouchZonesOptions {
    /**
     * Milliseconds between taps that still counts as a double-tap. Default 300.
     * `doubleTapThreshold` is the canonical name; `doubleClickDelay` is kept for
     * backwards compatibility and takes precedence when both are provided.
     */
    doubleTapThreshold?: number;
    /** @deprecated Use `doubleTapThreshold`. */
    doubleClickDelay?: number;
    /** Seconds to seek on double-tap. Default 10. */
    seekSeconds?: number;
    /**
     * When true, single-click/tap on the center zone never toggles playback.
     * Mirrors `disableClickToPause` on DesktopUiPlugin — both plugins ship their
     * own click handlers (desktop-ui on the video element, touch-zones on the
     * overlay zones), so the user needs the same switch on both. Default false.
     */
    disableClickToPause?: boolean;
}

interface ZonePos {
    x: { start: number; end: number };
    y: { start: number; end: number };
}

const STYLE_ID = 'nmplayer-touch-zones-styles';

function ensureStyles(): void {
    if (document.getElementById(STYLE_ID)) return;

    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = `
.nm-touch-zones-root {
    position: absolute; inset: 0; z-index: 10;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    grid-template-rows: repeat(6, 1fr);
    pointer-events: none;
}
.nm-touch-box {
    pointer-events: auto;
    -webkit-tap-highlight-color: transparent;
    position: relative;
}
.nm-seek-indicator {
    position: absolute;
    top: 50%; transform: translateY(-50%) scale(0.85);
    z-index: 15;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 72px; height: 72px;
    background: rgba(0,0,0,0.45);
    color: #fff;
    font-size: 0.78rem;
    font-family: system-ui, sans-serif;
    font-weight: 600;
    pointer-events: none;
    border-radius: 50%;
    opacity: 0;
    transition: opacity 120ms ease-out, transform 120ms ease-out;
    user-select: none;
}
.nm-seek-indicator.nm-seek-indicator--left  { left: 16px; }
.nm-seek-indicator.nm-seek-indicator--right { right: 16px; }
.nm-seek-indicator--visible {
    opacity: 1;
    transform: translateY(-50%) scale(1);
}
.nm-seek-indicator svg {
    width: 20px; height: 20px;
    fill: none;
    stroke: #fff;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
}
`;
    document.head.appendChild(el);
}

interface SeekIndicatorState {
    el: HTMLDivElement;
    textEl: HTMLSpanElement;
    accumulated: number;
    collapseTimer: ReturnType<typeof setTimeout> | null;
    hideTimer: ReturnType<typeof setTimeout> | null;
}

export class TouchZonesPlugin extends Plugin<NMVideoPlayer<any>, TouchZonesOptions> {
    static override readonly id: string = 'touch-zones';
    static override readonly version: string = '2.0.0';
    static override readonly description: string = 'Tap-zone overlay: double-tap to seek, single-tap to toggle playback';

    private root!: HTMLDivElement;
    private controlsVisible = false;
    private _activityDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private _isMobile = false;

    private leftIndicator: SeekIndicatorState | null = null;
    private rightIndicator: SeekIndicatorState | null = null;

    override use(): void {
        ensureStyles();
        this.root = this.mount('root');
        this.player.addClasses(this.root, ['nm-touch-zones-root']);

        // Debounce the controlsVisible flag past the double-tap window so that
        // single-tap from a HIDDEN state doesn't immediately re-hide:
        //   1. touchstart on container -> bumpActivity -> activity:true
        //   2. click on zone -> onSingle reads controlsVisible
        // Without debounce, step 2 sees controlsVisible=true (just emitted) and
        // hides. With debounce, step 2 sees the pre-tap value (false) and
        // correctly does nothing. v1 baseUIPlugin uses the same trick.
        this.on('activity', d => {
            if (this._activityDebounceTimer !== null) {
                clearTimeout(this._activityDebounceTimer);
                this._activityDebounceTimer = null;
            }
            const delay = this.opts?.doubleClickDelay ?? this.opts?.doubleTapThreshold ?? 300;
            this._activityDebounceTimer = setTimeout(() => {
                this.controlsVisible = d.active;
                this._activityDebounceTimer = null;
            }, delay + 10);
        });

        this._isMobile = this.detectMobile();

        if (this._isMobile) {
            this.buildSeekBack(this.root, { x: { start: 1, end: 2 }, y: { start: 2, end: 7 } });
            this.buildPlayback(this.root, { x: { start: 2, end: 3 }, y: { start: 3, end: 6 } });
            this.buildSeekForward(this.root, { x: { start: 3, end: 4 }, y: { start: 2, end: 7 } });
            this.buildVolUp(this.root, { x: { start: 2, end: 3 }, y: { start: 1, end: 3 } });
            this.buildVolDown(this.root, { x: { start: 2, end: 3 }, y: { start: 5, end: 7 } });
        }
        else {
            this.buildSeekBack(this.root, { x: { start: 1, end: 2 }, y: { start: 1, end: 7 } });
            this.buildPlayback(this.root, { x: { start: 2, end: 3 }, y: { start: 1, end: 7 } });
            this.buildSeekForward(this.root, { x: { start: 3, end: 4 }, y: { start: 1, end: 7 } });
        }
    }

    override dispose(): void {
        this.root?.remove();
    }

    private detectMobile(): boolean {
        return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    }

    private makeBox(parent: HTMLElement, pos: ZonePos): HTMLDivElement {
        const el = document.createElement('div');
        el.className = 'nm-touch-box';
        el.style.gridColumnStart = String(pos.x.start);
        el.style.gridColumnEnd = String(pos.x.end);
        el.style.gridRowStart = String(pos.y.start);
        el.style.gridRowEnd = String(pos.y.end);
        parent.appendChild(el);
        return el;
    }

    private doubleTap(
        onDouble: (e: Event) => void,
        onSingle?: (e: Event) => void,
    ): EventListener {
        let lastTap = 0;
        let singleTimer: ReturnType<typeof setTimeout> | null = null;

        return (e: Event): void => {
            const delay = this.opts?.doubleClickDelay ?? this.opts?.doubleTapThreshold ?? 300;
            const now = Date.now();
            const gap = now - lastTap;
            lastTap = now;

            if (gap > 0 && gap < delay) {
                if (singleTimer !== null) {
                    clearTimeout(singleTimer);
                    singleTimer = null;
                }
                e.preventDefault();
                onDouble(e);
            }
            else {
                singleTimer = setTimeout(() => {
                    singleTimer = null;
                    onSingle?.(e);
                }, delay);
            }
        };
    }

    private createSeekIndicator(parent: HTMLElement, side: 'left' | 'right'): SeekIndicatorState {
        const el = document.createElement('div');
        el.className = `nm-seek-indicator nm-seek-indicator--${side}`;

        const svgNs = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNs, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');

        if (side === 'left') {
            const path = document.createElementNS(svgNs, 'path');
            path.setAttribute('d', 'M11 17l-5-5 5-5M18 17l-5-5 5-5');
            svg.appendChild(path);
        }
        else {
            const path = document.createElementNS(svgNs, 'path');
            path.setAttribute('d', 'M13 7l5 5-5 5M6 7l5 5-5 5');
            svg.appendChild(path);
        }

        const textEl = document.createElement('span');
        textEl.textContent = side === 'left' ? '-10s' : '+10s';

        el.appendChild(svg);
        el.appendChild(textEl);
        parent.appendChild(el);

        return {
            el,
            textEl,
            accumulated: 0,
            collapseTimer: null,
            hideTimer: null,
        };
    }

    private showSeekIndicator(state: SeekIndicatorState, seconds: number, direction: 'back' | 'forward'): void {
        if (state.collapseTimer !== null) {
            clearTimeout(state.collapseTimer);
            state.collapseTimer = null;
        }

        if (state.hideTimer !== null) {
            clearTimeout(state.hideTimer);
            state.hideTimer = null;
        }

        // Position the indicator at the VIDEO's vertical centre, not the
        // container's centre. The container may be taller than the video
        // (letterboxing, bottom bar) so a CSS-only 50% sits off-centre on
        // the actual frame.
        const video = (this.player as { videoElement?: HTMLVideoElement }).videoElement;
        const parent = state.el.parentElement;
        if (video && parent) {
            const videoRect = video.getBoundingClientRect();
            const parentRect = parent.getBoundingClientRect();
            const centreY = videoRect.top + videoRect.height / 2 - parentRect.top;
            state.el.style.top = `${centreY}px`;
        }

        state.accumulated += seconds;

        const label = direction === 'back'
            ? `-${state.accumulated}s`
            : `+${state.accumulated}s`;
        state.textEl.textContent = label;

        state.el.classList.add('nm-seek-indicator--visible');

        state.collapseTimer = setTimeout(() => {
            state.accumulated = 0;
            state.collapseTimer = null;

            state.hideTimer = setTimeout(() => {
                state.el.classList.remove('nm-seek-indicator--visible');
                state.hideTimer = null;
            }, 200);
        }, 1000);
    }

    private buildSeekBack(parent: HTMLElement, pos: ZonePos): void {
        const el = this.makeBox(parent, pos);

        // Single-tap onSingle: only HIDE if controls already visible. When
        // controls are inactive the container's touchstart bumpActivity is
        // what wakes them — touch-zones never wake. Double-tap fires regardless
        // of overlay state for direct seek.
        const handler = this.doubleTap(
            () => {
                const seconds = this.opts?.seekSeconds ?? 10;
                void this.player.rewind?.(seconds);

                if (this.leftIndicator === null) {
                    this.leftIndicator = this.createSeekIndicator(el, 'left');
                }

                this.showSeekIndicator(this.leftIndicator, seconds, 'back');
            },
            () => {
                if (this.controlsVisible) {
                    this.player.emit('activity', { active: false });
                }
            },
        );
        this.listen(el, 'click', handler);
    }

    private buildSeekForward(parent: HTMLElement, pos: ZonePos): void {
        const el = this.makeBox(parent, pos);

        const handler = this.doubleTap(
            () => {
                const seconds = this.opts?.seekSeconds ?? 10;
                void this.player.forward?.(seconds);

                if (this.rightIndicator === null) {
                    this.rightIndicator = this.createSeekIndicator(el, 'right');
                }

                this.showSeekIndicator(this.rightIndicator, seconds, 'forward');
            },
            () => {
                if (this.controlsVisible) {
                    this.player.emit('activity', { active: false });
                }
            },
        );
        this.listen(el, 'click', handler);
    }

    private buildPlayback(parent: HTMLElement, pos: ZonePos): void {
        const el = this.makeBox(parent, pos);
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';

        // Center: double-tap toggles fullscreen (works regardless of overlay state).
        // Touch single-tap: togglePlayback only when controls are visible — inactive
        // single-tap does nothing here; the container touchstart wakes the overlay.
        // Mouse single-click: always togglePlayback. Desktop users don't need a
        // wake-up tap before play/pause works.
        const handler = this.doubleTap(
            () => { void this.player.toggleFullscreen?.(); },
            () => {
                if (this.opts?.disableClickToPause) return;
                if (!this._isMobile || this.controlsVisible) {
                    void this.player.togglePlayback?.();
                }
            },
        );
        this.listen(el, 'click', handler);
    }

    private buildVolUp(parent: HTMLElement, pos: ZonePos): void {
        const el = this.makeBox(parent, pos);

        const handler = this.doubleTap(
            () => { this.player.volumeUp?.(); },
            () => {
                if (this.controlsVisible) {
                    this.player.emit('activity', { active: false });
                }
            },
        );
        this.listen(el, 'click', handler);
    }

    private buildVolDown(parent: HTMLElement, pos: ZonePos): void {
        const el = this.makeBox(parent, pos);

        const handler = this.doubleTap(
            () => { this.player.volumeDown?.(); },
            () => {
                if (this.controlsVisible) {
                    this.player.emit('activity', { active: false });
                }
            },
        );
        this.listen(el, 'click', handler);
    }
}

export const touchZonesPlugin = TouchZonesPlugin;
