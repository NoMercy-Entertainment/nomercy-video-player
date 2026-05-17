
import type { BasePlaylistItem, Chapter } from '@nomercy-entertainment/nomercy-player-core';

import type { IChapterSource } from './IChapterSource';

/**
 * Default chapter source. Reads chapters from the item's typed `chapters`
 * array when the consumer pre-populates it directly.
 *
 * VTT chapter cue format expected:
 *   ```
 *   00:00:00.000 --> 00:04:30.000
 *   Opening
 *   ```
 *
 * This is the format produced by the NoMercy media-server chapter extractor
 * and is compatible with standard WebVTT chapter tooling.
 */
export class VttChapterSource implements IChapterSource {
	private _chapters: Chapter[] = [];

	async load(item: BasePlaylistItem): Promise<Chapter[]> {
		this._chapters = [];

		const typed = item as BasePlaylistItem & {
			chapters?: Chapter[];
		};

		// Inline chapters — consumer pre-supplied the list.
		if (Array.isArray(typed.chapters) && typed.chapters.length > 0) {
			this._chapters = typed.chapters;
			return this._chapters;
		}

		return [];
	}

	current(timeSeconds: number): Chapter | null {
		for (const chapter of this._chapters) {
			if (timeSeconds >= chapter.start && timeSeconds < chapter.end) return chapter;
		}
		return null;
	}

	all(): Chapter[] {
		return this._chapters;
	}

	unload(): void {
		this._chapters = [];
	}
}
