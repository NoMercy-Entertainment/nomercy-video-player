// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Only the viewer's own caption pick is remembered. A pick the player makes by
 * itself (the language default, a restore) must not become the saved choice,
 * and a sign or forced variant saved by an older build that never recorded who
 * picked it must not beat the full track.
 */

import type { IStorage, SubtitleTrack } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NMVideoPlayer } from '../index';
import { matchSubtitleTrack, TrackLanguageMemory } from '../player/track-language-memory';

const KEY = 'nmplayer-language-subtitle';

function fakeStorage(seed: Record<string, string> = {}): IStorage & { dump: () => Map<string, string> } {
	const store = new Map(Object.entries(seed));
	return {
		get: (key: string) => store.get(key) ?? null,
		set: (key: string, value: string) => { store.set(key, value); },
		remove: (key: string) => { store.delete(key); },
		clear: () => { store.clear(); },
		dump: () => store,
	} as unknown as IStorage & { dump: () => Map<string, string> };
}

function matchLanguage(languages: Array<string | undefined>, wanted: string): number {
	return languages.indexOf(wanted);
}

// The shape the media server sends for That Time I Got Reincarnated as a Slime
// S01E14: English full first, English sign fifth.
function track(id: string, language: string, type: string): SubtitleTrack {
	return { id, language, label: id, type, url: `S:/${id}.${language}.${type}.ass`, kind: 'subtitles', default: false } as SubtitleTrack;
}
const episode: SubtitleTrack[] = [
	track('a', 'eng', 'full'),
	track('b', 'ara', 'full'),
	track('c', 'ger', 'full'),
	track('d', 'fre', 'full'),
	track('e', 'eng', 'sign'),
];

describe('a caption choice saved without an explicit-pick marker', () => {
	it('does not let a saved sign variant beat the full track', () => {
		const legacy = fakeStorage({ [KEY]: JSON.stringify({ language: 'eng', type: 'sign', format: 'ass' }) });
		const wanted = new TrackLanguageMemory(legacy).subtitleChoice();

		expect(wanted).not.toBe('off');
		expect(matchSubtitleTrack(episode, wanted as { language: string }, matchLanguage)).toBe(0);
	});

	it('does not let a saved forced variant beat the full track', () => {
		const legacy = fakeStorage({ [KEY]: JSON.stringify({ language: 'eng', type: 'forced', format: 'ass' }) });
		const wanted = new TrackLanguageMemory(legacy).subtitleChoice();

		expect(matchSubtitleTrack(episode, wanted as { language: string }, matchLanguage)).toBe(0);
	});

	it('keeps a saved sdh variant, which was never a poisoned default', () => {
		const legacy = fakeStorage({ [KEY]: JSON.stringify({ language: 'eng', type: 'sdh', format: 'ass' }) });

		expect(new TrackLanguageMemory(legacy).subtitleChoice()).toEqual({ language: 'eng', type: 'sdh', format: 'ass' });
	});
});

describe('an explicit sign pick', () => {
	it('persists across sessions and still wins over the full track', () => {
		const storage = fakeStorage();
		new TrackLanguageMemory(storage).rememberSubtitle(episode[4]);

		const wanted = new TrackLanguageMemory(storage).subtitleChoice();
		expect(matchSubtitleTrack(episode, wanted as { language: string }, matchLanguage)).toBe(4);
	});
});

describe('nMVideoPlayer subtitle memory', () => {
	let storage: ReturnType<typeof fakeStorage>;

	beforeEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
		storage = fakeStorage();
	});

	afterEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	async function probe(): Promise<NMVideoPlayer> {
		const player = new NMVideoPlayer('test').setup({ defaultSubtitleLanguage: 'eng', storage } as never);
		await player.ready();
		Object.assign(player, {
			subtitles: () => [track('e', 'eng', 'sign'), ...episode.slice(0, 4)],
			// The real setter emits the same event for any caller.
			subtitle: (idx?: number | null) => {
				if (idx === undefined)
					return null;
				(player as any).emit('subtitle', { track: idx });
			},
		});
		return player;
	}

	it('does not save the pick the player makes by itself on mediaReady', async () => {
		const player = await probe();
		(player as any).emit('mediaReady', {});

		expect(storage.dump().get(KEY)).toBeUndefined();
	});

	it('saves the pick the viewer makes', async () => {
		const player = await probe();
		(player as any).emit('mediaReady', {});
		player.subtitle(0);

		expect(JSON.parse(storage.dump().get(KEY) as string)).toMatchObject({ language: 'eng', type: 'sign', explicit: true });
	});
});
