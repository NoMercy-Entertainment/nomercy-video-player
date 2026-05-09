

import { CastSenderPlugin as BaseCastSenderPlugin, translationsFromGlob } from '@nomercy-entertainment/nomercy-player-core';
import type { ChromeCastMediaCtors, Translations } from '@nomercy-entertainment/nomercy-player-core';
import type { NMVideoPlayer } from '../../index';
import type { VideoPlaylistItem } from '../../types';

export type { CastSenderEvents, CastSenderOptions } from '@nomercy-entertainment/nomercy-player-core';

/**
 * Video Cast sender — thin override of the kit's shared `CastSenderPlugin`.
 * Specializes only the bits that differ between music and video:
 *   - `'video/mp4'` default content type
 *   - `TvShowMediaMetadata` (when `item.show` is set) or
 *     `GenericMediaMetadata` builder reading `title` / `show` / `season` /
 *     `episode` / `poster` from the video item shape.
 *
 * Translations are auto-discovered from the `./i18n/*.ts` folder. Each file
 * default-exports its language bundle. Each plugin in the chain (kit base,
 * this subclass) ships ONLY its own keys — the kit's plugin registration
 * walks the prototype chain so both bundles end up in the table.
 *
 * Everything else — SDK probe, session lifecycle, RemotePlayer event
 * mirroring, forward* helpers, resume-on-disconnect — lives in the kit.
 */
export class CastSenderPlugin extends BaseCastSenderPlugin<NMVideoPlayer<any>, VideoPlaylistItem> {
	static override readonly id: string = 'cast-sender';
	static override readonly description: string = 'Chromecast sender — full media bridge for video';
	static override readonly translations: Translations = translationsFromGlob('./i18n/*.ts');

	/** Returns `'video/mp4'` as the default content type for video items. */
	protected override defaultContentType(): string {
		return 'video/mp4';
	}

	/** Builds a `TvShowMediaMetadata` or `GenericMediaMetadata` from the video item. */
	protected override async buildMetadata(
		item: VideoPlaylistItem,
		ctors: ChromeCastMediaCtors & {
			TvShowMediaMetadata?: new () => Record<string, unknown>;
			MovieMediaMetadata?: new () => Record<string, unknown>;
		},
	): Promise<unknown> {
		const x = item as VideoPlaylistItem & {
			show?: string;
			season?: number | string;
			episode?: number | string;
		};
		const isEpisode = x.show !== undefined && x.show !== '';
		const Ctor = isEpisode
			? (ctors.TvShowMediaMetadata ?? ctors.GenericMediaMetadata)
			: ctors.GenericMediaMetadata;
		const meta = new Ctor() as Record<string, unknown> & { images?: Array<{ url: string }> };

		meta['title'] = item.title ?? '';
		if (isEpisode) {
			meta['seriesTitle'] = x.show;
			if (x.season !== undefined) meta['season'] = Number(x.season);
			if (x.episode !== undefined) meta['episode'] = Number(x.episode);
		}
		else if (x.show) {
			meta['subtitle'] = x.show;
		}
		if (item.poster) {
			const posterUrl = (await this.resolveUrl(item.poster, 'poster')).href;
			meta.images = [{ url: posterUrl }];
		}
		return meta;
	}
}

/** Plugin alias for the video {@link CastSenderPlugin}. Pass to `addPlugin(castSenderPlugin)`. */
export const castSenderPlugin = CastSenderPlugin;
