// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * hls.js moves cached CEA-608/708 cues onto their caption track only when a `video` buffer is
 * appended. A muxed stream appends `audiovideo`, so the cache never drained and no caption showed.
 */

import { describe, expect, it } from 'vitest';
import { drainCaptionCache } from '../adapters/video-backend/hls-caption-drain';

interface FakeCue { id: string; text: string }

function fakeTrack(mode: TextTrackMode): { mode: TextTrackMode; added: FakeCue[]; cues: { getCueById: (id: string) => FakeCue | null }; addCue: (cue: FakeCue) => void } {
	const added: FakeCue[] = [];
	return {
		mode,
		added,
		cues: { getCueById: id => added.find(cue => cue.id === id) ?? null },
		addCue: (cue) => { added.push(cue); },
	};
}

function hlsWith(timeline: unknown): object {
	return { coreComponents: [{ unrelated: true }, timeline] };
}

describe('drainCaptionCache', () => {
	it('moves cached cues onto their caption track and empties the cache', () => {
		const track = fakeTrack('hidden');
		const cueCache = { textTrack1: [{ id: 'a', text: 'Hello' }, { id: 'b', text: 'world' }] };

		drainCaptionCache(hlsWith({ cueCache, captionsTracks: { textTrack1: { track } } }));

		expect(track.added.map(cue => cue.text)).toEqual(['Hello', 'world']);
		expect(cueCache).toEqual({});
	});

	it('restores a disabled track to disabled after adding', () => {
		const track = fakeTrack('disabled');

		drainCaptionCache(hlsWith({ cueCache: { textTrack1: [{ id: 'a', text: 'Hi' }] }, captionsTracks: { textTrack1: { track } } }));

		expect(track.added).toHaveLength(1);
		expect(track.mode).toBe('disabled');
	});

	it('skips a cue the track already holds', () => {
		const track = fakeTrack('hidden');
		track.addCue({ id: 'a', text: 'Hi' });

		drainCaptionCache(hlsWith({ cueCache: { textTrack1: [{ id: 'a', text: 'Hi' }] }, captionsTracks: { textTrack1: { track } } }));

		expect(track.added).toHaveLength(1);
	});

	it('drops the cache of a channel that has no track, like hls.js does', () => {
		const cueCache = { textTrack2: [{ id: 'a', text: 'Hi' }] };

		drainCaptionCache(hlsWith({ cueCache, captionsTracks: {} }));

		expect(cueCache).toEqual({});
	});

	it('does nothing, and does not throw, when hls.js has no timeline controller', () => {
		expect(() => drainCaptionCache({ coreComponents: [{ unrelated: true }] })).not.toThrow();
		expect(() => drainCaptionCache({})).not.toThrow();
	});
});
