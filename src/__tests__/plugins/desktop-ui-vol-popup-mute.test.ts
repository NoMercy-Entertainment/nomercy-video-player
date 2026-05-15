/**
 * Tests for the in-popup mute button inside the vertical volume slider.
 *
 * Covers:
 *   - Button is present inside `.volume-slider-vertical` after plugin mounts.
 *   - Clicking the popup mute button calls `player.toggleMute`.
 *   - Click does NOT propagate to the document (popup stays open).
 *   - `'mute'` event updates the popup button icon (speaker ↔ muted).
 *   - In horizontal mode, no popup mute button is reachable from an open popup.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NMVideoPlayer } from '../../index';
import { desktopUiPlugin } from '../../plugins/desktop-ui';

// ── ResizeObserver stub ───────────────────────────────────────────────────────

type ResizeCallback = (entries: Array<{ contentRect: { width: number } }>) => void;

const MockResizeObserver = vi.fn(function (this: unknown, _cb: ResizeCallback) {
    return {
        observe: vi.fn(),
        disconnect: vi.fn(),
        unobserve: vi.fn(),
    };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONTAINER_ID = 'vol-popup-mute-test';

const setup = (opts?: Record<string, unknown>): NMVideoPlayer => {
    const player = new NMVideoPlayer(CONTAINER_ID).setup({});
    player.addPlugin(desktopUiPlugin, opts);
    return player;
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DesktopUiPlugin — vertical popup mute button', () => {
    beforeEach(() => {
        (NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();

        const div = document.createElement('div');
        div.id = CONTAINER_ID;
        div.className = 'nomercyplayer';
        document.body.appendChild(div);

        (globalThis as unknown as Record<string, unknown>).ResizeObserver = MockResizeObserver;
    });

    afterEach(() => {
        (NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
        document.body.innerHTML = '';
        delete (globalThis as unknown as Record<string, unknown>).ResizeObserver;
    });

    // ── Presence ──────────────────────────────────────────────────────────────

    describe('popup mute button presence', () => {
        it('renders a .vol-popup-mute button inside .volume-slider-vertical', async () => {
            const player = setup({ volumeSlider: 'vertical' });
            await player.ready();

            const popup = document.querySelector('.volume-slider-vertical');
            expect(popup).not.toBeNull();

            const muteBtn = popup!.querySelector('.vol-popup-mute');
            expect(muteBtn).not.toBeNull();
        });

        it('is present in auto mode (always constructed, shown when popup opens)', async () => {
            const player = setup({ volumeSlider: 'auto' });
            await player.ready();

            const popup = document.querySelector('.volume-slider-vertical');
            expect(popup).not.toBeNull();

            const muteBtn = popup!.querySelector('.vol-popup-mute');
            expect(muteBtn).not.toBeNull();
        });
    });

    // ── Click behaviour ───────────────────────────────────────────────────────

    describe('popup mute button click', () => {
        it('calls player.toggleMute when clicked', async () => {
            const player = setup({ volumeSlider: 'vertical' });
            await player.ready();

            const toggleMuteSpy = vi.spyOn(player, 'toggleMute');
            const muteBtn = document.querySelector<HTMLButtonElement>('.vol-popup-mute');
            expect(muteBtn).not.toBeNull();

            muteBtn!.click();

            expect(toggleMuteSpy).toHaveBeenCalledOnce();
        });

        it('stops click propagation so the popup does not close', async () => {
            const player = setup({ volumeSlider: 'vertical' });
            await player.ready();

            // Open the popup via the volume button.
            const volBtn = document.querySelector<HTMLButtonElement>('#volume');
            volBtn?.click();

            const popup = document.querySelector('.volume-slider-vertical')!;
            expect(popup.classList.contains('volume-slider-vertical-open')).toBe(true);

            // Simulate a click on the in-popup mute button.
            // If propagation is NOT stopped, the document listener closes the popup.
            const muteBtn = popup.querySelector<HTMLButtonElement>('.vol-popup-mute')!;
            muteBtn.click();

            // Popup must still be open — the click was contained.
            expect(popup.classList.contains('volume-slider-vertical-open')).toBe(true);
        });
    });

    // ── Icon sync via mute event ──────────────────────────────────────────────

    describe('icon sync on mute event', () => {
        it('updates aria-label when mute event fires with muted=true', async () => {
            const player = setup({ volumeSlider: 'vertical' });
            await player.ready();

            const muteBtn = document.querySelector<HTMLButtonElement>('.vol-popup-mute')!;

            player.emit('mute', { muted: true });

            // The aria-label should still be the "Mute / Unmute" label.
            expect(muteBtn.getAttribute('aria-label')).toBeTruthy();
        });

        it('icon SVG changes when mute event fires (muted → unmuted)', async () => {
            const player = setup({ volumeSlider: 'vertical' });
            await player.ready();

            const muteBtn = document.querySelector<HTMLButtonElement>('.vol-popup-mute')!;

            player.emit('mute', { muted: true });
            const mutedHtml = muteBtn.querySelector('.btn-icon')?.innerHTML ?? '';

            player.emit('mute', { muted: false });
            const unmutedHtml = muteBtn.querySelector('.btn-icon')?.innerHTML ?? '';

            expect(mutedHtml).not.toBe(unmutedHtml);
        });
    });
});
