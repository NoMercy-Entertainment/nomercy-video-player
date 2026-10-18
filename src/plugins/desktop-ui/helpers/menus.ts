// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Menu DOM builders for the desktop UI plugin.
 *
 * Menu-frame structure:
 *
 *   menu-frame-dialog (<dialog>)
 *     └─ menu-wrapper
 *        └─ menu-frame   (.open when any menu is showing)
 *           └─ menu-content   (.sub-menu-open when a sub-menu replaces main)
 *              ├─ main-menu        (back-button list of categories)
 *              └─ sub-menu         (slot that holds one of the sub-menu-content panes)
 *                  ├─ language-menu        (sub-menu-content.is-open when active)
 *                  ├─ subtitle-menu
 *                  ├─ quality-menu
 *                  └─ speed-menu
 *
 * The plugin owns DOM listener cleanup via `this.listen(...)`, so each
 * builder takes a `listen` helper and a small action-callback bag.
 */

import type { IVideoPlayer, VideoPlaylistItem } from '@nomercy-entertainment/nomercy-video-player';
import type { AudioTrackRef, QualityLevel, SubtitleTrackRef } from '../../../types';
import type { SubtitleStyle } from '../data/buttons';
import { createButton, createElement, detectDisplayHdr } from '@nomercy-entertainment/nomercy-player-core';
import { readItemImage } from '../../../player/itemImage';
import {
	colors,
	defaultSubtitleStyles,
	edgeStyles,
	fontFamilies,
	subtitleSettingActions,

} from '../data/buttons';
import { fluentIcons, svgFromIcon } from '../data/icons';
import { languageDisplayName, subtitleTrackLabel } from '../data/language-names';
import { escapeHtml, formatDuration } from '../data/utils';

export type MenuListen = (target: EventTarget, event: string, fn: (event: Event) => void) => void;

export const SUB_MENU_ID = {
	LANGUAGE: 'language',
	SUBTITLES: 'subtitles',
	QUALITY: 'quality',
	SPEED: 'speed',
	PLAYLIST: 'playlist',
	SUBTITLE_SETTINGS: 'subtitleSettings',
	ASPECT_RATIO: 'aspectRatio',
} as const;

export type SubMenuId = typeof SUB_MENU_ID[keyof typeof SUB_MENU_ID];

export interface MenuActions {
	closeMenu: () => void;
	openSubMenu: (id: SubMenuId) => void;
	backToMain: () => void;
}

/** Build the empty `<dialog>` shell + main-menu + sub-menu containers. */
export interface MenuFrameRefs {
	frameDialog: HTMLDialogElement;
	frame: HTMLDivElement;
	content: HTMLDivElement;
	main: HTMLDivElement;
	sub: HTMLDivElement;
	/**
	 * A map of sub-menu id → its sub-menu-content pane. The plugin
	 *  populates these on demand as data changes.
	 */
	panes: Record<SubMenuId, HTMLDivElement>;
	/**
	 * A map of sub-menu id → its corresponding main-menu button.
	 *  The plugin toggles `display: none` on these when a category has
	 *  no available options.
	 */
	mainButtons: Record<SubMenuId, HTMLButtonElement>;
	/** Container for `settingsMenuActions` rows — pass to `renderMainMenuActions` to repaint on a live options change. */
	mainMenuActionsContainer: HTMLDivElement;
}

/**
 * Consumer-supplied toggle row for the settings main menu — the menu
 * counterpart of the `buttons` map. `label` resolves at render time so
 * i18n applies; `get`/`set` bind the row to wherever the state lives
 * (a plugin, app storage, ...).
 */
export interface SettingsToggleItem {
	id: string;
	label: () => string;
	get: () => boolean;
	set: (value: boolean) => void;
}

/**
 * Consumer-supplied action row — a generic "plain button" menu entry shared
 * by two extension points: `subtitleMenuActions` (subtitles sub-menu, e.g.
 * "Search subtitles online…") and `settingsMenuActions` (main settings menu,
 * e.g. "Cast to device…", opening the app's own device picker). The shape is
 * identical for both; only the mount point differs. Shown whenever provided
 * — for the subtitles sub-menu that means even with zero subtitle tracks,
 * since that's exactly when an external-search action matters most, so it is
 * never gated behind the subtitles button's usual content-visibility check.
 * `label` resolves at render time so i18n applies, matching
 * `SettingsToggleItem`. `onSelect` receives the player so the consumer can
 * read current state (item, language) before opening its own UI.
 */
export interface SubtitleMenuAction {
	id: string;
	label: () => string;
	/** Raw SVG markup for the row's icon slot, inserted as-is like the built-in icons. Omit for a text-only row. */
	icon?: string;
	onSelect: (player: IVideoPlayer) => void | Promise<void>;
}

export function buildMenuFrame(
	player: IVideoPlayer,
	parent: HTMLElement,
	listen: MenuListen,
	actions: MenuActions,
	settingsItems?: ReadonlyArray<SettingsToggleItem>,
	settingsMenuActions?: ReadonlyArray<SubtitleMenuAction>,
): MenuFrameRefs {
	const frameDialog = createElement('dialog', 'menu-frame-dialog')
		.addClasses(['menu-frame-dialog'])
		.appendTo(parent)
		.get();
	frameDialog.setAttribute('popover', 'manual');
	frameDialog.setAttribute('role', 'modal');

	const wrapper = createElement('div', 'menu-wrapper')
		.addClasses(['menu-wrapper'])
		.appendTo(frameDialog)
		.get();

	const frame = createElement('div', 'menu-frame')
		.addClasses(['menu-frame'])
		.appendTo(wrapper)
		.get();

	const content = createElement('div', 'menu-content')
		.addClasses(['menu-content'])
		.appendTo(frame)
		.get();

	const main = buildMainMenu(player, content, listen, actions, settingsItems, settingsMenuActions);
	const sub = createElement('div', 'sub-menu')
		.addClasses(['sub-menu'])
		.appendTo(content)
		.get();

	const panes: Record<SubMenuId, HTMLDivElement> = {
		language: buildSubMenuPane(player, sub, 'language', player.t('plugin.desktop-ui.menu.audio'), listen, actions),
		subtitles: buildSubMenuPane(player, sub, 'subtitles', player.t('plugin.desktop-ui.menu.subtitles'), listen, actions),
		quality: buildSubMenuPane(player, sub, 'quality', player.t('plugin.desktop-ui.menu.quality'), listen, actions),
		speed: buildSubMenuPane(player, sub, 'speed', player.t('plugin.desktop-ui.menu.speed'), listen, actions),
		playlist: buildPlaylistPaneShell(player, sub, listen, actions),
		subtitleSettings: buildSubMenuPane(player, sub, 'subtitleSettings', player.t('plugin.desktop-ui.menu.subtitleSettings'), listen, actions),
		aspectRatio: buildSubMenuPane(player, sub, 'aspectRatio', player.t('plugin.desktop-ui.menu.aspectRatio'), listen, actions),
	};

	return {
		frameDialog,
		frame,
		content,
		main,
		sub,
		panes,
		mainButtons: {
			language: main.querySelector<HTMLButtonElement>('#menu-button-language')!,
			subtitles: main.querySelector<HTMLButtonElement>('#menu-button-subtitles')!,
			quality: main.querySelector<HTMLButtonElement>('#menu-button-quality')!,
			speed: main.querySelector<HTMLButtonElement>('#menu-button-speed')!,
			playlist: main.querySelector<HTMLButtonElement>('#menu-button-playlist')!,
			subtitleSettings: main.querySelector<HTMLButtonElement>('#menu-button-subtitleSettings')!,
			aspectRatio: main.querySelector<HTMLButtonElement>('#menu-button-aspectRatio')!,
		},
		mainMenuActionsContainer: main.querySelector<HTMLDivElement>('.main-menu-actions')!,
	};
}

function buildMainMenu(
	player: IVideoPlayer,
	parent: HTMLElement,
	listen: MenuListen,
	actions: MenuActions,
	settingsItems?: ReadonlyArray<SettingsToggleItem>,
	settingsMenuActions?: ReadonlyArray<SubtitleMenuAction>,
): HTMLDivElement {
	const main = createElement('div', 'main-menu')
		.addClasses(['main-menu'])
		.appendTo(parent)
		.get();

	// Header (title + close) — mirrors the sub-menu shell so the main menu
	// has the same visual rhythm as every category pane.
	const header = createElement('div', 'menu-header-main')
		.addClasses(['menu-header'])
		.appendTo(main)
		.get();

	const titleSpan = document.createElement('span');
	titleSpan.className = 'menu-button-text';
	titleSpan.textContent = player.t('plugin.desktop-ui.menu.settings');
	header.appendChild(titleSpan);

	const closeBtn = createButton('menu-close', player.t('plugin.desktop-ui.menu.close'), () => {});
	closeBtn.classList.add('menu-header-close');
	closeBtn.innerHTML = svgFromIcon(fluentIcons.close);
	header.appendChild(closeBtn);
	listen(closeBtn, 'click', (event: Event) => { event.stopPropagation(); actions.closeMenu(); });

	// Scroll container — same `.scroll-container` styling as the sub-menus.
	const scroll = createElement('div', 'main-scroll-container')
		.addClasses(['scroll-container', 'main-scroll-container'])
		.appendTo(main)
		.get();

	// Category buttons: language, subtitles, subtitle settings,
	// quality, speed, aspect ratio, playlist.
	const cats: { id: SubMenuId; labelKey: string; iconKey: keyof typeof fluentIcons }[] = [
		{ id: 'language', labelKey: 'plugin.desktop-ui.menu.audio', iconKey: 'language' },
		{ id: 'subtitles', labelKey: 'plugin.desktop-ui.menu.subtitles', iconKey: 'subtitles' },
		{ id: 'subtitleSettings', labelKey: 'plugin.desktop-ui.menu.subtitleSettings', iconKey: 'subtitleSettings' },
		{ id: 'quality', labelKey: 'plugin.desktop-ui.menu.quality', iconKey: 'quality' },
		{ id: 'speed', labelKey: 'plugin.desktop-ui.menu.speed', iconKey: 'speed' },
		{ id: 'aspectRatio', labelKey: 'plugin.desktop-ui.menu.aspectRatio', iconKey: 'aspectFit' },
		{ id: 'playlist', labelKey: 'plugin.desktop-ui.menu.playlist', iconKey: 'playlist' },
	];
	for (const cat of cats) {
		const label = player.t(cat.labelKey);
		const btn = createButton(`menu-button-${cat.id}`, label, () => {});
		btn.classList.add('language-button');
		btn.innerHTML = `
            <span class="menu-button-icon-left">${svgFromIcon(fluentIcons[cat.iconKey])}</span>
            <span class="menu-button-text">${label}</span>
            <span class="menu-button-chevron">${svgFromIcon(fluentIcons.chevronR)}</span>
        `;
		scroll.appendChild(btn);
		listen(btn, 'click', (event: Event) => { event.stopPropagation(); actions.openSubMenu(cat.id); });
	}

	// Consumer toggle rows — same row chrome as category buttons, with the
	// checkmark reflecting the bound state instead of a chevron.
	for (const item of settingsItems ?? []) {
		const btn = createButton(`menu-toggle-${item.id}`, item.label(), () => {});
		btn.classList.add('language-button');
		btn.setAttribute('role', 'switch');
		const paint = (): void => {
			const on = item.get();
			btn.classList.toggle('is-active', on);
			btn.setAttribute('aria-checked', String(on));
			btn.innerHTML = `
            <span class="menu-button-text">${item.label()}</span>
            <span class="menu-button-check">${svgFromIcon(fluentIcons.checkmark, 18)}</span>
        `;
		};
		paint();
		// The menu builds at plugin registration, often before the consumer
		// plugin owning the label's bundle has loaded — repaint on language
		// load so the row never shows a raw key.
		player.on?.('language', paint);
		scroll.appendChild(btn);
		listen(btn, 'click', (event: Event) => {
			event.stopPropagation();
			item.set(!item.get());
			paint();
		});
	}

	// Consumer action rows — plain button/menuitem semantics (e.g. "Cast to
	// device…"), same shape and renderer as `subtitleMenuActions` but mounted
	// on the main menu instead of the subtitles sub-menu. Rendered into a
	// dedicated container (unlike the static category buttons above) so a
	// live `settingsMenuActions` change can repaint just these rows — see
	// `renderMainMenuActions`.
	const actionsContainer = createElement('div', 'main-menu-actions')
		.addClasses(['main-menu-actions'])
		.appendTo(scroll)
		.get();
	renderMainMenuActions(actionsContainer, settingsMenuActions, listen, actions.closeMenu, player);

	return main;
}

/**
 * (Re)paint the main-menu consumer action rows into `container`. Unlike the
 * static category buttons and the `settingsItems` toggle rows, this is
 * designed to be called more than once — a live `settingsMenuActions` change
 * (e.g. a Cast SDK becoming available after mount) calls this again with the
 * same container to refresh the rows in place, same pattern as
 * `renderSubsPane`'s `scroll.replaceChildren()` + re-`listen()` refresh.
 */
export function renderMainMenuActions(
	container: HTMLDivElement,
	settingsMenuActions: ReadonlyArray<SubtitleMenuAction> | undefined,
	listen: MenuListen,
	closeMenu: () => void,
	player: IVideoPlayer,
): void {
	container.replaceChildren();
	for (const action of settingsMenuActions ?? []) {
		appendAction(container, action, closeMenu, listen, player);
	}
}

function buildSubMenuHeader(
	player: IVideoPlayer,
	header: HTMLElement,
	backId: string,
	closeId: string,
	titleText: string,
	titleExtraClass: string | undefined,
	listen: MenuListen,
	actions: MenuActions,
): HTMLSpanElement {
	const back = createButton(backId, player.t('plugin.desktop-ui.menu.back'), () => {});
	back.classList.add('menu-header-back');
	back.innerHTML = svgFromIcon(fluentIcons.chevronL);
	header.appendChild(back);
	listen(back, 'click', (event: Event) => { event.stopPropagation(); actions.backToMain(); });

	const titleSpan = document.createElement('span');
	titleSpan.className = titleExtraClass ? `menu-button-text ${titleExtraClass}` : 'menu-button-text';
	titleSpan.textContent = titleText;
	header.appendChild(titleSpan);

	const close = createButton(closeId, player.t('plugin.desktop-ui.menu.close'), () => {});
	close.classList.add('menu-header-close');
	close.innerHTML = svgFromIcon(fluentIcons.close);
	header.appendChild(close);
	listen(close, 'click', (event: Event) => { event.stopPropagation(); actions.closeMenu(); });

	return titleSpan;
}

/**
 * Build the two-pane playlist shell: a Seasons rail on the left
 * (with its own back/title/close header and an empty scroll container
 * for season buttons) and a wider Episodes rail on the right (with a
 * close-only header and the rich-card episode list).
 *
 * The empty rails are populated by `renderPlaylistPane`.
 */
function buildPlaylistPaneShell(
	player: IVideoPlayer,
	parent: HTMLElement,
	listen: MenuListen,
	actions: MenuActions,
): HTMLDivElement {
	const root = createElement('div', 'playlist-menu')
		.addClasses(['sub-menu-content', 'playlist-menu'])
		.appendTo(parent)
		.get();

	// Header — flex column header.
	const header = createElement('div', 'menu-header-playlist')
		.addClasses(['menu-header'])
		.appendTo(root)
		.get();

	buildSubMenuHeader(
		player,
		header,
		'playlist-back',
		'playlist-close',
		player.t('plugin.desktop-ui.menu.playlist'),
		'playlist-title',
		listen,
		actions,
	);

	// Row wrapper — flex-row containing the two columns.
	const cols = createElement('div', 'playlist-cols')
		.addClasses(['playlist-cols'])
		.appendTo(root)
		.get();

	// Seasons column.
	const seasons = createElement('div', 'playlist-seasons-pane')
		.addClasses(['sub-menu-content', 'seasons-pane'])
		.appendTo(cols)
		.get();
	createElement('div', 'playlist-seasons-scroll-container')
		.addClasses(['scroll-container', 'playlist-seasons-scroll-container'])
		.appendTo(seasons);

	// Episode column.
	const episodes = createElement('div', 'episode-menu')
		.addClasses(['sub-menu-content', 'episode-menu'])
		.appendTo(cols)
		.get();
	createElement('div', 'playlist-scroll-container')
		.addClasses(['scroll-container', 'playlist-scroll-container'])
		.appendTo(episodes);

	return root;
}

/** Back handler for the Subtitle Settings pane while a property picker is showing. */
const pickerBack = new WeakMap<HTMLDivElement, () => void>();

function buildSubMenuPane(
	player: IVideoPlayer,
	parent: HTMLElement,
	id: SubMenuId,
	title: string,
	listen: MenuListen,
	actions: MenuActions,
): HTMLDivElement {
	const pane = createElement('div', `${id}-menu`)
		.addClasses(['sub-menu-content', `${id}-menu`])
		.appendTo(parent)
		.get();

	const header = createElement('div', `menu-header-${id}`)
		.addClasses(['menu-header'])
		.appendTo(pane)
		.get();

	const paneActions: MenuActions = id === 'subtitleSettings'
		? { ...actions, backToMain: () => (pickerBack.get(pane) ?? actions.backToMain)() }
		: actions;

	buildSubMenuHeader(
		player,
		header,
		`menu-back-${id}`,
		`menu-close-${id}`,
		title,
		undefined,
		listen,
		paneActions,
	);

	createElement('div', `${id}-scroll-container`)
		.addClasses(['scroll-container', `${id}-scroll-container`])
		.appendTo(pane);
	return pane;
}

// ── Pane content renderers ─────────────────────────────────────────────
// Each renderer wipes the scroll-container of its pane and rebuilds the
// list. Called on initial wire and on every relevant player event change.

export interface MenuRenderState {
	/** Active subtitle index, or -1 / null when subtitles are off. */
	subtitleIdx: number | null;
	/** Active audio track index. -1 = none / default. */
	audioIdx: number;
	/** Active quality level index, or `'auto'` for auto. */
	qualityIdx: number | 'auto';
	/**
	 * Level the backend is actually playing right now. In Auto mode this
	 * differs from `qualityIdx` (which stays `'auto'`); the menu surfaces it
	 * as a lower-importance sublabel on the Auto row. Null before the first
	 * `level-switched` event lands or for non-HLS sources.
	 */
	playingQualityIdx?: number | null;
}

export function renderSpeedPane(
	pane: HTMLDivElement,
	player: IVideoPlayer,
	listen: MenuListen,
	onPick: () => void,
): void {
	const scroll = pane.querySelector<HTMLDivElement>('.speed-scroll-container');
	if (!scroll)
		return;
	scroll.replaceChildren();
	const rates: number[] = player.playbackRates?.() ?? [0.5, 0.75, 1, 1.25, 1.5, 2];
	const cur = player.playbackRate?.() ?? 1;
	for (const rate of rates) {
		const label = rate === 1 ? player.t('plugin.desktop-ui.menu.normal') : `${rate}×`;
		appendChoice(
			scroll,
			`speed-button-${rate}`,
			label,
			rate === cur,
			() => { player.playbackRate?.(rate); onPick(); },
			listen,
			player,
		);
	}
}

export function renderQualityPane(
	pane: HTMLDivElement,
	player: IVideoPlayer,
	listen: MenuListen,
	onPick: () => void,
	state: MenuRenderState,
): void {
	const scroll = pane.querySelector<HTMLDivElement>('.quality-scroll-container');
	if (!scroll)
		return;
	scroll.replaceChildren();
	const allLevels: QualityLevel[] = player.qualityLevels?.() ?? [];
	// Drop HDR levels when the active display can't render HDR — the browser
	// would decode them but the colours would map back to SDR and look wrong.
	const displayHdr = detectDisplayHdr();
	const levels = allLevels.filter(qualityLevel => qualityLevel.dynamicRange !== 'hdr' || displayHdr);
	const auto = state.qualityIdx === 'auto';
	// In Auto mode the Auto row gets the primary checkmark. The level the
	// backend is actually playing right now is shown as a lower-importance
	// sublabel — so the user keeps the "I'm in Auto" signal while still
	// seeing what quality is on screen.
	// `playingQualityIdx` is the full HLS level index. `qualityLevels()`
	// returns a filtered subset (unsupported codecs dropped, HDR hidden when
	// the display can't render it), so a positional lookup gives the wrong
	// entry — match by the `index` property carried on each QualityLevel.
	const playingIdx = state.playingQualityIdx ?? null;
	const playingLevel = playingIdx !== null
		? levels.find(qualityLevel => qualityLevel.index === playingIdx)
		: undefined;
	const playingLabel = playingLevel
		? (playingLevel.label || (playingLevel.height ? `${playingLevel.height}p` : undefined))
		: undefined;
	appendChoice(scroll, 'quality-auto', player.t('plugin.desktop-ui.menu.auto'), auto, () => { player.quality?.('auto'); onPick(); }, listen, player, {
		sublabel: auto && playingLabel ? playingLabel : undefined,
	});
	levels.forEach((qualityLevel, i) => {
		const label = qualityLevel.label || (qualityLevel.height ? `${qualityLevel.height}p` : `Level ${i + 1}`);
		const id = `quality-${qualityLevel.height ?? '?'}-${qualityLevel.bitrate ?? i}`;
		appendChoice(
			scroll,
			id,
			label,
			!auto && state.qualityIdx === qualityLevel.index,
			() => { player.quality?.(qualityLevel.index); onPick(); },
			listen,
			player,
		);
	});
}

function resolveUiLanguage(player: IVideoPlayer): string {
	/* language() overload returns `string | undefined`; typeof guard narrows at runtime but TS sees the union — double-cast collapses it */
	return typeof player.language?.() === 'string' ? player.language() as unknown as string : 'en';
}

export function renderSubsPane(
	pane: HTMLDivElement,
	player: IVideoPlayer,
	listen: MenuListen,
	onPick: () => void,
	state: MenuRenderState,
	actions?: ReadonlyArray<SubtitleMenuAction>,
): void {
	const scroll = pane.querySelector<HTMLDivElement>('.subtitles-scroll-container');
	if (!scroll)
		return;
	scroll.replaceChildren();
	// The kit's `subtitles()` returns the union of HLS-managed and
	// sidecar VTT tracks, so the renderer just consumes one flat list.
	const subs: SubtitleTrackRef[] = player.subtitles?.() ?? [];
	const off = state.subtitleIdx === null || state.subtitleIdx === -1;
	const uiLanguage = resolveUiLanguage(player);
	appendChoice(scroll, 'off-button-', player.t('plugin.desktop-ui.menu.off'), off, () => { player.subtitle?.(null); onPick(); }, listen, player);
	subs.forEach((subtitleTrack, i) => {
		const langSlug = (subtitleTrack.language ?? subtitleTrack.id).replace(/\W+/g, '-').toLowerCase();
		// The variant lives in `type` ('full' / 'sign' / 'sdh' …); `kind` is the
		// WebVTT kind ('subtitles' / 'captions') and never distinguishes rows.
		const variantSlug = (subtitleTrack.type ?? 'full').replace(/\W+/g, '-').toLowerCase();
		appendChoice(
			scroll,
			`${variantSlug}-button-${langSlug}`,
			subtitleTrackLabel(subtitleTrack, uiLanguage, key => player.t(key), `Track ${i + 1}`),
			!off && state.subtitleIdx === i,
			() => { player.subtitle?.(i); onPick(); },
			listen,
			player,
		);
	});

	for (const action of actions ?? []) {
		appendAction(scroll, action, onPick, listen, player);
	}
}

/**
 * Append a consumer-supplied action row — plain button/menuitem semantics
 * (no checkmark, no `is-active` state), visually separated from the
 * choice rows above it by `.menu-action-row`'s top divider.
 */
function appendAction(
	scroll: HTMLDivElement,
	action: SubtitleMenuAction,
	onPick: () => void,
	listen: MenuListen,
	player: IVideoPlayer,
): void {
	const label = action.label();
	const btn = createButton(`subtitle-action-${action.id}`, label, () => {});
	btn.classList.add('language-button', 'menu-action-row');
	const iconHtml = action.icon ? `<span class="menu-button-icon-left">${action.icon}</span>` : '';
	btn.innerHTML = `
        ${iconHtml}
        <span class="menu-button-text">${escapeHtml(label)}</span>
    `;
	scroll.appendChild(btn);
	listen(btn, 'click', () => {
		void action.onSelect(player);
		onPick();
	});
}

/**
 * Subtitle Settings sub-menu. Lists the configurable subtitle properties
 * (Font, Text size, Text color, Text opacity, Edge style, Area color,
 * Area opacity, Background color, Background opacity) plus a Reset row.
 *
 * Each row shows the current value and a chevron — clicking it swaps
 * the pane's body to a property-specific picker (rendered by
 * `renderSubtitlePropertyPane`). The back arrow returns to this list.
 *
 * `IVideoPlayer` doesn't expose a `subtitleStyle()` API, so the active
 * style is kept in module state and written through to the player only
 * when the method is present.
 */
const SETTING_ROWS: Array<{ labelKey: string; property: keyof SubtitleStyle | '' }> = [
	{ labelKey: 'plugin.desktop-ui.menu.subtitle.font', property: 'fontFamily' },
	{ labelKey: 'plugin.desktop-ui.menu.subtitle.textSize', property: 'fontSize' },
	{ labelKey: 'plugin.desktop-ui.menu.subtitle.textColor', property: 'textColor' },
	{ labelKey: 'plugin.desktop-ui.menu.subtitle.textOpacity', property: 'textOpacity' },
	{ labelKey: 'plugin.desktop-ui.menu.subtitle.edgeStyle', property: 'edgeStyle' },
	{ labelKey: 'plugin.desktop-ui.menu.subtitle.backgroundColor', property: 'backgroundColor' },
	{ labelKey: 'plugin.desktop-ui.menu.subtitle.backgroundOpacity', property: 'backgroundOpacity' },
	{ labelKey: 'plugin.desktop-ui.menu.subtitle.areaColor', property: 'areaColor' },
	{ labelKey: 'plugin.desktop-ui.menu.subtitle.areaOpacity', property: 'windowOpacity' },
	{ labelKey: 'plugin.desktop-ui.menu.reset', property: '' },
];

/**
 * Read the active subtitle style straight from the kit. The kit
 * lazily seeds defaults on first read, so consumers never have to
 * worry about an uninitialized state.
 */
function readSubtitleStyle(player: IVideoPlayer): SubtitleStyle {
	return player.subtitleStyle?.() ?? { ...defaultSubtitleStyles };
}

function writeSubtitleStyle(player: IVideoPlayer, patch: Partial<SubtitleStyle>): void {
	player.subtitleStyle?.(patch);
}

function writeSubtitleStyleKey<K extends keyof SubtitleStyle>(
	player: IVideoPlayer,
	key: K,
	value: SubtitleStyle[K],
): void {
	const patch: Partial<SubtitleStyle> = {};
	patch[key] = value;
	writeSubtitleStyle(player, patch);
}

/**
 * Format a subtitle-style value for display in the settings menu:
 *   - fontFamily / edgeStyle  → human-readable `name` from `fontFamilies` / `edgeStyles`
 *   - {textColor,
 *      backgroundColor,
 *      areaColor}             → title-cased `label` from the shared `colors` table
 *                               (e.g. `'white'` → `'White'`)
 *   - any other number         → append `'%'` (covers fontSize, textOpacity,
 *                                backgroundOpacity, windowOpacity — all
 *                                percentage scales)
 */
function formatSettingValue(prop: keyof SubtitleStyle, value: unknown): string {
	if (prop === 'fontFamily')
		return fontFamilies.find(font => font.value === value)?.name ?? String(value);
	if (prop === 'edgeStyle')
		return edgeStyles.find(edgeStyle => edgeStyle.value === value)?.name ?? String(value);
	if (prop === 'textColor' || prop === 'backgroundColor' || prop === 'areaColor') {
		return colors.find(color => color.value === value)?.label ?? toTitleCase(String(value));
	}
	if (typeof value === 'number')
		return `${value}%`;
	return toTitleCase(String(value));
}

function toTitleCase(text: string): string {
	return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}

export function renderSubtitleSettingsPane(
	pane: HTMLDivElement,
	player: IVideoPlayer,
	listen: MenuListen,
	onPick: () => void,
): void {
	const scroll = pane.querySelector<HTMLDivElement>('.subtitleSettings-scroll-container');
	if (!scroll)
		return;
	scroll.replaceChildren();

	// Back from the list goes to the main menu; a picker visit or a close from a picker leaves both stale.
	pickerBack.delete(pane);
	const titleEl = pane.querySelector<HTMLSpanElement>('.menu-header .menu-button-text');
	if (titleEl)
		titleEl.textContent = player.t('plugin.desktop-ui.menu.subtitleSettings');

	const style = readSubtitleStyle(player);

	for (const row of SETTING_ROWS) {
		const rowLabel = player.t(row.labelKey);
		const id = `subtitleSetting-button-${row.labelKey.replace(/\W+/g, '-').toLowerCase()}`;
		const btn = createButton(id, rowLabel, () => {});
		btn.classList.add('language-button');
		const valueText = row.property
			? formatSettingValue(row.property, style[row.property as keyof SubtitleStyle])
			: '';
		const chevronOrEmpty = row.property
			? `<span class="menu-button-chevron">${svgFromIcon(fluentIcons.chevronR, 18)}</span>`
			: '';
		btn.innerHTML = `
            <span class="menu-button-text">${escapeHtml(rowLabel)}</span>
            ${valueText ? `<span class="menu-button-subtext">${escapeHtml(valueText)}</span>` : ''}
            ${chevronOrEmpty}
        `;
		scroll.appendChild(btn);

		listen(btn, 'click', (event: Event) => {
			event.stopPropagation();
			if (row.property) {
				renderSubtitlePropertyPane(pane, player, listen, onPick, rowLabel, row.property);
			}
			else {
				// Reset writes back the defaults, then repaints the row list
				// so each value reflects the new state.
				writeSubtitleStyle(player, { ...defaultSubtitleStyles });
				renderSubtitleSettingsPane(pane, player, listen, onPick);
			}
		});
	}
}

/**
 * Property-specific picker (Font / Text size / etc.). Replaces the
 * pane's scroll-container content with the available actions for that
 * property; clicking back returns to the main settings list.
 */
function renderSubtitlePropertyPane(
	pane: HTMLDivElement,
	player: IVideoPlayer,
	listen: MenuListen,
	onPick: () => void,
	label: string,
	property: keyof SubtitleStyle,
): void {
	const header = pane.querySelector<HTMLDivElement>('.menu-header');
	const titleEl = header?.querySelector<HTMLSpanElement>('.menu-button-text');
	if (titleEl)
		titleEl.textContent = label;
	pickerBack.set(pane, () => renderSubtitleSettingsPane(pane, player, listen, onPick));

	const scroll = pane.querySelector<HTMLDivElement>('.subtitleSettings-scroll-container');
	if (!scroll)
		return;
	scroll.replaceChildren();

	const actions = subtitleSettingActions(player).filter(subtitleSettingAction => subtitleSettingAction.property === property);
	const currentValue = readSubtitleStyle(player)[property];

	for (const action of actions) {
		const id = `subtitleSetting-action-${property}-${String(action.value).replace(/\W+/g, '-').toLowerCase()}`;
		const btn = createButton(id, action.label, () => {});
		btn.classList.add('language-button');
		const isActive = action.value === currentValue;
		if (isActive)
			btn.classList.add('is-active');
		btn.innerHTML = `
            <span class="menu-button-text">${escapeHtml(action.label)}</span>
            <span class="menu-button-check">${svgFromIcon(fluentIcons.checkmark, 18)}</span>
        `;
		scroll.appendChild(btn);
		listen(btn, 'click', (event: Event) => {
			event.stopPropagation();
			// Each action calls the player API, updates local fallback state,
			// and repaints the picker so the checkmark moves.
			try { action.action?.(); }
			catch { /* tolerate */ }
			if (property)
				writeSubtitleStyleKey(player, property, action.value as SubtitleStyle[typeof property]);
			renderSubtitlePropertyPane(pane, player, listen, onPick, label, property);
		});
	}
}

/**
 * Optional image base — pass via `imageBaseUrl` if your playlist items
 *  carry relative TMDB-style paths (e.g. `/w780/abc.jpg`).
 */
export interface PlaylistRenderOptions {
	imageBaseUrl?: string;
}

/**
 * Returns true only when the queue contains two or more distinct season
 * numbers >= 1 among non-movie items. Every other case (season-0 specials,
 * a single season, a movie collection) returns false and renders a flat list.
 */
export function shouldShowSeasonSidebar(queue: ReadonlyArray<VideoPlaylistItem>): boolean {
	const tvSeasons = new Set(
		queue
			.filter(item => item.video_type !== 'movie' && item.playlist_type !== 'movie')
			.map(item => item.season)
			.filter((season): season is number => typeof season === 'number' && season >= 1),
	);
	return tvSeasons.size >= 2;
}

/**
 * Playlist sub-menu — rich-card layout.
 *
 * Adaptive layout:
 *   - Flat list: season-0 specials, a movie collection, or a single season —
 *     the seasons rail is hidden and the episodes rail fills the full width.
 *   - Seasonal (sidebar): two or more TV seasons >= 1 — the left rail shows
 *     season buttons; clicking a season filters the right rail to that season.
 */
export function renderPlaylistPane(
	pane: HTMLDivElement,
	player: IVideoPlayer,
	listen: MenuListen,
	onPick: () => void,
	opts: PlaylistRenderOptions = {},
): void {
	const queue: ReadonlyArray<VideoPlaylistItem> = player.queue?.() ?? [];
	const curIdx = player.index?.() ?? 0;

	const showSidebar = shouldShowSeasonSidebar(queue);

	const episodePane = pane.querySelector<HTMLDivElement>('.episode-menu');
	const seasonScroll = pane.querySelector<HTMLDivElement>('.playlist-seasons-scroll-container');
	const scroll = pane.querySelector<HTMLDivElement>('.playlist-scroll-container');
	const title = pane.querySelector<HTMLSpanElement>('.playlist-title');

	const isTvContent = queue.some(
		item => item.playlist_type === 'tv' || (typeof item.episode === 'number' && item.video_type !== 'movie' && item.playlist_type !== 'movie'),
	);

	if (title) {
		title.textContent = isTvContent
			? player.t('plugin.desktop-ui.menu.episodes')
			: player.t('plugin.desktop-ui.menu.playlist');
	}

	if (!scroll || !episodePane)
		return;

	if (!showSidebar) {
		pane.classList.add('playlist-flat');
		scroll.replaceChildren();
		queue.forEach((item, idx) => {
			scroll.appendChild(buildPlaylistCard(player, item, idx, idx === curIdx, listen, onPick, opts));
		});
		return;
	}

	pane.classList.remove('playlist-flat');

	const seasons = Array.from(new Set(queue.map(item => item.season).filter((season): season is number => typeof season === 'number'))).sort((itemA, itemB) => itemA - itemB);
	const currentItem = queue[curIdx];
	const activeSeason = typeof currentItem?.season === 'number' ? currentItem.season : (seasons[0] ?? 1);

	if (seasonScroll) {
		seasonScroll.replaceChildren();
		for (const sNum of seasons) {
			const seasonLabel = player.t('plugin.desktop-ui.menu.season', { number: String(sNum) });
			const btn = createButton(`season-button-${sNum}`, seasonLabel, () => {});
			btn.classList.add('language-button');
			if (sNum === activeSeason)
				btn.classList.add('is-active');
			btn.innerHTML = `<span class="menu-button-text">${escapeHtml(seasonLabel)}</span>`;
			seasonScroll.appendChild(btn);
			listen(btn, 'click', () => {
				renderSeasonEpisodes(scroll, player, queue, sNum, curIdx, listen, onPick, opts);
				for (const seasonBtn of Array.from(seasonScroll.querySelectorAll('.language-button'))) {
					seasonBtn.classList.remove('is-active');
				}
				btn.classList.add('is-active');
			});
		}
	}

	renderSeasonEpisodes(scroll, player, queue, activeSeason, curIdx, listen, onPick, opts);
}

function renderSeasonEpisodes(
	scroll: HTMLDivElement,
	player: IVideoPlayer,
	queue: ReadonlyArray<VideoPlaylistItem>,
	season: number,
	curIdx: number,
	listen: MenuListen,
	onPick: () => void,
	opts: PlaylistRenderOptions,
): void {
	scroll.replaceChildren();
	queue.forEach((item, i) => {
		if (item.season !== season)
			return;
		scroll.appendChild(buildPlaylistCard(player, item, i, i === curIdx, listen, onPick, opts));
	});
}

function buildPlaylistCard(
	player: IVideoPlayer,
	item: VideoPlaylistItem,
	index: number,
	active: boolean,
	listen: MenuListen,
	onPick: () => void,
	opts: PlaylistRenderOptions,
): HTMLButtonElement {
	const safe = String(item.id ?? index).replace(/\W+/g, '-').toLowerCase();
	const resolvedTitle = item.title ?? `Item ${index + 1}`;
	const btn = createButton(`playlist-${safe}`, resolvedTitle, () => {});
	btn.classList.add('playlist-menu-button');
	if (active)
		btn.classList.add('is-active');

	const left = document.createElement('div');
	left.className = 'episode-menu-button-left';
	btn.appendChild(left);

	const thumbUrl = readItemImage(item);
	if (thumbUrl) {
		const img = document.createElement('img');
		img.className = 'episode-menu-button-image';
		img.loading = 'lazy';
		img.alt = '';
		const isAbs = /^https?:\/\//i.test(thumbUrl);
		img.src = isAbs ? thumbUrl : `${opts.imageBaseUrl ?? ''}${thumbUrl}`;
		// Hide on load failure rather than showing a broken-image icon.
		img.addEventListener('error', () => { img.style.display = 'none'; });
		left.appendChild(img);
	}

	const shadow = document.createElement('div');
	shadow.className = 'episode-menu-button-shadow';
	left.appendChild(shadow);

	const progressContainer = document.createElement('div');
	progressContainer.className = 'episode-menu-progress-container';
	const progressBox = document.createElement('div');
	progressBox.className = 'episode-menu-progress-box';
	const epLabel = document.createElement('div');
	epLabel.className = 'progress-item-text';
	const isRealEpisode = typeof item.season === 'number' && item.season >= 1 && typeof item.episode === 'number';
	if (isRealEpisode) {
		const seasonLabel = player.t('plugin.desktop-ui.token.season', { number: String(item.season) });
		const episodeLabel = player.t('plugin.desktop-ui.token.episode', { number: String(item.episode) });
		epLabel.textContent = `${seasonLabel}: ${episodeLabel}`;
	}
	else if (typeof item.episode === 'number' && typeof item.season !== 'number') {
		epLabel.textContent = player.t('plugin.desktop-ui.token.episode', { number: String(item.episode) });
	}
	else {
		epLabel.textContent = String(index + 1);
	}
	progressBox.appendChild(epLabel);
	const durLabel = document.createElement('div');
	durLabel.className = 'progress-duration';
	durLabel.textContent = formatDuration(item.duration);
	progressBox.appendChild(durLabel);
	progressContainer.appendChild(progressBox);

	const sliderContainer = document.createElement('div');
	sliderContainer.className = 'slider-container';
	const progressBar = document.createElement('div');
	progressBar.className = 'progress-bar';
	if (item.progress && item.progress.percentage > 0) {
		progressBar.style.width = `${Math.min(100, item.progress.percentage)}%`;
		sliderContainer.classList.add('has-progress');
	}
	sliderContainer.appendChild(progressBar);
	progressContainer.appendChild(sliderContainer);
	left.appendChild(progressContainer);

	const right = document.createElement('div');
	right.className = 'playlist-card-right';
	const title = document.createElement('span');
	title.className = 'playlist-menu-button-title';
	title.textContent = resolvedTitle;
	right.appendChild(title);
	// Watched-date label removed per design — progress bar in the thumbnail
	// already conveys "in progress" / "watched" state; the ISO date string was
	// redundant noise on a small card.
	if (item.description) {
		const overview = document.createElement('span');
		overview.className = 'playlist-menu-button-overview';
		overview.textContent = item.description;
		right.appendChild(overview);
	}
	btn.appendChild(right);

	listen(btn, 'click', () => {
		player.item?.(index, { source: 'user', autoplay: true });
		onPick();
	});

	return btn;
}

export function renderAudioPane(
	pane: HTMLDivElement,
	player: IVideoPlayer,
	listen: MenuListen,
	onPick: () => void,
	state: MenuRenderState,
): void {
	const scroll = pane.querySelector<HTMLDivElement>('.language-scroll-container');
	if (!scroll)
		return;
	scroll.replaceChildren();
	const tracks: AudioTrackRef[] = player.audioTracks?.() ?? [];
	const uiLanguage = resolveUiLanguage(player);
	tracks.forEach((audioTrack, i) => {
		const langSlug = (audioTrack.language ?? audioTrack.id).replace(/\W+/g, '-').toLowerCase();
		appendChoice(
			scroll,
			`audio-button-${langSlug}-${i}`,
			audioTrack.label ?? languageDisplayName(audioTrack.language, uiLanguage) ?? audioTrack.language ?? `Track ${i + 1}`,
			state.audioIdx === i,
			() => { player.audioTrack?.(i); onPick(); },
			listen,
			player,
		);
	});
}

function appendChoice(
	scroll: HTMLDivElement,
	id: string,
	label: string,
	active: boolean,
	onClick: () => void,
	listen: MenuListen,
	player: IVideoPlayer,
	opts?: {
		/**
		 * Optional lower-importance text rendered between the label and the
		 * checkmark. Used by the quality pane's Auto row to surface the
		 * level the backend is actually playing without competing with the
		 * primary checkmark.
		 */
		sublabel?: string;
	},
): void {
	const btn = createButton(id, label, () => {});
	btn.classList.add('language-button');
	if (active)
		btn.classList.add('is-active');
	// Reuses the existing `.menu-button-subtext` styling (muted colour, 10px,
	// pushed right) so the sublabel sits between the primary label and the
	// checkmark without competing visually.
	const sublabelHtml = opts?.sublabel
		? `<span class="menu-button-subtext">${escapeHtml(opts.sublabel)}</span>`
		: '';
	btn.innerHTML = `
        <span class="menu-button-text">${escapeHtml(label)}</span>
        ${sublabelHtml}
        <span class="menu-button-check">${svgFromIcon(fluentIcons.checkmark, 18)}</span>
    `;
	scroll.appendChild(btn);
	listen(btn, 'click', () => onClick());
}

export const ASPECT_RATIO_VALUE = {
	UNIFORM: 'uniform',
	FILL: 'fill',
	EXACTFIT: 'exactfit',
	NONE: 'none',
} as const;

export type AspectRatioValue = typeof ASPECT_RATIO_VALUE[keyof typeof ASPECT_RATIO_VALUE];

const ASPECT_RATIO_OPTIONS: Array<{ value: AspectRatioValue; labelKey: string }> = [
	{ value: ASPECT_RATIO_VALUE.UNIFORM, labelKey: 'plugin.desktop-ui.menu.original' },
	{ value: ASPECT_RATIO_VALUE.FILL, labelKey: 'plugin.desktop-ui.menu.stretch' },
	{ value: ASPECT_RATIO_VALUE.EXACTFIT, labelKey: 'plugin.desktop-ui.menu.crop' },
	{ value: ASPECT_RATIO_VALUE.NONE, labelKey: 'plugin.desktop-ui.menu.native' },
];

export function renderAspectRatioPane(
	pane: HTMLDivElement,
	player: IVideoPlayer,
	listen: MenuListen,
	onPick: () => void,
): void {
	const scroll = pane.querySelector<HTMLDivElement>('.aspectRatio-scroll-container');
	if (!scroll)
		return;
	scroll.replaceChildren();

	const current = player.aspectRatio?.() ?? 'uniform';

	for (const opt of ASPECT_RATIO_OPTIONS) {
		const label = player.t(opt.labelKey);
		appendChoice(
			scroll,
			`aspect-ratio-${opt.value}`,
			label,
			opt.value === current,
			() => { player.aspectRatio(opt.value); onPick(); },
			listen,
			player,
		);
	}
}
