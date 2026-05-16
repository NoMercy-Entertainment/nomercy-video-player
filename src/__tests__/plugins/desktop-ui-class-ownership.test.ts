/**
 * Regression: desktop-ui must NOT add 'nomercyplayer' to the container.
 * The kit's base-player / initPlayerCoreState owns that class — it is applied
 * before any plugin mounts. If the plugin adds it too, classList has the class
 * twice (DOMTokenList deduplicates, but the intent is wrong and the assertion
 * guards against re-adding the imperative call in future).
 *
 * Contract: after plugin.use() resolves, container.classList has 'nomercyplayer'
 * exactly once, and it was NOT put there by the desktop-ui plugin.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NMVideoPlayer } from '../../index';
import { desktopUiPlugin } from '../../plugins/desktop-ui';

type ResizeCallback = (entries: Array<{ contentRect: { width: number } }>) => void;
const MockResizeObserver = vi.fn(function (this: unknown, _cb: ResizeCallback) {
    return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
});

describe('DesktopUiPlugin — nomercyplayer class ownership', () => {
    beforeEach(() => {
        (NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
        const div = document.createElement('div');
        div.id = 'test';
        div.className = 'nomercyplayer';
        document.body.appendChild(div);
        vi.stubGlobal('ResizeObserver', MockResizeObserver);
    });

    afterEach(() => {
        (NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
        document.body.innerHTML = '';
        vi.unstubAllGlobals();
    });

    it('container has nomercyplayer exactly once after plugin use()', async () => {
        const player = new NMVideoPlayer('test').setup({});
        await player.addPlugin(desktopUiPlugin).ready();

        const container = player.container;
        const count = [...container.classList].filter(cls => cls === 'nomercyplayer').length;
        expect(count).toBe(1);
    });

    it('desktop-ui plugin itself does not add nomercyplayer (class is present pre-mount)', async () => {
        const player = new NMVideoPlayer('test').setup({});

        // Remove the class before plugin mounts so we can detect if the plugin
        // re-adds it independently.
        player.container.classList.remove('nomercyplayer');
        expect(player.container.classList.contains('nomercyplayer')).toBe(false);

        await player.addPlugin(desktopUiPlugin).ready();

        // If the plugin was the culprit it would have added it back; after the
        // fix it must NOT have done so.
        expect(player.container.classList.contains('nomercyplayer')).toBe(false);
    });
});
