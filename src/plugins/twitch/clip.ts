// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { IStreamFactory, IStreamSource, StreamFactoryOptions, StreamSourceState } from '@nomercy-entertainment/nomercy-player-core';
import { postGql } from './gql';
import { parseTwitchUrl } from './url';

const CLIP_QUERY = `query TwitchClip($slug: ID!) {
	clip(slug: $slug) {
		title
		durationSeconds
		videoQualities { quality sourceURL }
		playbackAccessToken(params: { platform: "web", playerType: "embed", playerBackend: "mediaplayer" }) { signature value }
	}
}`;

/** Looks up the address of the playable file for a clip slug. */
export type ClipFileResolver = (slug: string) => Promise<string>;

/** A clip's playable file and what Twitch says about it. */
export interface ResolvedClip {
	url: string;
	title: string;
	duration: number;
}

interface ClipQuality {
	quality: string;
	sourceURL: string;
}

interface ClipData {
	clip?: {
		title: string;
		durationSeconds: number;
		videoQualities: ClipQuality[] | null;
		playbackAccessToken: { signature: string; value: string } | null;
	} | null;
}

/** Picks the tallest rendition Twitch lists for a clip. */
function highestQuality(qualities: readonly ClipQuality[]): ClipQuality | undefined {
	return [...qualities].sort((first, second) => Number(second.quality) - Number(first.quality))[0];
}

/** Asks Twitch for a clip's highest-quality file. */
export async function lookUpClip(slug: string, clientId?: string, signal?: AbortSignal): Promise<ResolvedClip | undefined> {
	const clip = (await postGql<ClipData>(CLIP_QUERY, { slug }, clientId, signal))?.clip;
	const file = highestQuality(clip?.videoQualities ?? []);

	if (!clip?.playbackAccessToken || !file)
		return undefined;

	const { signature, value } = clip.playbackAccessToken;

	return {
		url: `${file.sourceURL}?sig=${signature}&token=${encodeURIComponent(value)}`,
		title: clip.title,
		duration: clip.durationSeconds,
	};
}

/** A clip link is only a name, so the file address is looked up as the source attaches. */
class ClipStream implements IStreamSource {
	readonly kind = 'native' as const;

	private element: HTMLMediaElement | undefined;
	private current: StreamSourceState = 'idle';
	private readonly slug: string;
	private readonly resolveFile: ClipFileResolver;

	constructor(slug: string, resolveFile: ClipFileResolver) {
		this.slug = slug;
		this.resolveFile = resolveFile;
	}

	/** Resolves the file, hands it to the element, and settles once metadata is in. */
	async attach(element: HTMLMediaElement): Promise<void> {
		this.element = element;
		this.current = 'loading';

		element.src = await this.resolveFile(this.slug);
		await new Promise<void>((resolve, reject) => {
			element.addEventListener('loadedmetadata', () => resolve(), { once: true });
			element.addEventListener('error', () => reject(element.error ?? new Error(`Clip ${this.slug} failed to load`)), { once: true });
		});

		this.current = 'ready';
	}

	/** Removes the file from the element. */
	detach(): void {
		this.element?.removeAttribute('src');
		this.element = undefined;
		this.current = 'idle';
	}

	/** Detaches; a clip holds nothing else to release. */
	destroy(): void {
		this.detach();
	}

	/** Current lifecycle state. */
	state(): StreamSourceState {
		return this.current;
	}

	// One fixed file raises nothing beyond what the media element already reports.
	on(): void {}
	off(): void {}
}

/** Builds the stream factory that claims Twitch clip links. */
export function clipStreamFactory(resolveFile: ClipFileResolver): IStreamFactory {
	return {
		id: 'twitch-clip',
		canPlay: url => parseTwitchUrl(url)?.type === 'clip',
		create(options: StreamFactoryOptions): IStreamSource {
			const source = parseTwitchUrl(options.url);
			if (source?.type !== 'clip')
				throw new Error(`${options.url} is not a Twitch clip link`);

			return new ClipStream(source.slug, resolveFile);
		},
	};
}
