/**
 * English video-specific cast translations. Picked up by the plugin's glob
 * discovery — drop a sibling `<tag>.ts` to add a language.
 */
export default {
	'plugin.desktop-ui.tooltip.play': 'Play / Pause',
	'plugin.desktop-ui.tooltip.previous': 'Previous',
	'plugin.desktop-ui.tooltip.next': 'Next',
	'plugin.desktop-ui.tooltip.seekBack': 'Seek back 10 s',
	'plugin.desktop-ui.tooltip.seekForward': 'Seek forward 10 s',
	'plugin.desktop-ui.tooltip.chapterPrev': 'Previous chapter',
	'plugin.desktop-ui.tooltip.chapterNext': 'Next chapter',
	'plugin.desktop-ui.tooltip.mute': 'Mute / Unmute',
	'plugin.desktop-ui.tooltip.aspectRatio': 'Aspect ratio',
	'plugin.desktop-ui.tooltip.theater': 'Theater mode',
	'plugin.desktop-ui.tooltip.pip': 'Picture-in-picture',
	'plugin.desktop-ui.tooltip.speed': 'Playback speed',
	'plugin.desktop-ui.tooltip.subtitles': 'Subtitles',
	'plugin.desktop-ui.tooltip.audio': 'Audio track',
	'plugin.desktop-ui.tooltip.quality': 'Quality',
	'plugin.desktop-ui.tooltip.playlist': 'Episodes',
	'plugin.desktop-ui.tooltip.settings': 'Settings',
	'plugin.desktop-ui.tooltip.fullscreen': 'Fullscreen',
	'plugin.desktop-ui.tooltip.nextWithTitle': 'Next: {title}',
	'plugin.desktop-ui.tooltip.previousWithTitle': 'Previous: {title}',
	'plugin.desktop-ui.tooltip.nextChapterWithTitle': 'Next chapter: {title}',
	'plugin.desktop-ui.tooltip.previousChapterWithTitle': 'Previous chapter: {title}',

	// Shortcuts overlay
	'plugin.desktop-ui.shortcuts.title': 'Keyboard shortcuts',
	'plugin.desktop-ui.shortcuts.hint': 'Press ? or Esc to close',
	'plugin.desktop-ui.shortcuts.hintToast': 'Press ? for keyboard shortcuts',

	// Playback group
	'plugin.desktop-ui.shortcuts.playPause': 'Play / Pause',
	'plugin.desktop-ui.shortcuts.stop': 'Stop',
	'plugin.desktop-ui.shortcuts.frameAdvance': 'Next frame (paused)',

	// Speed group
	'plugin.desktop-ui.shortcuts.speedUp': 'Speed up',
	'plugin.desktop-ui.shortcuts.speedDown': 'Speed down',
	'plugin.desktop-ui.shortcuts.normalSpeed': 'Normal speed (1×)',

	// Volume group
	'plugin.desktop-ui.shortcuts.volumeUp': 'Volume up',
	'plugin.desktop-ui.shortcuts.volumeDown': 'Volume down',
	'plugin.desktop-ui.shortcuts.mute': 'Mute / Unmute',

	// Seeking group
	'plugin.desktop-ui.shortcuts.seekBack5': 'Seek back 5 s',
	'plugin.desktop-ui.shortcuts.seekForward5': 'Seek forward 5 s',
	'plugin.desktop-ui.shortcuts.seek3s': 'Seek ±3 seconds',
	'plugin.desktop-ui.shortcuts.seek10s': 'Seek ±10 seconds',
	'plugin.desktop-ui.shortcuts.seek60s': 'Seek ±1 minute',

	// Quick seek group
	'plugin.desktop-ui.shortcuts.seek30s': 'Seek +30 seconds',
	'plugin.desktop-ui.shortcuts.seek60sKey': 'Seek +60 seconds',
	'plugin.desktop-ui.shortcuts.seek90s': 'Seek +90 seconds',
	'plugin.desktop-ui.shortcuts.seek120s': 'Seek +120 seconds',

	// Navigation group
	'plugin.desktop-ui.shortcuts.next': 'Next item',
	'plugin.desktop-ui.shortcuts.previous': 'Previous item',
	'plugin.desktop-ui.shortcuts.nextChapter': 'Next chapter',
	'plugin.desktop-ui.shortcuts.previousChapter': 'Previous chapter',

	// Tracks & subtitles group
	'plugin.desktop-ui.shortcuts.cycleSubs': 'Cycle subtitles',
	'plugin.desktop-ui.shortcuts.cycleAudio': 'Cycle audio',
	'plugin.desktop-ui.shortcuts.cycleAspect': 'Cycle aspect ratio',
	'plugin.desktop-ui.shortcuts.subSizeUp': 'Subtitle size up',
	'plugin.desktop-ui.shortcuts.subSizeDown': 'Subtitle size down',

	// Display group
	'plugin.desktop-ui.shortcuts.fullscreen': 'Toggle fullscreen',
	'plugin.desktop-ui.shortcuts.exitFullscreen': 'Exit fullscreen',
	'plugin.desktop-ui.shortcuts.showTime': 'Show time',
	'plugin.desktop-ui.shortcuts.help': 'Keyboard shortcuts',

	// Legacy keys kept for backwards compat
	'plugin.desktop-ui.shortcuts.seekBackForward': 'Seek −10 s / +10 s',
	'plugin.desktop-ui.shortcuts.volumeUpDown': 'Volume +10% / −10%',
	'plugin.desktop-ui.shortcuts.theater': 'Theater mode',
	'plugin.desktop-ui.shortcuts.pip': 'Picture-in-picture',
	'plugin.desktop-ui.shortcuts.chapters': 'Previous / Next chapter',
} satisfies Record<string, string>;
