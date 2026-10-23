// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * A user must never see a raw translation key in the feedback toast. The
 * toast text comes from `this.t('message.buffering')`, which resolves
 * `plugin.desktop-ui.message.buffering` against the loaded bundles.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NMVideoPlayer } from '../../index';
import { desktopUiPlugin } from '../../plugins/desktop-ui';

const MockResizeObserver = vi.fn(function (this: unknown) {
	return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
});

async function makePlayer(language: string): Promise<NMVideoPlayer> {
	const player = new NMVideoPlayer('test').setup({ language });
	await player.addPlugin(desktopUiPlugin, { inactivityMs: 4000 }).ready();
	return player;
}

describe('DesktopUiPlugin — feedback toast never shows a raw key', () => {
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

	it.each(['en', 'nl', 'en-US', 'pt-BR', 'zz', 'mt', 'zh-CN', 'be'])(
		'waiting with language %s shows text, not the key',
		async (language) => {
			const player = await makePlayer(language);
			player.emit('waiting', {});
			const text = player.container.textContent ?? '';
			expect(text).not.toContain('plugin.desktop-ui');
		},
	);
});
