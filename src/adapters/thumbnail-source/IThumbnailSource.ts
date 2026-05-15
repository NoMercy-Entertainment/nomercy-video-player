
import type { BasePlaylistItem } from '@nomercy-entertainment/nomercy-player-core';

/**
 * A resolved thumbnail for a specific time offset.
 *
 * The sprite coordinates (`x`, `y`, `w`, `h`) describe the sub-region of
 * `spriteUrl` to render. All four are zero when the source is a per-frame
 * standalone image (non-sprite VTT) or when the adapter packs one image
 * per cue.
 */
export interface ThumbnailFrame {
	/** URL of the sprite image (or standalone frame image). */
	spriteUrl: string;
	/** Left offset within the sprite, in pixels. */
	x: number;
	/** Top offset within the sprite, in pixels. */
	y: number;
	/** Width of the sub-region, in pixels. */
	w: number;
	/** Height of the sub-region, in pixels. */
	h: number;
	/** Cue start time in seconds. */
	start: number;
	/** Cue end time in seconds. */
	end: number;
}

/**
 * Contract for anything that can supply thumbnail frames for a playlist item.
 *
 * Implementations are registered on the player and queried when the user
 * hovers the progress bar. The default implementation (`VttSpriteThumbnailSource`)
 * fetches a WebVTT sprite manifest and parses it into `ThumbnailFrame` objects.
 */
export interface IThumbnailSource {
	/**
	 * Load thumbnails for a playlist item. Called once per item when the
	 * backend fires `loadedmetadata`. Implementations should fetch and cache
	 * the data here — `lookup` must be synchronous.
	 *
	 * @returns `true` when thumbnails are available for this item, `false` when
	 *   the item has no thumbnail source (e.g. no `previewSpriteUrl` field).
	 */
	load(item: BasePlaylistItem): Promise<boolean>;

	/**
	 * Return the thumbnail frame covering `timeSeconds`, or `null` when no
	 * frame is available. Must be synchronous — called on every scrub event.
	 */
	lookup(timeSeconds: number): ThumbnailFrame | null;

	/** Release any cached data for the current item. Called on unload/dispose. */
	unload(): void;
}
