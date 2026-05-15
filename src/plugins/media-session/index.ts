

import { MediaSessionPlugin as BaseMediaSession } from '@nomercy-entertainment/nomercy-player-core/plugins/media-session';
import type { MediaSessionMetadata } from '@nomercy-entertainment/nomercy-player-core/plugins/media-session';
import type { NMVideoPlayer } from '../../index';
import type { VideoPlaylistItem } from '../../types';

/**
 * Video-specific MediaSession integration. Pulls show / season / poster off
 * the playlist item so OS "Now Playing" surfaces TV-style metadata. Falls
 * back to title / year when the show fields aren't present.
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
		const base = this.opts?.artworkBaseUrl ?? '';
		const posterSrc = item.poster
			? (base ? `${base}${item.poster}` : item.poster)
			: undefined;
		const seasonText = x.season !== undefined && x.season !== null && String(x.season) !== ''
			? `Season ${x.season}`
			: '';
		return {
			title: item.title ?? x.name ?? '',
			artist: x.show ?? (x.year !== undefined ? String(x.year) : ''),
			album: seasonText,
			artwork: posterSrc ? [{ src: posterSrc, sizes: '512x512' }] : undefined,
		};
	}
}

export const mediaSessionPlugin = MediaSessionPlugin;
