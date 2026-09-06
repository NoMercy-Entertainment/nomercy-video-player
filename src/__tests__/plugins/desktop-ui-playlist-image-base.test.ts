// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Playlist thumbnails resolve a relative `item.image` against the player's
 * `baseImageUrl`, so an image base is set in one place.
 *
 * Driven through the registered plugin rather than by calling the pane
 * renderer directly, because the defect was in how the plugin's options reach
 * that renderer: a test that supplies the base itself passes either way.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NMVideoPlayer } from '../../index';
import { DesktopUiPlugin } from '../../plugins/desktop-ui';

const RELATIVE_IMAGE = '/w780/poster.jpg';
const CONFIG_BASE = 'https://config.invalid/t/p';
const PLUGIN_BASE = 'https://plugin.invalid/t/p';

type ResizeCallback = (entries: Array<{ contentRect: { width: number } }>) => void;
const MockResizeObserver = vi.fn(function (this: unknown, _cb: ResizeCallback) {
	return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
});

interface MenuPlugin {
	openSubMenu: (id: string) => void;
}

async function playerWith(
	config: { baseImageUrl?: string },
	pluginOpts?: { imageBaseUrl?: string },
): Promise<NMVideoPlayer> {
	const player = new NMVideoPlayer('test');

	player.addPlugin(DesktopUiPlugin, pluginOpts ?? {});
	player.setup({
		baseImageUrl: config.baseImageUrl,
		playlist: [
			{ id: 'a', title: 'A', url: '/a.mp4', image: RELATIVE_IMAGE },
			{ id: 'b', title: 'B', url: '/b.mp4', image: RELATIVE_IMAGE },
		],
	});

	await player.ready();

	return player;
}

function openPlaylistMenu(player: NMVideoPlayer): void {
	const plugin = player.getPlugin(DesktopUiPlugin) as unknown as MenuPlugin;

	plugin.openSubMenu('playlist');
}

function thumbnailSources(): string[] {
	return Array.from(document.querySelectorAll<HTMLImageElement>('.episode-menu-button-image'))
		.map(img => img.getAttribute('src') ?? '');
}

describe('playlist thumbnails and the image base', () => {
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

	it('uses baseImageUrl from the player config when the plugin sets none', async () => {
		const player = await playerWith({ baseImageUrl: CONFIG_BASE });

		openPlaylistMenu(player);

		const sources = thumbnailSources();

		expect(sources.length, 'a thumbnail rendered per item').toBeGreaterThan(0);
		expect(sources[0]).toBe(`${CONFIG_BASE}${RELATIVE_IMAGE}`);
	});

	it('lets the plugin option win over the config base', async () => {
		const player = await playerWith(
			{ baseImageUrl: CONFIG_BASE },
			{ imageBaseUrl: PLUGIN_BASE },
		);

		openPlaylistMenu(player);

		expect(thumbnailSources()[0]).toBe(`${PLUGIN_BASE}${RELATIVE_IMAGE}`);
	});
});
