
import type { BasePlaylistItem, Chapter } from '@nomercy-entertainment/nomercy-player-core';

/**
 * Contract for anything that can supply a chapter list for a playlist item.
 *
 * Implementations are registered on the player and queried after each item
 * loads. The default implementation (`VttChapterSource`) fetches a WebVTT
 * chapter file from the item's `tracks` list (kind = "chapters") and parses
 * the cue text as chapter titles.
 */
export interface IChapterSource {
	/**
	 * Load chapters for a playlist item. Called after `loadedmetadata`.
	 * Implementations fetch and cache the chapter list here so `chapters()`
	 * is synchronous.
	 *
	 * @returns The resolved chapter list, or an empty array when no chapters
	 *   are available for this item.
	 */
	load(item: BasePlaylistItem): Promise<Chapter[]>;

	/**
	 * Return the chapter that is active at `timeSeconds`, or `null` when
	 * the time falls outside all chapters (e.g. before the first or after
	 * the last). Must be synchronous.
	 */
	current(timeSeconds: number): Chapter | null;

	/** The complete chapter list for the current item. Synchronous. */
	all(): Chapter[];

	/** Release cached chapter data. Called on unload/dispose. */
	unload(): void;
}
