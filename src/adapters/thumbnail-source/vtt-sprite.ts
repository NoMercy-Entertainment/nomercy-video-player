
import type { BasePlaylistItem } from '@nomercy-entertainment/nomercy-player-core';

import { loadSpriteSet, lookupCue } from '../../plugins/desktop-ui/sprite';
import type { SpriteSet } from '../../plugins/desktop-ui/sprite';

import type { IThumbnailSource, ThumbnailFrame } from './IThumbnailSource';

/**
 * Default thumbnail source. Fetches a WebVTT sprite manifest from
 * `item.previewSpriteUrl`, parses the cue list, preloads the sprite image,
 * and exposes synchronous `lookup(time)` for progress-bar hover rendering.
 *
 * The VTT cue body format expected is:
 *   `sprite.webp#xywh=x,y,w,h`
 *
 * This is the format produced by NoMercy's media-server sprite generator
 * and is compatible with industry-standard tooling (ffmpeg tileify filters,
 * JW Player sprite format).
 */
export class VttSpriteThumbnailSource implements IThumbnailSource {
	private _cache: SpriteSet | null = null;

	async load(item: BasePlaylistItem): Promise<boolean> {
		this._cache = null;

		const spriteUrl = this._resolveSpriteUrl(item);
		if (!spriteUrl) return false;

		const spriteSet = await loadSpriteSet(spriteUrl);
		if (!spriteSet) return false;

		this._cache = spriteSet;
		return true;
	}

	lookup(timeSeconds: number): ThumbnailFrame | null {
		if (!this._cache) return null;

		const cue = lookupCue(this._cache, timeSeconds);
		if (!cue) return null;

		return {
			spriteUrl: cue.url,
			x: cue.x,
			y: cue.y,
			w: cue.w,
			h: cue.h,
			start: cue.start,
			end: cue.end,
		};
	}

	unload(): void {
		this._cache = null;
	}

	private _resolveSpriteUrl(item: BasePlaylistItem): string | undefined {
		const typed = item as BasePlaylistItem & { previewSpriteUrl?: string };
		return typeof typed.previewSpriteUrl === 'string' && typed.previewSpriteUrl
			? typed.previewSpriteUrl
			: undefined;
	}
}
