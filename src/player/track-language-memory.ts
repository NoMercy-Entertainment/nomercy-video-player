// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { IStorage, SubtitleTrack } from '@nomercy-entertainment/nomercy-player-core';

const AUDIO_KEY = 'nmplayer-language-audio';
const SUBTITLE_KEY = 'nmplayer-language-subtitle';

/** Recorded when the viewer turns subtitles off, so a later item stays off. */
export const SUBTITLES_OFF = 'off';

/**
 * The viewer's last chosen audio and subtitle language, carried from one item
 * to the next.
 *
 * A choice is a language, never a track index: an index means a different
 * language on every file, and the master playlist's own DEFAULT flag follows
 * the source's stream order, so neither survives an episode change. Remembering
 * the language is what makes the next episode open in the language the viewer
 * picked, whatever the encode declared.
 *
 * A caption choice is more than a language. A viewer who picked English SDH and
 * got plain English back was handed a different track under the same name, and
 * two renditions of the same language and variant can differ only by container
 * — an `.ass` carries the show's own styling where a `.vtt` does not. So the
 * variant and the format travel with the language.
 */
export class TrackLanguageMemory {
	private audio: string | null = null;
	private subtitle: SubtitleChoice | null = null;

	constructor(private readonly storage?: IStorage) {
		this.audio = this.read(AUDIO_KEY);
		this.subtitle = parseSubtitleChoice(this.read(SUBTITLE_KEY));
	}

	audioLanguage(): string | null {
		return this.audio;
	}

	/** The caption choice, or `null` when the viewer has never made one. */
	subtitleChoice(): SubtitleChoice | null {
		return this.subtitle;
	}

	rememberAudio(language: string | null | undefined): void {
		if (!language)
			return;
		this.audio = language;
		this.write(AUDIO_KEY, language);
	}

	/** Pass `SUBTITLES_OFF` for a deliberate off; `undefined` is not a choice. */
	rememberSubtitle(choice: SubtitleTrack | typeof SUBTITLES_OFF | null | undefined): void {
		if (!choice)
			return;
		const next: SubtitleChoice | null = choice === SUBTITLES_OFF
			? SUBTITLES_OFF
			: descriptorOf(choice);
		if (!next)
			return;
		this.subtitle = next;
		this.write(SUBTITLE_KEY, typeof next === 'string' ? next : JSON.stringify(next));
	}

	private read(key: string): string | null {
		try {
			const raw = this.storage?.get?.(key);
			return typeof raw === 'string' && raw.length > 0 ? raw : null;
		}
		catch {
			return null;
		}
	}

	private write(key: string, value: string): void {
		try {
			void this.storage?.set?.(key, value);
		}
		catch {
			// A viewer with site data blocked still gets the in-memory carry-over.
		}
	}
}

/** A caption choice: a deliberate off, or the language / variant / format picked. */
export type SubtitleChoice = typeof SUBTITLES_OFF | SubtitleDescriptor;

export interface SubtitleDescriptor {
	language: string;
	type?: string;
	format?: string;
}

function descriptorOf(track: SubtitleTrack): SubtitleDescriptor | null {
	return track.language ? { language: track.language, type: track.type, format: formatOf(track) } : null;
}

/** The file's format, taken from its URL — the manifest does not carry one. */
export function formatOf(track: Pick<SubtitleTrack, 'url'>): string | undefined {
	const path = track.url?.split(/[?#]/)[0] ?? '';
	const dot = path.lastIndexOf('.');
	const slash = path.lastIndexOf('/');
	return dot > slash && dot >= 0 ? path.slice(dot + 1).toLowerCase() : undefined;
}

// A viewer upgrading from a build that stored a bare language keeps their
// choice: the plain tag is read as a descriptor with nothing narrowing it.
function parseSubtitleChoice(raw: string | null): SubtitleChoice | null {
	if (!raw)
		return null;
	if (raw === SUBTITLES_OFF)
		return SUBTITLES_OFF;
	if (!raw.startsWith('{'))
		return { language: raw };
	try {
		const parsed = JSON.parse(raw) as SubtitleDescriptor;
		return typeof parsed?.language === 'string' ? parsed : null;
	}
	catch {
		return null;
	}
}

/**
 * The track that answers a caption choice, narrowest match first.
 *
 * A list filtered by device capability can drop the exact variant, and a viewer
 * is better served by the same language in a different flavour than by no
 * captions at all. Position is never consulted: it means a different track on
 * every file. The language step is passed in because the player owns the
 * prefix rules (`en` answering `en-US`).
 */
export function matchSubtitleTrack(
	tracks: ReadonlyArray<SubtitleTrack>,
	wanted: SubtitleDescriptor,
	matchLanguage: (languages: Array<string | undefined>, wantedLanguage: string) => number,
): number {
	const exact = tracks.findIndex(track => track.language === wanted.language
		&& track.type === wanted.type
		&& formatOf(track) === wanted.format);
	if (exact >= 0)
		return exact;

	const sameVariant = tracks.findIndex(track => track.language === wanted.language && track.type === wanted.type);
	if (sameVariant >= 0)
		return sameVariant;

	const byLanguage = matchLanguage(tracks.map(track => track.language), wanted.language);
	return byLanguage < 0 ? byLanguage : preferFullVariant(tracks, byLanguage);
}

// Server order puts a sign or forced track ahead of the full one often enough
// that "first track in the language" shows only the signs.
function preferFullVariant(tracks: ReadonlyArray<SubtitleTrack>, matched: number): number {
	const language = tracks[matched]?.language;
	const full = tracks.findIndex(track => track.language === language && track.type === 'full');
	if (full >= 0)
		return full;

	const plain = tracks.findIndex(track => track.language === language && track.type !== 'sign' && track.type !== 'forced');
	return plain >= 0 ? plain : matched;
}
