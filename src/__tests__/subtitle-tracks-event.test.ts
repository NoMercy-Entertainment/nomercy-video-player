// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/** A caption track that arrives after load reaches the player as the `subtitles` event, so the UI can show its button. */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Html5VideoBackend } from '../adapters/video-backend/html5';
import { NMVideoPlayer } from '../index';

describe('NMVideoPlayer subtitles event for late tracks', () => {
	beforeEach(() => {
		document.body.innerHTML = '<div id="subtitle-tracks-test"></div>';
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	afterEach(() => {
		document.body.innerHTML = '';
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	it('emits subtitles when the backend reports a changed track list', async () => {
		const backend = new Html5VideoBackend(document.createElement('div'));
		const player = new NMVideoPlayer('subtitle-tracks-test').setup({ backendFactory: () => backend });
		await player.backend('html5');
		const seen: number[] = [];
		player.on('subtitles', data => seen.push(data.tracks.length));

		backend.emit('subtitleTracks', { tracks: [] });

		expect(seen).toEqual([0]);
	});
});
