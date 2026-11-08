// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Rule: an active toggle shows the FILLED icon, an inactive one the outline.
 * The CSS shows `.icon-normal` at rest and `.icon-hover` on hover and on `.btn.is-active`,
 * so for every icon a toggle uses, `normal` must be the outline and `hover` the filled glyph.
 * The outline carries an outer and an inner contour, so it has more subpaths; two glyphs with the
 * same count are told apart by the length of their path data.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NMVideoPlayer } from '../../index';
import { desktopUiPlugin } from '../../plugins/desktop-ui';
import { fluentIcons } from '../../plugins/desktop-ui/data/icons';

const TOGGLE_ICONS = ['language', 'quality', 'speed', 'aspectFit', 'pipEnter', 'pipExit', 'subtitles', 'subtitlesOff'] as const;

describe('icons used by active-state toggles', () => {
	const subpaths = (glyph: string): number => (glyph.match(/M/g) ?? []).length;

	it.each(TOGGLE_ICONS)('%s: the glyph shown while active (hover) is the filled one', (name) => {
		const icon = fluentIcons[name];
		const hoverIsFilled = subpaths(icon.hover) < subpaths(icon.normal)
			|| (subpaths(icon.hover) === subpaths(icon.normal) && icon.hover.length < icon.normal.length);

		expect(hoverIsFilled, `${name}: hover must be the filled glyph`).toBe(true);
	});
});

const MockResizeObserver = vi.fn(function (this: unknown) {
	return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
});

describe('DesktopUiPlugin — Subtitles button fill', () => {
	let player: NMVideoPlayer;

	beforeEach(async () => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const container = document.createElement('div');
		container.id = 'test';
		container.className = 'nomercyplayer';
		document.body.appendChild(container);
		vi.stubGlobal('ResizeObserver', MockResizeObserver);
		player = new NMVideoPlayer('test').setup({});
		await player.addPlugin(desktopUiPlugin, { buttons: { speed: true, audio: true, aspectRatio: true, pip: true } }).ready();
	});

	afterEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		vi.unstubAllGlobals();
	});

	const button = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[id="subtitles"]')!;
	// What the CSS shows: the hover glyph while the button is active, the normal glyph otherwise.
	const shownGlyph = (): string => {
		const selector = button().classList.contains('is-active') ? 'path.icon-hover' : 'path.icon-normal';
		return button().querySelector(selector)!.getAttribute('d')!;
	};
	// The outline glyph has the inner box contour; the filled glyph does not.
	const isOutline = (glyph: string): boolean => glyph.includes('18.75 5.5');

	it('shows the outline while no track is selected', () => {
		expect(button().classList.contains('is-active')).toBe(false);
		expect(isOutline(shownGlyph())).toBe(true);
	});

	it('shows the filled icon when a track is selected, the way the menu does it', () => {
		player.emit('subtitle' as never, { track: 0 } as never);

		expect(button().classList.contains('is-active')).toBe(true);
		expect(isOutline(shownGlyph())).toBe(false);
	});

	it('goes back to the outline when subtitles are turned off', () => {
		player.emit('subtitle' as never, { track: 0 } as never);
		player.emit('subtitle' as never, { track: null } as never);

		expect(button().classList.contains('is-active')).toBe(false);
		expect(isOutline(shownGlyph())).toBe(true);
	});

	it('picks up a selection that exists when the track list changes after load', () => {
		vi.spyOn(player, 'subtitle').mockReturnValue({ index: 0 } as never);

		player.emit('subtitles' as never, { tracks: [] } as never);

		expect(button().classList.contains('is-active')).toBe(true);
		expect(isOutline(shownGlyph())).toBe(false);
	});
});
