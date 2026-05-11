import type { PreloadAsset } from '@nomercy-entertainment/nomercy-player-core';
import { DefaultPreloadStrategy } from '@nomercy-entertainment/nomercy-player-core';
import type { BasePlaylistItem } from '@nomercy-entertainment/nomercy-player-core';
import type { VideoPlaylistItem } from '../types';

/**
 * Video-domain preload strategy. Extends the kit's `DefaultPreloadStrategy`
 * to prefetch video-specific assets for the next queue item:
 *
 *  - HLS manifest (or direct video URL) — `'media'` / `metadata` mode
 *  - Poster image — `'poster'` / `auto` mode (small, load fully)
 *  - Subtitle sidecars from `item.subtitles` — `'subtitle'` / `auto`
 *  - Sprite VTT (preview thumbnails) — `'sprite'` / `metadata`
 *  - Generic tracks from `item.tracks` (chapters, fonts, fonts, etc.) — `'subtitle'` / `auto`
 *
 * Video crossfade is disabled by default (`GaplessTransitionStrategy`). Asset
 * preloading still runs so the next item starts instantly on hard-cut.
 */
export class VideoPreloadStrategy extends DefaultPreloadStrategy {
	override assetsToPreload(item: BasePlaylistItem): PreloadAsset[] {
		const videoItem = item as VideoPlaylistItem;
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
			const trackUrl = track.file;
			if (trackUrl && typeof trackUrl === 'string') {
				assets.push({ url: trackUrl, category: 'subtitle', mode: 'auto' });
			}
		}

		return assets;
	}
}
