// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { postGql } from './gql';

const USHER_URL = 'https://usher.ttvnw.net';
const CHANNEL_TOKEN = `query TwitchChannelToken($login: String!) {
	user(login: $login) { stream { id } }
	streamPlaybackAccessToken(channelName: $login, params: { platform: "web", playerBackend: "mediaplayer", playerType: "site" }) { value signature }
}`;

interface StreamData {
	streamPlaybackAccessToken?: { value: string; signature: string } | null;
	user?: { stream: { id: string } | null } | null;
}

/** Finds the HLS address of a live channel. A channel that is not streaming has none. */
export async function lookUpLiveStream(channel: string, clientId?: string, signal?: AbortSignal): Promise<string | undefined> {
	const data = await postGql<StreamData>(CHANNEL_TOKEN, { login: channel }, clientId, signal);
	const token = data?.streamPlaybackAccessToken;
	if (!data?.user?.stream || !token)
		return undefined;

	const query = new URLSearchParams({ allow_source: 'true', player: 'twitchweb', sig: token.signature, token: token.value });

	return `${USHER_URL}/api/channel/hls/${channel}.m3u8?${query}`;
}

/** Wraps the address for the proxy. The `.m3u8` ending is what makes the player treat it as HLS. */
export function proxiedUrl(proxyUrl: string, target: string): string {
	const encoded = btoa(target).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');

	return `${proxyUrl}/${encoded}/index.m3u8`;
}
