/**
 * Regression: desktop-ui icon state must reflect divergence from default.
 *
 * Convention: outline icon = current value equals default. Filled icon = current
 * value diverges from default. The `.btn.is-active` class on a button forces the
 * filled (hover) icon path visible via CSS.
 *
 * Buttons covered:
 *   speed   — default 1.0x; filled when rate !== 1
 *   audio   — filled when selected track is not the manifest default
 *   aspect  — default 'uniform'; filled when aspect !== 'uniform'
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NMVideoPlayer } from '../../index';
import { desktopUiPlugin } from '../../plugins/desktop-ui';

type ResizeCallback = (entries: Array<{ contentRect: { width: number } }>) => void;
const MockResizeObserver = vi.fn(function (this: unknown, _cb: ResizeCallback) {
    return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
});

async function makePlayer(): Promise<NMVideoPlayer> {
    const player = new NMVideoPlayer('test').setup({});
    await player.addPlugin(desktopUiPlugin, {
        buttons: {
            speed: true,
            audio: true,
            aspectRatio: true,
        },
    }).ready();
    return player;
}

describe('DesktopUiPlugin — icon state (is-active divergence)', () => {
    beforeEach(() => {
        (NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
        const container = document.createElement('div');
        container.id = 'test';
        container.className = 'nomercyplayer';
        document.body.appendChild(container);
        vi.stubGlobal('ResizeObserver', MockResizeObserver);
    });

    afterEach(() => {
        (NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
        document.body.innerHTML = '';
        vi.unstubAllGlobals();
    });


    // ── Speed ─────────────────────────────────────────────────────────────────

    it('speed button has no is-active at default rate (1.0)', async () => {
        const player = await makePlayer();

        Object.assign(player, { playbackRate: () => 1 });
        player.emit('backend:ratechange' as never, {} as never);

        const speedBtn = document.querySelector<HTMLButtonElement>('#speed');
        expect(speedBtn).toBeTruthy();
        expect(speedBtn!.classList.contains('is-active')).toBe(false);
    });

    it('speed button gains is-active when rate diverges from 1.0', async () => {
        const player = await makePlayer();

        Object.assign(player, { playbackRate: () => 1.5 });
        player.emit('backend:ratechange' as never, {} as never);

        const speedBtn = document.querySelector<HTMLButtonElement>('#speed');
        expect(speedBtn).toBeTruthy();
        expect(speedBtn!.classList.contains('is-active')).toBe(true);
    });

    it('speed button loses is-active when rate returns to 1.0', async () => {
        const player = await makePlayer();

        Object.assign(player, { playbackRate: () => 0.75 });
        player.emit('backend:ratechange' as never, {} as never);

        const speedBtn = document.querySelector<HTMLButtonElement>('#speed');
        expect(speedBtn!.classList.contains('is-active')).toBe(true);

        Object.assign(player, { playbackRate: () => 1 });
        player.emit('backend:ratechange' as never, {} as never);

        expect(speedBtn!.classList.contains('is-active')).toBe(false);
    });


    // ── Aspect ratio ──────────────────────────────────────────────────────────

    it('aspect-ratio button has no is-active at default (uniform)', async () => {
        const player = await makePlayer();

        Object.assign(player, { aspectRatio: () => 'uniform' });
        player.emit('aspectRatio' as never, {} as never);

        const aspectBtn = document.querySelector<HTMLButtonElement>('#aspect-ratio');
        expect(aspectBtn).toBeTruthy();
        expect(aspectBtn!.classList.contains('is-active')).toBe(false);
    });

    it('aspect-ratio button gains is-active when aspect diverges from uniform', async () => {
        const player = await makePlayer();

        Object.assign(player, { aspectRatio: () => 'fill' });
        player.emit('aspectRatio' as never, {} as never);

        const aspectBtn = document.querySelector<HTMLButtonElement>('#aspect-ratio');
        expect(aspectBtn).toBeTruthy();
        expect(aspectBtn!.classList.contains('is-active')).toBe(true);
    });

    it('aspect-ratio button loses is-active when returning to uniform', async () => {
        const player = await makePlayer();

        Object.assign(player, { aspectRatio: () => 'exactfit' });
        player.emit('aspectRatio' as never, {} as never);

        const aspectBtn = document.querySelector<HTMLButtonElement>('#aspect-ratio');
        expect(aspectBtn!.classList.contains('is-active')).toBe(true);

        Object.assign(player, { aspectRatio: () => 'uniform' });
        player.emit('aspectRatio' as never, {} as never);

        expect(aspectBtn!.classList.contains('is-active')).toBe(false);
    });


    // ── Audio track ───────────────────────────────────────────────────────────

    it('audio button has no is-active when the default track is selected', async () => {
        const player = await makePlayer();

        const tracks = [
            { id: 'en', label: 'English', default: true },
            { id: 'nl', label: 'Dutch', default: false },
        ];
        Object.assign(player, { audioTracks: () => tracks });

        // Emit audioTrack selecting index 0 (the default track).
        player.emit('audioTrack' as never, { id: 0 } as never);

        const audioBtn = document.querySelector<HTMLButtonElement>('#audio');
        expect(audioBtn).toBeTruthy();
        expect(audioBtn!.classList.contains('is-active')).toBe(false);
    });

    it('audio button gains is-active when a non-default track is selected', async () => {
        const player = await makePlayer();

        const tracks = [
            { id: 'en', label: 'English', default: true },
            { id: 'nl', label: 'Dutch', default: false },
        ];
        Object.assign(player, { audioTracks: () => tracks });

        // Emit audioTrack selecting index 1 (not the default).
        player.emit('audioTrack' as never, { id: 1 } as never);

        const audioBtn = document.querySelector<HTMLButtonElement>('#audio');
        expect(audioBtn).toBeTruthy();
        expect(audioBtn!.classList.contains('is-active')).toBe(true);
    });

    it('audio button loses is-active when returning to the default track', async () => {
        const player = await makePlayer();

        const tracks = [
            { id: 'en', label: 'English', default: true },
            { id: 'nl', label: 'Dutch', default: false },
        ];
        Object.assign(player, { audioTracks: () => tracks });

        player.emit('audioTrack' as never, { id: 1 } as never);

        const audioBtn = document.querySelector<HTMLButtonElement>('#audio');
        expect(audioBtn!.classList.contains('is-active')).toBe(true);

        player.emit('audioTrack' as never, { id: 0 } as never);

        expect(audioBtn!.classList.contains('is-active')).toBe(false);
    });
});
