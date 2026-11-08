// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

interface CaptionTrackLike {
	mode: TextTrackMode;
	cues: { getCueById: (id: string) => unknown } | null;
	addCue: (cue: never) => void;
}

interface TimelineControllerLike {
	cueCache: Record<string, Array<{ id: string }>>;
	captionsTracks: Record<string, { track?: CaptionTrackLike } | undefined>;
}

function isTimelineController(value: unknown): value is TimelineControllerLike {
	return typeof value === 'object' && value !== null && 'cueCache' in value && 'captionsTracks' in value;
}

/**
 * hls.js drains its cached CEA-608/708 cues onto their caption track only when a `video` buffer is
 * appended (timeline-controller onBufferAppended, still so in 1.7.4). A muxed stream appends
 * `audiovideo`, so the cache never drains and no caption shows. This does the same drain.
 */
export function drainCaptionCache(hls: object): void {
	const components = (hls as { coreComponents?: unknown[] }).coreComponents;
	const timeline = components?.find(isTimelineController);
	if (!timeline)
		return;
	for (const channel of Object.keys(timeline.cueCache)) {
		const track = timeline.captionsTracks[channel]?.track;
		if (track) {
			const mode = track.mode;
			if (mode === 'disabled')
				track.mode = 'hidden';
			for (const cue of timeline.cueCache[channel]!) {
				if (track.cues && !track.cues.getCueById(cue.id)) {
					try {
						track.addCue(cue as never);
					}
					catch { /* a cue the engine refuses is dropped, as hls.js drops it */ }
				}
			}
			if (mode === 'disabled')
				track.mode = mode;
		}
		delete timeline.cueCache[channel];
	}
}
