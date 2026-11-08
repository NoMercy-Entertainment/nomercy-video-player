// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Sprite / scrub-preview mixin — VTT sprite loading, thumbnail painting, and
 * scrub-time / pop-offset helpers.
 *
 * `sprite.ts` owns the pure free functions (getScrubTime, clampPopOffset,
 * paintSpriteAt, resolveSpriteUrl, loadSpriteSet). This mixin binds them to the
 * plugin's sliderRefs, spriteSet, spriteObjectUrl, and lifecycle-managed fetch.
 *
 * Owns: getScrubTime, clampPopOffset, paintSpriteAt, _resolveSpriteUrl,
 *       _revokeSpriteObjectUrl, loadSpritesForItem.
 */

import type { VideoPlaylistItem } from '@nomercy-entertainment/nomercy-video-player';

import type { DesktopUiInternals } from '../internals';

import { clampPopOffset, getScrubTime, loadSpriteSet, paintSpriteAt, resolveSpriteUrl } from '../helpers/sprite';

export const spriteMethods = {
	getScrubTime(this: DesktopUiInternals, event: Event): { scrubTime: number; scrubTimePlayer: number } {
		const win = this._isLive() ? this._liveWindow() : null;
		const scrub = getScrubTime(event, this.sliderRefs.sliderBar, win ? win.end - win.start : this.resolveDuration());
		return win ? { ...scrub, scrubTimePlayer: scrub.scrubTimePlayer + win.start } : scrub;
	},

	clampPopOffset(this: DesktopUiInternals, pct: number): number {
		return clampPopOffset(pct, this.sliderRefs.sliderPop, this.sliderRefs.sliderBar);
	},

	paintSpriteAt(this: DesktopUiInternals, time: number): void {
		paintSpriteAt(time, this.spriteSet, this.sliderRefs.sliderPopImage);
	},

	_resolveSpriteUrl(this: DesktopUiInternals, item: VideoPlaylistItem | undefined | null): string | undefined {
		return resolveSpriteUrl(item);
	},

	_revokeSpriteObjectUrl(this: DesktopUiInternals): void {
		if (this.spriteObjectUrl) {
			URL.revokeObjectURL(this.spriteObjectUrl);
			this.spriteObjectUrl = null;
		}
	},

	async loadSpritesForItem(this: DesktopUiInternals, item: VideoPlaylistItem | undefined | null): Promise<void> {
		const myToken = ++this.spriteLoadId;
		this.spriteSet = null;
		this._revokeSpriteObjectUrl();

		this.sliderRefs.sliderPopImage.style.backgroundImage = '';
		this.sliderRefs.sliderPopImage.style.backgroundPosition = '';
		this.sliderRefs.sliderPopImage.style.width = '';
		this.sliderRefs.sliderPopImage.style.height = '';

		const rawSpriteUrl = this._resolveSpriteUrl(item);
		if (!rawSpriteUrl)
			return;

		const spriteUrl = (await this.resolveUrl(rawSpriteUrl, 'image')).href;

		const set = await loadSpriteSet(spriteUrl, {
			fetchText: async (url) => {
				try {
					return await this.fetch<string>(url);
				}
				catch {
					return null;
				}
			},
			fetchImageUrl: async (url) => {
				try {
					const buffer = await this.fetch<ArrayBuffer>(url, { responseType: 'arrayBuffer' });
					return URL.createObjectURL(new Blob([buffer]));
				}
				catch {
					return null;
				}
			},
		});

		if (myToken !== this.spriteLoadId) {
			if (set?.spriteUrl.startsWith('blob:'))
				URL.revokeObjectURL(set.spriteUrl);
			return;
		}
		if (!set)
			return;

		if (set.spriteUrl.startsWith('blob:'))
			this.spriteObjectUrl = set.spriteUrl;

		this.spriteSet = set;
		this.sliderRefs.sliderPopImage.style.backgroundImage = `url('${set.spriteUrl}')`;
	},
} as const;
