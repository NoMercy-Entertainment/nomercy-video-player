// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { BasePlaylistItem } from '@nomercy-entertainment/nomercy-player-core';
import type { IVideoBackend } from '../adapters/video-backend/IVideoBackend';

/** Seconds past the lead that count as "the viewer left the window" (a seek back), so a tick on the edge does not flap. */
const LEAVE_MARGIN_SECONDS = 5;

/** Seconds of buffer the current item needs ahead of the playhead before extra bandwidth goes to the next one. */
const MIN_BUFFER_AHEAD_SECONDS = 10;

export interface NextItemWarmupDeps {
	/** Seconds before the end at which warming starts; `0` disables it. */
	leadSeconds: () => number;
	/** Media segments to fetch per stream. */
	segments: () => number;
	next: () => BasePlaylistItem | undefined;
	/** The URL `load()` will use for this item, so the warmed bodies match the real request. */
	resolveUrl: (item: BasePlaylistItem) => Promise<string>;
	backend: () => Pick<IVideoBackend, 'warm' | 'cancelWarm'> | undefined;
	/** Seconds of the current item already buffered past the playhead. */
	bufferedAhead: () => number;
	environment: () => { online: boolean; saveData: boolean };
}

/**
 * Warms the next queue item's opening seconds while the current one plays out,
 * so the item hand-off finds its manifests and first segments already in memory.
 * Driven by the player's `time` and `item` events and its dispose.
 */
export class NextItemWarmup {
	private _warmedId: string | number | undefined;
	private _generation = 0;

	constructor(private readonly _deps: NextItemWarmupDeps) {}

	onTime(currentTime: number, duration: number): void {
		const lead = this._deps.leadSeconds();
		if (lead <= 0 || duration <= 0)
			return;

		const remaining = duration - currentTime;

		if (this._warmedId !== undefined && remaining > lead + LEAVE_MARGIN_SECONDS) {
			this._cancel();
			return;
		}
		if (this._warmedId !== undefined || remaining > lead)
			return;

		const next = this._deps.next();
		if (next === undefined)
			return;

		const backend = this._deps.backend();
		if (typeof backend?.warm !== 'function')
			return;

		const { online, saveData } = this._deps.environment();
		if (!online || saveData)
			return;

		// Near the end the buffer can only reach the end, so the bar drops with the remaining time.
		if (this._deps.bufferedAhead() < Math.min(MIN_BUFFER_AHEAD_SECONDS, remaining - 1))
			return;

		this._warmedId = next.id;
		const generation = ++this._generation;
		const segments = this._deps.segments();

		void this._deps.resolveUrl(next).then(async (url) => {
			if (generation !== this._generation)
				return;
			await backend.warm?.(url, { segments });
		}).catch(() => {
			// Warming is an optimization: a failure leaves the normal load path untouched.
		});
	}

	/** The cursor moved. Warm data for the item that just became current is kept for its `load()`; anything else is dropped. */
	onItemChange(currentId: string | number | undefined): void {
		if (this._warmedId === undefined)
			return;
		if (this._warmedId === currentId) {
			this._warmedId = undefined;
			return;
		}
		this._cancel();
	}

	dispose(): void {
		this._cancel();
	}

	private _cancel(): void {
		this._generation++;
		this._warmedId = undefined;
		this._deps.backend()?.cancelWarm?.();
	}
}
