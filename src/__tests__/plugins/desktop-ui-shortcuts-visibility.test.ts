/**
 * Regression: shortcuts overlay must be computed-visible after showShortcuts()
 * and computed-hidden after hideShortcuts().
 *
 * The 5ea3aa9 refactor replaced <dialog>.showModal() with a plain <div>
 * toggled via style.display. The previous regression tests only verified DOM
 * membership (overlay in container) and element type (div, not dialog). Neither
 * assertion caught a bug where the element exists but remains hidden — e.g. a
 * CSS rule with higher specificity overriding the inline display:flex, or the
 * toggle event path being severed.
 *
 * This suite asserts:
 *   1. After `plugin:desktop-ui:shortcuts-toggle` fires, the overlay's inline
 *      display is 'flex' (not 'none').
 *   2. After a second toggle, the inline display returns to 'none'.
 *   3. No stylesheet rule sets display:none on #nmplayer-keybinds-dialog with
 *      enough specificity to override an inline display:flex — tested by
 *      confirming getComputedStyle().display is also 'flex' after the toggle.
 *   4. The help key binding in KeyHandlerPlugin is registered as 'shift+?'
 *      (the canonical form the browser actually sends), not as bare '?'.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NMVideoPlayer } from '../../index';
import { DesktopUiPlugin, desktopUiPlugin } from '../../plugins/desktop-ui';
import { KeyHandlerPlugin, keyHandlerPlugin } from '../../plugins/key-handler';

type ResizeCallback = (entries: Array<{ contentRect: { width: number } }>) => void;
const MockResizeObserver = vi.fn(function (this: unknown, _cb: ResizeCallback) {
    return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
});

describe('DesktopUiPlugin — shortcuts overlay visibility', () => {
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

    it('overlay inline display is "flex" after shortcuts-toggle fires (not just present in DOM)', async () => {
        const player = new NMVideoPlayer('test').setup({});
        await player.addPlugin(desktopUiPlugin).ready();

        const overlay = document.querySelector<HTMLDivElement>('#nmplayer-keybinds-dialog');
        expect(overlay, 'overlay must be in DOM before toggle').not.toBeNull();

        // Initial state: hidden.
        expect(overlay!.style.display, 'overlay must start hidden').toBe('none');

        // Fire the event that showShortcuts() is wired to.
        player.emit('plugin:desktop-ui:shortcuts-toggle', undefined);

        // Inline style must switch to flex — this is the exact check that would
        // have caught the showModal→display refactor if the switch was broken.
        expect(overlay!.style.display, 'overlay must be display:flex after toggle-open').toBe('flex');
    });

    it('getComputedStyle().display is "flex" after toggle — no stylesheet overrides inline display:flex', async () => {
        const player = new NMVideoPlayer('test').setup({});
        await player.addPlugin(desktopUiPlugin).ready();

        const overlay = document.querySelector<HTMLDivElement>('#nmplayer-keybinds-dialog');
        expect(overlay).not.toBeNull();

        player.emit('plugin:desktop-ui:shortcuts-toggle', undefined);

        // computedStyle beats stylesheet specificity checks — if a CSS rule with
        // !important or higher specificity overrides the inline flex, this fails.
        const computed = getComputedStyle(overlay!);
        expect(
            computed.display,
            'computed display must be flex — stylesheet must not override inline display:flex',
        ).toBe('flex');
    });

    it('overlay returns to display:none after a second toggle (hide path)', async () => {
        const player = new NMVideoPlayer('test').setup({});
        await player.addPlugin(desktopUiPlugin).ready();

        const overlay = document.querySelector<HTMLDivElement>('#nmplayer-keybinds-dialog');
        expect(overlay).not.toBeNull();

        player.emit('plugin:desktop-ui:shortcuts-toggle', undefined);
        expect(overlay!.style.display).toBe('flex');

        player.emit('plugin:desktop-ui:shortcuts-toggle', undefined);
        expect(overlay!.style.display, 'overlay must be hidden after second toggle').toBe('none');
    });

    it('overlay returns to display:none when removePlugin disposes the desktop-ui', async () => {
        const player = new NMVideoPlayer('test').setup({});
        await player.addPlugin(desktopUiPlugin).ready();

        const overlay = document.querySelector<HTMLDivElement>('#nmplayer-keybinds-dialog');
        expect(overlay).not.toBeNull();

        player.emit('plugin:desktop-ui:shortcuts-toggle', undefined);
        expect(overlay!.style.display).toBe('flex');

        // removePlugin disposes the plugin lifecycle, which runs the mount cleanup
        // and removes the mount div (and its children, including the overlay) from DOM.
        player.removePlugin(DesktopUiPlugin);

        const orphan = document.querySelector('#nmplayer-keybinds-dialog');
        expect(orphan, 'overlay must be removed from DOM after plugin removal').toBeNull();
    });
});

describe('KeyHandlerPlugin — ? keybind uses shift+? canonical form', () => {
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

    it('pressing ? (key="?", shiftKey=true) fires plugin:desktop-ui:shortcuts-toggle', async () => {
        const player = new NMVideoPlayer('test').setup({});
        await player.addPlugin(desktopUiPlugin).ready();
        await player.addPlugin(keyHandlerPlugin).ready();

        const overlay = document.querySelector<HTMLDivElement>('#nmplayer-keybinds-dialog');
        expect(overlay).not.toBeNull();

        // Simulate exactly what the browser sends: key='?' with shiftKey=true.
        // The old bind('?') registration missed this because the canonicalizer
        // stored '?' but the event arrived as 'shift+?' (shift is required to
        // produce the ? character on standard keyboards).
        const keyEvent = new KeyboardEvent('keydown', {
            key: '?',
            shiftKey: true,
            bubbles: true,
        });
        document.dispatchEvent(keyEvent);

        expect(
            overlay!.style.display,
            'pressing ? (shiftKey=true) must open the shortcuts overlay — bind("shift+?") fix verification',
        ).toBe('flex');
    });

    it('bindings() snapshot includes shift+? (not bare ?)', async () => {
        const player = new NMVideoPlayer('test').setup({});
        await player.addPlugin(keyHandlerPlugin).ready();

        const kh = player.getPlugin(KeyHandlerPlugin);
        expect(kh, 'KeyHandlerPlugin must be accessible via getPlugin').toBeDefined();

        const bindings = kh!.bindings();

        expect(
            bindings.has('shift+?'),
            'bindings map must contain "shift+?" — bare "?" is the wrong canonical form',
        ).toBe(true);

        expect(
            bindings.has('?'),
            'bindings map must NOT contain bare "?" — it would never match a real keydown event',
        ).toBe(false);
    });
});
