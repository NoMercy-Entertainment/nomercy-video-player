// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { BasePlaylistItem, PreloadAsset } from '@nomercy-entertainment/nomercy-player-core';
import type { VideoPlaylistItem } from '../types';
import type { LegacyTrackEntry } from './normalize-item';
import { DefaultPreloadStrategy } from '@nomercy-entertainment/nomercy-player-core';

/**
 * Video-domain preload strategy. Extends the kit's `DefaultPreloadStrategy`
 * to prefetch video-specific assets for the next queue item:
 *
 *  - HLS manifest (or direct video URL) — `'media'` / `metadata` mode
 *  - Poster image — `'poster'` / `auto` mode (small, load fully)
 *  - Sprite VTT (preview thumbnails) — `'sprite'` / `metadata`
 *  - Subtitle sidecars from `item.subtitles` — `'subtitle'` / `auto`
 *  - Chapter VTT sidecars from `tracks[].kind === 'chapters'` (the legacy
 *    field the normalizer preserves) — `'chapter'` / `auto`
 *  - Font manifests from `item.fonts` (ASS/SSA rendering — same `'font'`
 *    category `OctopusPlugin` resolves with) — `'font'` / `auto`
 *
 * Video crossfade is disabled by default (`GaplessTransitionStrategy`). Asset
 * preloading still runs, and what it does is issue one `HEAD` request per asset
 * with `mode: 'no-cors'` (`core/mixins/lifecycle.ts` `_runPreload`). A `HEAD`
 * returns no body and an opaque response caches nothing a later load can use,
 * so this warms no media and the next item does not start any sooner. The
 * observable output is `preloadProgress` and `preloadComplete`.
 */
export class VideoPreloadStrategy extends DefaultPreloadStrategy {
	override assetsToPreload(item: BasePlaylistItem): PreloadAsset[] {
		const videoItem = item as VideoPlaylistItem & { tracks?: LegacyTrackEntry[] };
		const assets: PreloadAsset[] = [];

		if (videoItem.url) {
			assets.push({ url: videoItem.url, category: 'media', mode: 'metadata' });
		}

		const posterUrl = videoItem.image ?? videoItem.poster ?? videoItem.thumbnail;
		if (posterUrl) {
			assets.push({ url: posterUrl, category: 'poster', mode: 'auto' });
		}

		if (videoItem.previewSpriteUrl) {
			assets.push({ url: videoItem.previewSpriteUrl, category: 'sprite', mode: 'metadata' });
		}

		for (const subtitle of videoItem.subtitles ?? []) {
			if (subtitle.url) {
				assets.push({ url: subtitle.url, category: 'subtitle', mode: 'auto' });
			}
		}

		for (const track of videoItem.tracks ?? []) {
			if (track.kind === 'chapters' && track.file) {
				assets.push({ url: track.file, category: 'chapter', mode: 'auto' });
			}
		}

		for (const font of videoItem.fonts ?? []) {
			if (font.file) {
				assets.push({ url: font.file, category: 'font', mode: 'auto' });
			}
		}

		return assets;
	}
}
