// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * English desktop-ui translations and the canonical key schema. This file is
 * the source of truth: every other `<tag>.ts` in this folder is typed against
 * `DesktopUiTranslationKey`, so a missing or stray key in any language is a
 * compile error. The plugin's glob discovery picks up each sibling language.
 */
const translations = {
	'plugin.desktop-ui.time.live': 'LIVE',
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

	// Shortcut group headings
	'plugin.desktop-ui.shortcuts.group.playback': 'Playback',
	'plugin.desktop-ui.shortcuts.group.speed': 'Speed',
	'plugin.desktop-ui.shortcuts.group.volume': 'Volume',
	'plugin.desktop-ui.shortcuts.group.seeking': 'Seeking',
	'plugin.desktop-ui.shortcuts.group.quickSeek': 'Quick Seek',
	'plugin.desktop-ui.shortcuts.group.navigation': 'Navigation',
	'plugin.desktop-ui.shortcuts.group.tracksAndSubtitles': 'Tracks & Subtitles',
	'plugin.desktop-ui.shortcuts.group.display': 'Display',

	// Menu navigation
	'plugin.desktop-ui.menu.back': 'Back',
	'plugin.desktop-ui.menu.close': 'Close',

	// Top-bar cast button (consumer opens its own device picker on click)
	'plugin.desktop-ui.button.cast': 'Cast to device',

	// A11y labels for interactive controls
	'plugin.desktop-ui.a11y.seek': 'Seek',
	'plugin.desktop-ui.a11y.volume': 'Volume',
	'plugin.desktop-ui.a11y.speed': 'Speed ({rate}×)',

	// Settings menu
	'plugin.desktop-ui.menu.settings': 'Settings',
	'plugin.desktop-ui.menu.audio': 'Audio',
	'plugin.desktop-ui.menu.subtitles': 'Subtitles',
	'plugin.desktop-ui.menu.subtitleSettings': 'Subtitle Settings',
	'plugin.desktop-ui.menu.quality': 'Quality',
	'plugin.desktop-ui.menu.speed': 'Speed',
	'plugin.desktop-ui.menu.aspectRatio': 'Aspect Ratio',
	'plugin.desktop-ui.menu.playlist': 'Playlist',
	'plugin.desktop-ui.menu.episodes': 'Episodes',
	'plugin.desktop-ui.menu.off': 'Off',
	'plugin.desktop-ui.message.loading': 'Loading…',
	'plugin.desktop-ui.message.volume': 'Volume: {level}%',
	'plugin.desktop-ui.message.muted': 'Muted',
	'plugin.desktop-ui.message.unmuted': 'Unmuted',
	'plugin.desktop-ui.message.buffering': 'Buffering…',
	'plugin.desktop-ui.message.error': 'Something went wrong trying to play this item',
	'plugin.desktop-ui.menu.subtitleType.full': 'Full',
	'plugin.desktop-ui.menu.subtitleType.sign': 'Sign',
	'plugin.desktop-ui.menu.auto': 'Auto',
	'plugin.desktop-ui.menu.normal': 'Normal',
	'plugin.desktop-ui.menu.original': 'Original',
	'plugin.desktop-ui.menu.stretch': 'Stretch',
	'plugin.desktop-ui.menu.crop': 'Crop',
	'plugin.desktop-ui.menu.native': 'Native',
	'plugin.desktop-ui.menu.reset': 'Reset',
	'plugin.desktop-ui.menu.season': 'Season {number}',

	// Short season/episode prefixes for the `%S<n>`/`%E<n>` title tokens. The
	// episode letter is localized (Dutch is `A`, from "aflevering").
	'plugin.desktop-ui.token.season': 'S{number}',
	'plugin.desktop-ui.token.episode': 'E{number}',
	'plugin.desktop-ui.token.extras': 'Extras',

	// Subtitle settings row labels
	'plugin.desktop-ui.menu.subtitle.font': 'Font',
	'plugin.desktop-ui.menu.subtitle.textSize': 'Text size',
	'plugin.desktop-ui.menu.subtitle.textColor': 'Text color',
	'plugin.desktop-ui.menu.subtitle.textOpacity': 'Text opacity',
	'plugin.desktop-ui.menu.subtitle.edgeStyle': 'Edge style',
	'plugin.desktop-ui.menu.subtitle.areaColor': 'Area color',
	'plugin.desktop-ui.menu.subtitle.areaOpacity': 'Area opacity',
	'plugin.desktop-ui.menu.subtitle.backgroundColor': 'Background color',
	'plugin.desktop-ui.menu.subtitle.backgroundOpacity': 'Background opacity',
};

/** Canonical translation key set for the desktop-ui plugin, derived from English. */
export type DesktopUiTranslationKey = keyof typeof translations;

export default translations;
