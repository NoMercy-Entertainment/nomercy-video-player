// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { TwitchSource } from './url';
import { postGql } from './gql';

const CLIP_TITLE = 'query TwitchClipTitle($slug: ID!) { clip(slug: $slug) { title } }';
const VIDEO_TITLE = 'query TwitchVideoTitle($id: ID!) { video(id: $id) { title } }';
const CHANNEL_TITLE = 'query TwitchChannelTitle($login: String!) { user(login: $login) { displayName broadcastSettings { title } } }';

interface TitleData {
	clip?: { title: string } | null;
	video?: { title: string } | null;
	user?: { displayName: string; broadcastSettings: { title: string } | null } | null;
}

/** Asks Twitch what a clip, VOD or channel is called. A channel with no stream title gets its display name. */
export async function lookUpTitle(source: TwitchSource, clientId?: string, signal?: AbortSignal): Promise<string | undefined> {
	if (source.type === 'clip')
		return (await postGql<TitleData>(CLIP_TITLE, { slug: source.slug }, clientId, signal))?.clip?.title;

	if (source.type === 'video')
		return (await postGql<TitleData>(VIDEO_TITLE, { id: source.video.replace(/^v/u, '') }, clientId, signal))?.video?.title;

	const user = (await postGql<TitleData>(CHANNEL_TITLE, { login: source.channel }, clientId, signal))?.user;

	return user?.broadcastSettings?.title || user?.displayName;
}
