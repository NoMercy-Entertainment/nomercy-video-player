/**
 * Regression: desktop-ui shortcuts overlay must NOT render raw i18n keys.
 *
 * Root cause: `this.t(key)` in Plugin.base.ts prepends `plugin.<id>.` to every
 * key automatically. The shortcuts call sites were passing full keys like
 * `'plugin.desktop-ui.shortcuts.title'`, producing the double-prefixed lookup
 * `plugin.desktop-ui.plugin.desktop-ui.shortcuts.title` — missing from the
 * bundle → fell through to printing the raw key string.
 *
 * Fix: all `this.t()` calls in the shortcuts overlay use short relative keys
 * (`'shortcuts.title'`, `'shortcuts.playPause'`, etc.) so the auto-namespace
 * produces the correct fully-qualified key.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NMVideoPlayer } from '../../index';
import { DesktopUiPlugin, desktopUiPlugin } from '../../plugins/desktop-ui';
import enBundle from '../../plugins/desktop-ui/i18n/en';

type ResizeCallback = (entries: Array<{ contentRect: { width: number } }>) => void;
const MockResizeObserver = vi.fn(function (this: unknown, _cb: ResizeCallback) {
    return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
});

const SHORTCUTS_FULLY_QUALIFIED_KEYS: ReadonlyArray<string> = [
    'plugin.desktop-ui.shortcuts.title',
    'plugin.desktop-ui.shortcuts.hint',
    'plugin.desktop-ui.shortcuts.hintToast',
    'plugin.desktop-ui.shortcuts.playPause',
    'plugin.desktop-ui.shortcuts.stop',
    'plugin.desktop-ui.shortcuts.frameAdvance',
    'plugin.desktop-ui.shortcuts.speedUp',
    'plugin.desktop-ui.shortcuts.speedDown',
    'plugin.desktop-ui.shortcuts.normalSpeed',
    'plugin.desktop-ui.shortcuts.volumeUp',
    'plugin.desktop-ui.shortcuts.volumeDown',
    'plugin.desktop-ui.shortcuts.mute',
    'plugin.desktop-ui.shortcuts.seekBack5',
    'plugin.desktop-ui.shortcuts.seekForward5',
    'plugin.desktop-ui.shortcuts.seek3s',
    'plugin.desktop-ui.shortcuts.seek10s',
    'plugin.desktop-ui.shortcuts.seek60s',
    'plugin.desktop-ui.shortcuts.seek30s',
    'plugin.desktop-ui.shortcuts.seek60sKey',
    'plugin.desktop-ui.shortcuts.seek90s',
    'plugin.desktop-ui.shortcuts.seek120s',
    'plugin.desktop-ui.shortcuts.next',
    'plugin.desktop-ui.shortcuts.previous',
    'plugin.desktop-ui.shortcuts.nextChapter',
    'plugin.desktop-ui.shortcuts.previousChapter',
    'plugin.desktop-ui.shortcuts.cycleSubs',
    'plugin.desktop-ui.shortcuts.cycleAudio',
    'plugin.desktop-ui.shortcuts.cycleAspect',
    'plugin.desktop-ui.shortcuts.subSizeUp',
    'plugin.desktop-ui.shortcuts.subSizeDown',
    'plugin.desktop-ui.shortcuts.fullscreen',
    'plugin.desktop-ui.shortcuts.exitFullscreen',
    'plugin.desktop-ui.shortcuts.showTime',
    'plugin.desktop-ui.shortcuts.help',
];

describe('DesktopUiPlugin — shortcuts overlay i18n', () => {
    beforeEach(() => {
        (NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
        const div = document.createElement('div');
        div.id = 'test';
        document.body.appendChild(div);
        vi.stubGlobal('ResizeObserver', MockResizeObserver);
    });

    afterEach(() => {
        (NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
        document.body.innerHTML = '';
        vi.unstubAllGlobals();
    });

    it('en locale bundle covers every fully-qualified shortcuts key the overlay uses', () => {
        for (const key of SHORTCUTS_FULLY_QUALIFIED_KEYS) {
            expect(
                Object.prototype.hasOwnProperty.call(enBundle, key),
                `Missing key in en.ts: ${key}`,
            ).toBe(true);
            expect(
                (enBundle as Record<string, string>)[key],
                `Empty value for key: ${key}`,
            ).toBeTruthy();
        }
    });

    it('no locale bundle value equals its own key (all strings are human-readable)', () => {
        for (const [key, value] of Object.entries(enBundle)) {
            expect(value, `Key equals its own value (untranslated): ${key}`).not.toBe(key);
        }
    });

    it('shortcuts overlay heading renders human-readable text, not a raw key', async () => {
        const player = new NMVideoPlayer('test').setup({});
        await player.addPlugin(desktopUiPlugin).ready();

        expect(player.getPlugin(DesktopUiPlugin)).toBeDefined();

        const dialog = document.querySelector<HTMLDialogElement>('#nmplayer-keybinds-dialog');
        expect(dialog).not.toBeNull();

        const heading = dialog!.querySelector('h2');
        expect(heading).not.toBeNull();

        const headingText = heading!.textContent ?? '';
        expect(headingText).not.toContain('plugin.desktop-ui.plugin.desktop-ui.');
        expect(headingText).not.toBe('plugin.desktop-ui.shortcuts.title');
        expect(headingText.trim().length).toBeGreaterThan(0);
    });

    it('shortcuts overlay hint footer renders human-readable text, not a raw key', async () => {
        const player = new NMVideoPlayer('test').setup({});
        await player.addPlugin(desktopUiPlugin).ready();

        const dialog = document.querySelector<HTMLDialogElement>('#nmplayer-keybinds-dialog');
        expect(dialog).not.toBeNull();

        const hintParagraph = dialog!.querySelector('p');
        expect(hintParagraph).not.toBeNull();

        const hintText = hintParagraph!.textContent ?? '';
        expect(hintText).not.toContain('plugin.desktop-ui.plugin.desktop-ui.');
        expect(hintText).not.toBe('plugin.desktop-ui.shortcuts.hint');
        expect(hintText.trim().length).toBeGreaterThan(0);
    });
});
