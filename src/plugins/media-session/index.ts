import { MediaSessionPlugin as BaseMediaSession } from '@nomercy-entertainment/nomercy-player-core/plugins/media-session';
import type { MediaSessionMetadata } from '@nomercy-entertainment/nomercy-player-core/plugins/media-session';
import type { NMVideoPlayer } from '../../index';
import type { VideoPlaylistItem } from '../../types';

/**
 * Video-specific MediaSession integration. Overrides text metadata only —
 * artwork resolution lives in the kit base class and flows through
 * `resolveUrl(url, 'poster')`, which consults `imageBasePath`.
 *
 * Fills `artist` with the show name (or year as fallback) and `album` with
 * the season label so OS "Now Playing" surfaces TV-style metadata for series.
 */
export class MediaSessionPlugin extends BaseMediaSession<NMVideoPlayer<any>, VideoPlaylistItem> {
	static override readonly id: string = 'media-session';

	protected override getMetadata(item: VideoPlaylistItem): MediaSessionMetadata {
		const x = item as VideoPlaylistItem & {
			name?: string;
			show?: string;
			season?: number | string;
			year?: number | string;
		};
		const seasonText = x.season !== undefined && x.season !== null && String(x.season) !== ''
			? `Season ${x.season}`
			: '';
		return {
			title: item.title ?? x.name ?? '',
			artist: x.show ?? (x.year !== undefined ? String(x.year) : ''),
			album: seasonText,
		};
	}
}

export const mediaSessionPlugin = MediaSessionPlugin;
