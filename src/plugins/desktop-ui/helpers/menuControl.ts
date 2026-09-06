// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Menu-control concern for the desktop UI plugin.
 *
 * Owns: open/close orchestration, keyboard navigation, active-index
 * reconciliation, pane repaint dispatch, and aria-expanded management.
 *
 * `menus.ts` builds the DOM; this module drives it. The two concerns are
 * deliberately separate: menus.ts renders, menuControl.ts orchestrates.
 *
 * Integration: the plugin class constructs one `MenuControlState` +
 * `MenuControlRefs` bag after `buildDom()` and passes them (plus a small
 * set of callbacks) into every function here.
 */

import type { IVideoPlayer, VideoPlayerConfig, VideoPlaylistItem } from '@nomercy-entertainment/nomercy-video-player';
import type { ActivityState } from './activity';
import type { MenuFrameRefs, MenuRenderState, SubMenuId, SubtitleMenuAction } from './menus';
import {
	renderAspectRatioPane,
	renderAudioPane,
	renderPlaylistPane,
	renderQualityPane,
	renderSpeedPane,
	renderSubsPane,
	renderSubtitleSettingsPane,
} from './menus';

// ── State bag ─────────────────────────────────────────────────────────────────

/** Mutable menu-control state threaded through every helper. */
export interface MenuControlState {
	menuOpen: boolean;
	currentSubMenu: SubMenuId | null;
	activeSubtitleIdx: number | null;
	activeAudioIdx: number;
	activeQualityIdx: number | 'auto';
	playingQualityIdx: number | null;
	userPickedQuality: boolean;
}

export function makeMenuControlState(): MenuControlState {
	return {
		menuOpen: false,
		currentSubMenu: null,
		activeSubtitleIdx: -1,
		activeAudioIdx: -1,
		activeQualityIdx: 'auto',
		playingQualityIdx: null,
		userPickedQuality: false,
	};
}

// ── Refs bag ──────────────────────────────────────────────────────────────────

/** Button refs needed for aria-expanded management. */
export interface MenuControlRefs {
	settingsBtn: HTMLButtonElement;
	speedBtn: HTMLButtonElement;
	qualityBtn: HTMLButtonElement;
	subsBtn: HTMLButtonElement;
	audioBtn: HTMLButtonElement;
	playlistBtn: HTMLButtonElement;
	aspectRatioBtn: HTMLButtonElement;
}

// ── Callback types ─────────────────────────────────────────────────────────────

export type MenuListen = (target: EventTarget, event: string, fn: (event: Event) => void) => void;

/**
 * Narrow options surface menu-control needs from `DesktopUiOptions` — kept
 * structural (not the full options type) so this module doesn't couple to
 * every desktop-ui config field.
 */
export interface MenuRenderOpts {
	imageBaseUrl?: string;
	subtitleMenuActions?: ReadonlyArray<SubtitleMenuAction>;
}

// ── Aria helpers ───────────────────────────────────────────────────────────────

/** Map a sub-menu id to its trigger button, or null for unmapped ids. */
export function menuTriggerBtn(
	id: SubMenuId,
	refs: MenuControlRefs,
): HTMLButtonElement | null {
	const map: Partial<Record<SubMenuId, HTMLButtonElement>> = {
		speed: refs.speedBtn,
		quality: refs.qualityBtn,
		subtitles: refs.subsBtn,
		language: refs.audioBtn,
		playlist: refs.playlistBtn,
		aspectRatio: refs.aspectRatioBtn,
	};
	return map[id] ?? null;
}

/** Set `aria-expanded` on the trigger button for a sub-menu (or the settings button for the main menu). */
export function setMenuTriggerExpanded(
	id: SubMenuId | null,
	expanded: boolean,
	refs: MenuControlRefs,
): void {
	if (id !== null) {
		menuTriggerBtn(id, refs)?.setAttribute('aria-expanded', String(expanded));
	}
	else {
		refs.settingsBtn.setAttribute('aria-expanded', String(expanded));
	}
}

/** Collapse all menu trigger buttons (aria-expanded = false). */
export function collapseAllTriggers(refs: MenuControlRefs): void {
	for (const btn of [
		refs.settingsBtn,
		refs.speedBtn,
		refs.qualityBtn,
		refs.subsBtn,
		refs.audioBtn,
		refs.playlistBtn,
		refs.aspectRatioBtn,
	]) {
		btn.setAttribute('aria-expanded', 'false');
	}
}

// ── Open / close ───────────────────────────────────────────────────────────────

/** Open the main (top-level) settings menu. */
export function openMainMenu(
	state: MenuControlState,
	activityState: ActivityState,
	menus: MenuFrameRefs,
	refs: MenuControlRefs,
): void {
	collapseAllTriggers(refs);
	setMenuTriggerExpanded(null, true, refs);

	state.menuOpen = true;
	activityState.menuOpen = true;
	state.currentSubMenu = null;
	menus.frame.classList.add('open');
	menus.content.classList.remove('sub-menu-open');
	for (const pane of Object.values(menus.panes))
		pane.classList.remove('is-open');
	try { menus.frameDialog.show?.(); }
	catch { /* not supported */ }
}

/** Open a specific sub-menu pane by id and repaint it immediately. */
export function openSubMenu(
	id: SubMenuId,
	state: MenuControlState,
	activityState: ActivityState,
	menus: MenuFrameRefs,
	refs: MenuControlRefs,
	player: IVideoPlayer<VideoPlaylistItem>,
	listen: MenuListen,
	closeAllMenusFn: () => void,
	opts: MenuRenderOpts | undefined,
	bumpActivity: () => void,
): void {
	// A trigger toggles. Pressing the button that opened a pane closes it.
	//
	// Without this the only way out of a menu is to click elsewhere, because each
	// trigger stops propagation and so never reaches the outside-click handler
	// that would have closed it. The trigger is the first place anybody presses,
	// being the control they just used.
	if (state.menuOpen && state.currentSubMenu === id) {
		closeAllMenusFn();
		return;
	}

	collapseAllTriggers(refs);
	setMenuTriggerExpanded(id, true, refs);

	state.menuOpen = true;
	activityState.menuOpen = true;
	state.currentSubMenu = id;
	menus.frame.classList.add('open');
	menus.content.classList.add('sub-menu-open');
	for (const [k, pane] of Object.entries(menus.panes)) {
		pane.classList.toggle('is-open', k === id);
	}
	repaintPane(id, state, menus, player, listen, closeAllMenusFn, opts);
	try { menus.frameDialog.show?.(); }
	catch { /* not supported */ }
	bumpActivity();
}

/** Close all menus and restart the inactivity timer. */
export function closeAllMenus(
	state: MenuControlState,
	activityState: ActivityState,
	menus: MenuFrameRefs,
	refs: MenuControlRefs,
	bumpActivity: () => void,
): void {
	collapseAllTriggers(refs);

	state.menuOpen = false;
	activityState.menuOpen = false;
	state.currentSubMenu = null;
	menus.frame.classList.remove('open');
	menus.content.classList.remove('sub-menu-open');
	for (const pane of Object.values(menus.panes))
		pane.classList.remove('is-open');
	try { menus.frameDialog.close?.(); }
	catch { /* already closed */ }

	bumpActivity();
}

// ── Keyboard navigation ────────────────────────────────────────────────────────

/**
 * Wire Up/Down arrow-key navigation through the open menu pane.
 * Propagation is stopped so the player's seek/volume key handlers
 * cannot fire while a menu is open.
 */
export function wireMenuKeyboardNav(
	state: MenuControlState,
	menus: MenuFrameRefs,
	listen: MenuListen,
): void {
	listen(menus.frame, 'keydown', (event: Event) => {
		const key = (event as KeyboardEvent).key;
		if (key !== 'ArrowDown' && key !== 'ArrowUp')
			return;

		const scope = (state.currentSubMenu && menus.panes[state.currentSubMenu]) || menus.frame;
		const rows = [...scope.querySelectorAll<HTMLButtonElement>('button:not([hidden]):not([disabled])')]
			.filter(button => button.offsetParent !== null);
		if (rows.length === 0)
			return;

		event.preventDefault();
		event.stopPropagation();

		const activeIdx = rows.indexOf(document.activeElement as HTMLButtonElement);
		const nextIdx = key === 'ArrowDown'
			? (activeIdx + 1) % rows.length
			: (activeIdx - 1 + rows.length) % rows.length;
		const next = rows[nextIdx]!;
		next.focus();
		next.scrollIntoView({ block: 'center' });
	});
}

// ── Active-index reconciliation ────────────────────────────────────────────────

/**
 * Reconcile the locally-cached active track indexes with the player's
 * canonical state after a new item finishes loading (`mediaReady`).
 *
 * Reads the kit's actual selection via `subtitle()` / `audioTrack()` first —
 * those are the source of truth for plugin-rendered tracks (ASS via Octopus,
 * etc.) that never appear in the backend's native track lists. Falls back to a
 * default-track heuristic when the kit has no selection yet.
 */
export function syncActiveIndexes(
	state: MenuControlState,
	player: IVideoPlayer<VideoPlaylistItem>,
): void {
	const audios = player.audioTracks?.() ?? [];
	const audioSelection = player.audioTrack?.();
	if (audioSelection != null && typeof audioSelection.index === 'number' && audioSelection.index >= 0) {
		state.activeAudioIdx = audioSelection.index;
	}
	else if (audios.length > 0) {
		const defIdx = audios.findIndex(audioTrack => audioTrack.default === true);
		state.activeAudioIdx = defIdx >= 0 ? defIdx : 0;
	}

	const subSelection = player.subtitle?.();
	state.activeSubtitleIdx = (subSelection != null && typeof subSelection.index === 'number' && subSelection.index >= 0)
		? subSelection.index
		: -1;

	const qualityChoice = player.quality?.();
	if (qualityChoice === 'auto' || qualityChoice == null) {
		state.activeQualityIdx = 'auto';
		state.userPickedQuality = false;
	}
	else {
		state.activeQualityIdx = qualityChoice.index;
		state.userPickedQuality = true;
	}
}

// ── Menu render state ──────────────────────────────────────────────────────────

/**
 * Build the `MenuRenderState` snapshot from cached indexes.
 * Active indexes are kept current by event handlers — read them as-is; do NOT
 * call `syncActiveIndexes` here or the user's manual pick would be overwritten
 * on every repaint.
 */
export function menuState(state: MenuControlState): MenuRenderState {
	return {
		subtitleIdx: state.activeSubtitleIdx,
		audioIdx: state.activeAudioIdx,
		qualityIdx: state.activeQualityIdx,
		playingQualityIdx: state.playingQualityIdx,
	};
}

// ── Pane repaint ───────────────────────────────────────────────────────────────

/**
 * Repaint the named sub-menu pane with fresh data from the player.
 * `closeAllMenusFn` is the plugin's bound `closeAllMenus` — passed in so
 * pick-to-close actions in sub-panes can close the whole menu without this
 * module knowing about the plugin's full state.
 */
export function repaintPane(
	id: SubMenuId,
	state: MenuControlState,
	menus: MenuFrameRefs,
	player: IVideoPlayer<VideoPlaylistItem>,
	listen: MenuListen,
	closeAllMenusFn: () => void,
	opts: MenuRenderOpts | undefined,
): void {
	const closeOnPick = closeAllMenusFn;
	const keepOpenOnPick = (paneId: SubMenuId) => (): void => {
		repaintPane(paneId, state, menus, player, listen, closeAllMenusFn, opts);
	};
	const st = menuState(state);

	if (id === 'speed')
		renderSpeedPane(menus.panes.speed, player, listen, keepOpenOnPick('speed'));
	if (id === 'quality')
		renderQualityPane(menus.panes.quality, player, listen, closeOnPick, st);
	if (id === 'subtitles')
		renderSubsPane(menus.panes.subtitles, player, listen, closeOnPick, st, opts?.subtitleMenuActions);
	if (id === 'language')
		renderAudioPane(menus.panes.language, player, listen, closeOnPick, st);
	if (id === 'playlist') {
		renderPlaylistPane(menus.panes.playlist, player, listen, closeOnPick, {
			// The player config is the single place a consumer sets an image base.
			// Without this fallback, setting `baseImageUrl` there still leaves the
			// playlist thumbnails relative, and the same value has to be repeated
			// as a plugin option to make them resolve.
			imageBaseUrl: opts?.imageBaseUrl
				?? (player as { options?: VideoPlayerConfig }).options?.baseImageUrl,
		});
	}
	if (id === 'subtitleSettings') {
		renderSubtitleSettingsPane(menus.panes.subtitleSettings, player, listen, closeOnPick);
	}
	if (id === 'aspectRatio') {
		renderAspectRatioPane(menus.panes.aspectRatio, player, listen, keepOpenOnPick('aspectRatio'));
	}
}

/** Repaint the subtitles pane if it is currently open. */
export function repaintSubsIfOpen(
	state: MenuControlState,
	menus: MenuFrameRefs,
	player: IVideoPlayer<VideoPlaylistItem>,
	listen: MenuListen,
	closeAllMenusFn: () => void,
	opts: MenuRenderOpts | undefined,
): void {
	if (state.currentSubMenu === 'subtitles')
		repaintPane('subtitles', state, menus, player, listen, closeAllMenusFn, opts);
}

/** Repaint the audio/language pane if it is currently open. */
export function repaintAudioIfOpen(
	state: MenuControlState,
	menus: MenuFrameRefs,
	player: IVideoPlayer<VideoPlaylistItem>,
	listen: MenuListen,
	closeAllMenusFn: () => void,
	opts: MenuRenderOpts | undefined,
): void {
	if (state.currentSubMenu === 'language')
		repaintPane('language', state, menus, player, listen, closeAllMenusFn, opts);
}

/** Repaint the quality pane if it is currently open. */
export function repaintQualityIfOpen(
	state: MenuControlState,
	menus: MenuFrameRefs,
	player: IVideoPlayer<VideoPlaylistItem>,
	listen: MenuListen,
	closeAllMenusFn: () => void,
	opts: MenuRenderOpts | undefined,
): void {
	if (state.currentSubMenu === 'quality')
		repaintPane('quality', state, menus, player, listen, closeAllMenusFn, opts);
}

/** Repaint the speed pane if it is currently open. */
export function repaintSpeedIfOpen(
	state: MenuControlState,
	menus: MenuFrameRefs,
	player: IVideoPlayer<VideoPlaylistItem>,
	listen: MenuListen,
	closeAllMenusFn: () => void,
	opts: MenuRenderOpts | undefined,
): void {
	if (state.currentSubMenu === 'speed')
		repaintPane('speed', state, menus, player, listen, closeAllMenusFn, opts);
}

/** Repaint the playlist pane if it is currently open. */
export function repaintPlaylistIfOpen(
	state: MenuControlState,
	menus: MenuFrameRefs,
	player: IVideoPlayer<VideoPlaylistItem>,
	listen: MenuListen,
	closeAllMenusFn: () => void,
	opts: MenuRenderOpts | undefined,
): void {
	if (state.currentSubMenu === 'playlist')
		repaintPane('playlist', state, menus, player, listen, closeAllMenusFn, opts);
}

/** Repaint the aspect-ratio pane if it is currently open. */
export function repaintAspectRatioIfOpen(
	state: MenuControlState,
	menus: MenuFrameRefs,
	player: IVideoPlayer<VideoPlaylistItem>,
	listen: MenuListen,
	closeAllMenusFn: () => void,
	opts: MenuRenderOpts | undefined,
): void {
	if (state.currentSubMenu === 'aspectRatio')
		repaintPane('aspectRatio', state, menus, player, listen, closeAllMenusFn, opts);
}
