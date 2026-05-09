/**
 * English video-specific cast translations. Picked up by the plugin's glob
 * discovery — drop a sibling `<tag>.ts` to add a language.
 */
export default {
	'plugin.cast-sender.casting.movie': 'Casting "{title}"',
	'plugin.cast-sender.casting.episode': 'Casting {show} S{season}E{episode}: {title}',
	'plugin.cast-sender.casting.live': 'Casting live: {title}',
	'plugin.cast-sender.action.cast-from-here': 'Cast from this point',
	'plugin.cast-sender.action.continue-on-tv': 'Continue on TV',
} satisfies Record<string, string>;
