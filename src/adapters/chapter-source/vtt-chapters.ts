
import type { BasePlaylistItem, Chapter } from '@nomercy-entertainment/nomercy-player-core';

import type { IChapterSource } from './IChapterSource';

/**
 * Default chapter source. Reads a WebVTT chapter file from the item's
 * `tracks` list (any entry with `kind === 'chapters'`) or from
 * `item.chapters` when the consumer pre-populates the array directly.
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
			tracks?: Array<{ kind?: string; file?: string; label?: string }>;
		};

		// Inline chapters take priority — consumer pre-supplied the list.
		if (Array.isArray(typed.chapters) && typed.chapters.length > 0) {
			this._chapters = typed.chapters;
			return this._chapters;
		}

		// Look for a VTT chapter track in the sidecar tracks list.
		const chapterTrack = typed.tracks?.find(
			track => track.kind === 'chapters' && typeof track.file === 'string' && track.file,
		);
		if (!chapterTrack?.file) return [];

		const parsed = await this._fetchAndParse(chapterTrack.file);
		this._chapters = parsed;
		return parsed;
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

	private async _fetchAndParse(url: string): Promise<Chapter[]> {
		try {
			const response = await fetch(url);
			if (!response.ok) return [];
			const text = await response.text();
			return parseVttChapters(text);
		}
		catch {
			return [];
		}
	}
}

/**
 * Parse a WebVTT chapter file into a `Chapter[]`.
 * Each cue's timing maps to chapter `start`/`end`; the cue body is the title.
 */
function parseVttChapters(text: string): Chapter[] {
	if (!text) return [];

	const stripped = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
	const blocks = stripped.replace(/\r\n|\r/g, '\n').split(/\n{2,}/);
	const chapters: Chapter[] = [];

	for (const block of blocks) {
		const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
		if (lines.length === 0) continue;

		const timingIdx = lines.findIndex(line => line.includes('-->'));
		if (timingIdx < 0) continue;

		const [startStr, endPart] = lines[timingIdx]!.split('-->');
		// Strip any WebVTT cue settings that may follow the end timestamp.
		const endStr = endPart?.trim().split(/\s+/)[0] ?? '';
		const start = parseTimestamp(startStr?.trim() ?? '');
		const end = parseTimestamp(endStr);
		if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

		const title = lines.slice(timingIdx + 1).join(' ').trim();
		if (!title) continue;

		chapters.push({
			index: chapters.length,
			start,
			end,
			title,
		});
	}

	return chapters;
}

function parseTimestamp(s: string): number {
	const match = s.match(/(?:(\d+):)?(\d+):(\d+)\.(\d{1,3})/);
	if (!match) return Number.NaN;

	const hours = match[1] ? Number(match[1]) : 0;
	const minutes = Number(match[2]);
	const seconds = Number(match[3]);
	const millis = Number(match[4]!.padEnd(3, '0'));

	return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}
