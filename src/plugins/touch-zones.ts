/**
 * Touch / click zones plugin.
 * z-index: 10 — sits above the video element (z-0) but below the desktop UI overlay (z-20).
 */

import { Plugin } from '@nomercy-entertainment/nomercy-player-core';
import type { NMVideoPlayer } from '@nomercy-entertainment/nomercy-video-player';

export interface TouchZonesOptions {
    /** Milliseconds between taps that still counts as a double-tap. Default 300. */
    doubleClickDelay?: number;
    /** Seconds to seek on double-tap. Default 10. */
    seekSeconds?: number;
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
}
.nm-touch-ripple {
    position: absolute; top: 0; bottom: 0;
    width: 66%; display: none;
    align-items: center; justify-content: center;
    flex-direction: column; gap: 4px;
    background: rgba(255,255,255,0.08);
    color: #fff; font-size: 0.82rem; font-family: system-ui, sans-serif;
    pointer-events: none; border-radius: 0 50% 50% 0;
}
.nm-touch-ripple.right { border-radius: 50% 0 0 50%; right: 0; }
`;
    document.head.appendChild(el);
}

export class TouchZonesPlugin extends Plugin<NMVideoPlayer<any>, TouchZonesOptions> {
    static override readonly id: string = 'touch-zones';
    static override readonly version: string = '2.0.0';
    static override readonly description: string = 'Tap-zone overlay: double-tap to seek, single-tap to toggle playback';

    private root!: HTMLDivElement;
    private controlsVisible = false;

    override use(): void {
        ensureStyles();
        this.root = this.mount('root');
        this.player.addClasses(this.root, ['nm-touch-zones-root']);

        this.on('activity', d => {
            this.controlsVisible = d.active;
        });

        const isMobile = this.detectMobile();

        if (isMobile) {
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
        const delay = this.opts?.doubleClickDelay ?? 300;
        let lastTap = 0;
        let singleTimer: ReturnType<typeof setTimeout> | null = null;

        return (e: Event): void => {
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

    private buildSeekBack(parent: HTMLElement, pos: ZonePos): void {
        const el = this.makeBox(parent, pos);
        const seconds = this.opts?.seekSeconds ?? 10;

        const handler = this.doubleTap(
            () => { void this.player.rewind?.(seconds); },
            () => {
                if (this.controlsVisible) this.player.emit('activity', { active: false });
            },
        );
        this.listen(el, 'click', handler);
    }

    private buildSeekForward(parent: HTMLElement, pos: ZonePos): void {
        const el = this.makeBox(parent, pos);
        const seconds = this.opts?.seekSeconds ?? 10;

        const handler = this.doubleTap(
            () => { void this.player.forward?.(seconds); },
            () => {
                if (this.controlsVisible) this.player.emit('activity', { active: false });
            },
        );
        this.listen(el, 'click', handler);
        this.listen(el, 'touchend', handler);
    }

    private buildPlayback(parent: HTMLElement, pos: ZonePos): void {
        const el = this.makeBox(parent, pos);
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';

        const handler = this.doubleTap(
            () => { void this.player.toggleFullscreen?.(); },
            () => {
                if (this.controlsVisible) void this.player.togglePlayback?.();
            },
        );
        this.listen(el, 'click', handler);
    }

    private buildVolUp(parent: HTMLElement, pos: ZonePos): void {
        const el = this.makeBox(parent, pos);
        const handler = this.doubleTap(
            () => { this.player.volumeUp?.(); },
            () => {
                if (this.controlsVisible) this.player.emit('activity', { active: false });
            },
        );
        this.listen(el, 'click', handler);
    }

    private buildVolDown(parent: HTMLElement, pos: ZonePos): void {
        const el = this.makeBox(parent, pos);
        const handler = this.doubleTap(
            () => { this.player.volumeDown?.(); },
            () => {
                if (this.controlsVisible) this.player.emit('activity', { active: false });
            },
        );
        this.listen(el, 'click', handler);
    }
}

export const touchZonesPlugin = TouchZonesPlugin;
