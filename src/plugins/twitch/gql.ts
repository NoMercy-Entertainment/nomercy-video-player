// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

const GQL_URL = 'https://gql.twitch.tv/gql';
const WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

/**
 * Sends one query to Twitch's web API. Uses plain `fetch` on purpose: `Plugin.fetch` adds
 * the player's bearer token to every request, and a media server's token must never reach Twitch.
 */
export async function postGql<Data>(query: string, variables: object, clientId: string = WEB_CLIENT_ID, signal?: AbortSignal): Promise<Data | undefined> {
	const response = await fetch(GQL_URL, {
		method: 'POST',
		headers: { 'Client-Id': clientId },
		body: JSON.stringify({ query, variables }),
		signal,
	});
	const { data }: { data?: Data } = await response.json();

	return data;
}
