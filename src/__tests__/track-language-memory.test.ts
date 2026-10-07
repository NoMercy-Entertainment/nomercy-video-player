// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { IStorage, SubtitleTrack } from '@nomercy-entertainment/nomercy-player-core';
import { describe, expect, it } from 'vitest';
import { matchSubtitleTrack, SUBTITLES_OFF, TrackLanguageMemory } from '../player/track-language-memory';

function fakeStorage(seed: Record<string, string> = {}): IStorage {
	const store = new Map(Object.entries(seed));
	return {
		get: (key: string) => store.get(key) ?? null,
		set: (key: string, value: string) => { store.set(key, value); },
		remove: (key: string) => { store.delete(key); },
		clear: () => { store.clear(); },
	} as unknown as IStorage;
}

const sdh: SubtitleTrack = {
	id: 's1',
	language: 'eng',
	label: 'English (SDH)',
	type: 'sdh',
	url: 'https://media.example.test/show/s01e01/subtitles/s01e01.eng.sdh.ass',
};

describe('trackLanguageMemory', () => {
	it('carries the chosen audio language to the next item', () => {
		// Death Note ep 18 declares French DEFAULT=YES and Japanese fourth. The
		// viewer picking Japanese must not be undone by the next episode's own
		// stream order.
		const memory = new TrackLanguageMemory();

		expect(memory.audioLanguage()).toBeNull();
		memory.rememberAudio('jpn');
		expect(memory.audioLanguage()).toBe('jpn');
	});

	it('keeps the choice across sessions when storage is available', () => {
		const storage = fakeStorage();
		new TrackLanguageMemory(storage).rememberAudio('jpn');

		expect(new TrackLanguageMemory(storage).audioLanguage()).toBe('jpn');
	});

	it('remembers subtitles turned off as a deliberate choice', () => {
		const memory = new TrackLanguageMemory();
		memory.rememberSubtitle(SUBTITLES_OFF);

		expect(memory.subtitleChoice()).toBe(SUBTITLES_OFF);
	});

	it('ignores a track that reports no language rather than clearing the choice', () => {
		const memory = new TrackLanguageMemory();
		memory.rememberAudio('jpn');
		memory.rememberAudio(undefined);

		expect(memory.audioLanguage()).toBe('jpn');
	});

	it('remembers the variant and the format, not the language alone', () => {
		// English SDH and plain English carry the same tag, and an .ass carries
		// the show's own styling where the .vtt of the same line does not.
		const memory = new TrackLanguageMemory();
		memory.rememberSubtitle(sdh);

		expect(memory.subtitleChoice()).toEqual({ language: 'eng', type: 'sdh', format: 'ass' });
	});

	it('reads a bare language written by an older build as a choice', () => {
		const storage = fakeStorage({ 'nmplayer-language-subtitle': 'eng' });

		expect(new TrackLanguageMemory(storage).subtitleChoice()).toEqual({ language: 'eng' });
	});

	it('carries the whole caption choice across sessions', () => {
		const storage = fakeStorage();
		new TrackLanguageMemory(storage).rememberSubtitle(sdh);

		expect(new TrackLanguageMemory(storage).subtitleChoice())
			.toEqual({ language: 'eng', type: 'sdh', format: 'ass' });
	});

	it('survives a storage backend that throws on every access', () => {
		const hostile = {
			get: () => { throw new Error('site data blocked'); },
			set: () => { throw new Error('site data blocked'); },
		} as unknown as IStorage;

		const memory = new TrackLanguageMemory(hostile);
		memory.rememberAudio('jpn');

		expect(memory.audioLanguage()).toBe('jpn');
	});
});

// The player's own language step, mirrored: exact tag, then either prefix.
function matchLanguage(languages: Array<string | undefined>, wanted: string): number {
	const exact = languages.indexOf(wanted);
	if (exact >= 0)
		return exact;
	return languages.findIndex(lang => !!lang && (lang.startsWith(`${wanted}-`) || wanted.startsWith(`${lang}-`)));
}

const englishAss: SubtitleTrack = { id: '1', language: 'eng', label: 'English', type: 'full', url: 'S:/en.ass' };
const englishVtt: SubtitleTrack = { id: '2', language: 'eng', label: 'English', type: 'full', url: 'S:/en.vtt' };
const englishSdh: SubtitleTrack = { id: '3', language: 'eng', label: 'English (SDH)', type: 'sdh', url: 'S:/en.sdh.vtt' };
const dutch: SubtitleTrack = { id: '4', language: 'nld', label: 'Nederlands', type: 'full', url: 'S:/nl.vtt' };

describe('matchSubtitleTrack', () => {
	it('takes the rendition in the saved format over another of the same language', () => {
		const tracks = [englishVtt, englishAss];

		expect(matchSubtitleTrack(tracks, { language: 'eng', type: 'full', format: 'ass' }, matchLanguage)).toBe(1);
	});

	it('does not hand back a different variant while the saved one is present', () => {
		const tracks = [englishSdh, englishAss];

		expect(matchSubtitleTrack(tracks, { language: 'eng', type: 'full', format: 'ass' }, matchLanguage)).toBe(1);
	});

	it('falls back to the same language when the exact rendition is gone', () => {
		const tracks = [dutch, englishSdh];

		expect(matchSubtitleTrack(tracks, { language: 'eng', type: 'full', format: 'ass' }, matchLanguage)).toBe(1);
	});

	it('ignores the position the choice used to hold', () => {
		// Saved at index 0 on the previous episode; index 0 is Dutch here.
		const tracks = [dutch, englishAss];

		expect(matchSubtitleTrack(tracks, { language: 'eng', type: 'full', format: 'ass' }, matchLanguage)).toBe(1);
	});

	describe('when the language has several variants', () => {
		const englishSign: SubtitleTrack = { id: '5', language: 'eng', label: 'English (Signs)', type: 'sign', url: 'S:/en.sign.ass' };
		const englishForced: SubtitleTrack = { id: '6', language: 'eng', label: 'English (Forced)', type: 'forced', url: 'S:/en.forced.ass' };

		it('prefers the full track over a sign track listed first when only a language is wanted', () => {
			const tracks = [englishSign, englishAss];

			expect(matchSubtitleTrack(tracks, { language: 'eng' }, matchLanguage)).toBe(1);
		});

		it('prefers the full track over sign and forced tracks when the saved variant is gone', () => {
			const tracks = [englishForced, englishSign, englishVtt];

			expect(matchSubtitleTrack(tracks, { language: 'eng', type: 'alt', format: 'ass' }, matchLanguage)).toBe(2);
		});

		it('takes a sign track when it is the only one in the language', () => {
			expect(matchSubtitleTrack([dutch, englishSign], { language: 'eng' }, matchLanguage)).toBe(1);
		});
	});

	it('reports no match rather than guessing a language the item does not carry', () => {
		expect(matchSubtitleTrack([dutch], { language: 'eng' }, matchLanguage)).toBe(-1);
	});
});
