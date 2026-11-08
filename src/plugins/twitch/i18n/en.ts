// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

const translations = {
	'plugin.twitch.error.clip-unavailable': 'Twitch has no playable file for clip {slug}',
	'plugin.twitch.channel.offline': '{channel} is offline',
	'plugin.twitch.channel.ended': 'The stream by {channel} has ended',
	'plugin.twitch.setting.use-twitch-player': 'Use Twitch\'s own player',
	'plugin.twitch.subtitle.enabled': 'Enabled',
};

/** Canonical translation key set for the Twitch plugin, derived from English. */
export type TwitchTranslationKey = keyof typeof translations;

export default translations;
