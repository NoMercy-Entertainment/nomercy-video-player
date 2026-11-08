// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Desktop UI overlay plugin for the video player.
 *
 * File map (desktop-ui/ folder):
 *
 *   index.ts               — DesktopUiPlugin class: static metadata, field
 *                            declarations, lifecycle overrides (use/disable/
 *                            enable/dispose), public surface (overlay()), and
 *                            composeMixins() call.
 *   internals.ts           — DesktopUiInternals interface: the shared
 *                            `this`-context for every mixin method.
 *   feedbackMethods.ts     — wireFeedback / showMessage / hideMessage.
 *   shortcutsMethods.ts    — toggleShortcuts / showShortcuts / hideShortcuts.
 *   activityMethods.ts     — bumpActivity / maybeHide / dismissOverlay.
 *   menuMethods.ts         — Menu open/close/repaint/keyboard-nav.
 *   iconStateMethods.ts    — apply* button-icon / aria helpers.
 *   transportStateMethods.ts — Time, duration, playing state, capability gating.
 *   chapterMethods.ts      — Chapter-marker DOM, progress/buffer/hover updates.
 *   spriteMethods.ts       — Sprite VTT loading + scrub-preview painting.
 *   domMethods.ts          — buildDom / wireTooltips / wireSliderBar / wireEvents.
 *   activity.ts            — setActivity / bumpActivity / maybeHide / dismissOverlay.
 *   dom.ts                 — buildCenter / buildBottomBar / buildShortcutsOverlay.
 *   responsive.ts          — wireResponsive / wireOrientation / wireNoHover /
 *                            wireVolumeSlider / applyAllVisibilityRules.
 *   tooltips.ts            — addTooltip / clampTooltip / wireTooltips.
 *   topBar.ts              — Top-bar DOM + title/show-info update + back/cast/close buttons.
 *   progressBar.ts         — Slider-bar DOM, chapter-marker rendering, formatSeconds.
 *   buttonState.ts         — apply* pure DOM-mutation free functions.
 *   menus.ts               — Menu-frame DOM + all sub-pane renderers.
 *   menuControl.ts         — Menu open/close orchestration, keyboard nav, repaints.
 *   buttons.ts             — Fluent UI icon SVG path data table.
 *   icons.ts               — svgFromIcon() renderer on top of buttons.ts.
 *   sprite.ts              — Sprite VTT parser + thumbnail lookup.
 *   chapters.ts            — findChapterTitle / nextChapter / previousChapter.
 *
 * Mixin composition (how the class is built):
 *
 *   The class body holds only:
 *     - static metadata (id, version, description, translations)
 *     - private field declarations (state owned by the plugin)
 *     - lifecycle overrides that call `super` (use/disable/enable/dispose)
 *     - the public `overlay()` surface
 *     - `declare` signatures for every mixin method
 *
 *   `composeMixins(DesktopUiPlugin.prototype, ...)` at the bottom stamps the
 *   method bodies onto the prototype from the `*Methods` objects.
 *   This mirrors exactly how NMVideoPlayer is built from playerCoreMethods.
 *
 * UX rule — menu vs. cycle:
 *   Pointer-input buttons (control bar) open menus for multi-state features.
 *   The cycle action (cycleAspectRatio, etc.) is for remote-control and key-bind
 *   contexts where the user cannot pick from a list. Quality, subtitles, audio,
 *   speed, and aspect-ratio are all menu-driven on click. Theater / PiP /
 *   Fullscreen are binary toggles — direct action on click is correct for those.
 *
 * DOM tree:
 *
 *   overlay
 *     ├─ top-bar > title              (topBar.ts)
 *     ├─ center > spinner + center-btn
 *     ├─ bottom-bar
 *     │   ├─ bottom-bar-shadow
 *     │   ├─ top-row                        (progressBar.ts)
 *     │   │   └─ slider-bar
 *     │   │       ├─ slider-buffer
 *     │   │       ├─ slider-hover
 *     │   │       ├─ slider-progress
 *     │   │       ├─ chapter-progress × N
 *     │   │       ├─ slider-nipple
 *     │   │       └─ slider-pop
 *     │   └─ bottom-row
 *     │       ├─ transport buttons          (buttonState.ts for icon state)
 *     │       ├─ volume-container
 *     │       ├─ current-time + remaining-time
 *     │       └─ feature buttons
 *     └─ menu-frame-dialog                  (menus.ts)
 *
 * Segmented-buffer rendering: when the item has chapters, sliderBuffer is
 * hidden and each chapter-marker carries its own buffer div. See progressBar.ts
 * for the scaleX fill math. The 2 px gap from `calc(width% - 2px)` aligns
 * segments with chapter dividers automatically.
 */

import type { Translations } from '@nomercy-entertainment/nomercy-player-core';
import type { IVideoPlayer, VideoPlaylistItem } from '@nomercy-entertainment/nomercy-video-player';

import type { ActivityState } from './helpers/activity';
import type { MenuControlRefs, MenuControlState } from './helpers/menuControl';
import type { MenuFrameRefs, SettingsToggleItem, SubMenuId, SubtitleMenuAction } from './helpers/menus';
import type { ChapterMarkerRef, SliderBarRefs } from './helpers/progressBar';
import type { ResponsiveState } from './helpers/responsive';
import type { SpriteSet } from './helpers/sprite';
import type { TopBarRefs } from './helpers/topBar';

import { composeMixins, Plugin, translationsFromGlob } from '@nomercy-entertainment/nomercy-player-core';

import { setActivity } from './helpers/activity';
import { makeResponsiveState, wireNoHover, wireOrientation, wireResponsive } from './helpers/responsive';
import { activityMethods } from './mixins/activityMethods';
import { chapterMethods } from './mixins/chapterMethods';
import { domMethods } from './mixins/domMethods';
import { feedbackMethods } from './mixins/feedbackMethods';
import { iconStateMethods } from './mixins/iconStateMethods';
import { menuMethods } from './mixins/menuMethods';
import { shortcutsMethods } from './mixins/shortcutsMethods';
import { spriteMethods } from './mixins/spriteMethods';
import { transportStateMethods } from './mixins/transportStateMethods';

/**
 * Per-button visibility overrides for the desktop UI control bar.
 *
 * Default-ON buttons (omit or set `true` to show): play, mute, volume,
 * fullscreen, settings, chapterPrev, chapterNext.
 * Chapter buttons are hidden automatically when the current item has no chapters
 * (content gating via `data-content-hidden`).
 *
 * Default-OFF buttons (set `true` to enable): theater, pip, speed, quality,
 * subtitles, audio, playlist, seekBack, seekForward, aspectRatio.
 * `seekBack` / `seekForward` default to false because ±10 s seek is available
 * on touch zones (double-tap) and keyboard (ArrowLeft/Right). Chapter buttons
 * are the unique value in the control bar.
 *
 * Navigation (always-on when queue has multiple items): next, previous.
 *
 * `cast` is the one entry here that isn't a control-bar button — it renders in
 * the TOP bar, next to back/close. Default-OFF; set
 * `true` to show it. Clicking it only emits the `cast` player event, the same
 * pattern the back button uses for `back` — the player never opens a device
 * picker itself, that's entirely the consumer's job.
 */
export interface DesktopUiButtonOptions {
	play?: boolean;
	mute?: boolean;
	volume?: boolean;
	fullscreen?: boolean;
	settings?: boolean;
	next?: boolean;
	previous?: boolean;
	theater?: boolean;
	pip?: boolean;
	speed?: boolean;
	quality?: boolean;
	subtitles?: boolean;
	audio?: boolean;
	playlist?: boolean;
	chapterPrev?: boolean;
	chapterNext?: boolean;
	seekBack?: boolean;
	seekForward?: boolean;
	aspectRatio?: boolean;
	/** Top-bar cast button, next to back/close. Default off. See interface doc. */
	cast?: boolean;
}

/**
 * Priority order for responsive button removal. When the container narrows,
 * buttons at the END of the array are hidden first. The default order puts
 * the most essential buttons first so they survive longest.
 *
 * Only include buttons that are enabled via `buttons`. Buttons not in the list
 * keep whatever visibility the content rules gave them.
 */
export type ButtonPriorityList = ReadonlyArray<keyof DesktopUiButtonOptions>;

/**
 * A single responsive breakpoint. Below `maxWidth` (container pixels), only
 * buttons up to `hideAfterRank` in the priority list are shown. Rank 0 means
 * only the first button in the priority list survives; `Infinity` means
 * show all buttons.
 *
 * @example
 * // Hide everything past the 4th-priority button below 480 px:
 * { name: 'sm', maxWidth: 480, hideAfterRank: 3 }
 */
export interface Breakpoint {
	/** Human-readable name, also set as a `data-breakpoint` attribute on the container. */
	name: string;
	/** Container width (px) at which this breakpoint activates. Use `Infinity` for the largest tier. */
	maxWidth: number;
	/** Buttons with a priority rank strictly greater than this value are hidden at this breakpoint. */
	hideAfterRank: number;
}

/**
 * Payload emitted on every breakpoint transition.
 *
 * Subscribe cross-plugin style:
 * ```ts
 * this.on(DesktopUiPlugin, 'layout:breakpoint', (data) => {
 *     console.log(data.to, data.hiddenButtons);
 * });
 * ```
 */
export interface LayoutBreakpointPayload {
	/** Name of the breakpoint that was active before this resize. */
	from: string;
	/** Name of the breakpoint now active. */
	to: string;
	/** Button keys still visible at the new breakpoint. */
	visibleButtons: ReadonlyArray<keyof DesktopUiButtonOptions>;
	/** Button keys hidden by the new breakpoint (excludes always-hidden buttons). */
	hiddenButtons: ReadonlyArray<keyof DesktopUiButtonOptions>;
}

export interface DesktopUiOptions {
	hideTitle?: boolean;
	disableClickToPause?: boolean;
	inactivityMs?: number;
	imageBaseUrl?: string;

	/** Per-button opt-in / opt-out. Unset keys use the button's own default. */
	buttons?: DesktopUiButtonOptions;

	/**
	 * Visual order override. Buttons named here are re-anchored to the end
	 * of the bar in the given sequence; unnamed buttons keep their natural
	 * position. Independent of `buttonPriority` (responsive removal order).
	 *
	 * @example
	 * buttonOrder: ['playlist', 'subtitles', 'audio', 'quality', 'pip', 'settings', 'fullscreen']
	 */
	buttonOrder?: ReadonlyArray<keyof DesktopUiButtonOptions>;

	/**
	 * Consumer toggle rows appended to the settings main menu (e.g. an
	 * app's auto-skip switch). Labels resolve at render time; `get`/`set`
	 * bind each row to wherever the state lives.
	 */
	settingsItems?: ReadonlyArray<SettingsToggleItem>;

	/**
	 * Consumer action row(s) appended to the subtitles sub-menu (e.g. a
	 * "Search subtitles online…" entry that opens the app's own dialog).
	 * Shown whenever provided — including when the current item has zero
	 * subtitle tracks, since that's exactly when an external-search action
	 * matters most.
	 */
	subtitleMenuActions?: ReadonlyArray<SubtitleMenuAction>;

	/**
	 * Consumer action row(s) appended to the MAIN settings menu, after any
	 * `settingsItems` toggle rows — e.g. a "Cast to device…" entry that opens
	 * the app's own device picker. Same row shape as `subtitleMenuActions`;
	 * only the mount point differs. This is the sanctioned way to add an
	 * app-owned action to the settings menu without the player taking any
	 * opinion on what the action does — casting/device-switch is a consumer
	 * concern, this only gives it a place to live.
	 */
	settingsMenuActions?: ReadonlyArray<SubtitleMenuAction>;

	/**
	 * Priority order for responsive removal when the container is narrow.
	 * Buttons at the end are removed first. Override to change the default order.
	 *
	 * Default order: play → mute → volume → fullscreen → settings → next →
	 * previous → chapterPrev → chapterNext → seekBack → seekForward →
	 * theater → pip → speed → quality → subtitles → audio → aspectRatio → playlist.
	 */
	buttonPriority?: ButtonPriorityList;

	/**
	 * Buttons forced off in portrait regardless of available width, replacing the
	 * default set entirely (pass `[]` to force nothing off and let width alone
	 * decide).
	 *
	 * Portrait has room for roughly five or six controls, so something has to go;
	 * which ones depends on the content. An episodic app wants `next` and
	 * `chapterNext` to survive so a viewer can skip an intro one-handed, while a
	 * single-video app would rather keep `quality`.
	 *
	 * Default: `chapterPrev`, `chapterNext`, `previous`, `next`, `subtitles`,
	 * `audio`, `quality`, `playlist`.
	 */
	portraitHidden?: Array<keyof DesktopUiButtonOptions>;

	/**
	 * Full breakpoint progression. When provided, takes precedence over
	 * `collapseStages`. Each entry says "below `maxWidth` px, hide buttons
	 * whose priority rank exceeds `hideAfterRank`."
	 *
	 * Entries must be ordered from smallest `maxWidth` to largest.
	 * The last entry should use `maxWidth: Infinity` to cover all wider sizes.
	 *
	 * @example
	 * breakpoints: [
	 *   { name: 'xs', maxWidth: 320,      hideAfterRank: 1 },
	 *   { name: 'sm', maxWidth: 480,      hideAfterRank: 4 },
	 *   { name: 'md', maxWidth: 720,      hideAfterRank: 8 },
	 *   { name: 'lg', maxWidth: 1024,     hideAfterRank: 13 },
	 *   { name: 'xl', maxWidth: Infinity, hideAfterRank: Infinity },
	 * ]
	 */
	breakpoints?: Breakpoint[];

	/**
	 * Shorthand alternative to `breakpoints`. Provide an array of `hideAfterRank`
	 * values for the sm / md / lg tiers (xs is always rank 1, xl always shows all).
	 * Ignored when `breakpoints` is provided.
	 *
	 * @example
	 * // Hide after rank 2 at sm, rank 4 at md, rank 6 at lg:
	 * collapseStages: [2, 4, 6]
	 */
	collapseStages?: [number, number, number];

	/**
	 * Volume slider orientation.
	 * - `'horizontal'` — inline slider that expands on hover (default).
	 * - `'vertical'`   — popup slider above the mute button, toggle on click.
	 * - `'auto'`       — vertical when the player width is ≤ 520 px, else horizontal.
	 */
	volumeSlider?: 'horizontal' | 'vertical' | 'auto';
}

/** Events emitted by {@link DesktopUiPlugin} under the `plugin:desktop-ui:` namespace. */
export interface DesktopUiEvents {
	'shortcuts-toggle': undefined;
	'layout:breakpoint': LayoutBreakpointPayload;
	'opts:changed': DesktopUiOptions;
}

// =============================================================================
// Plugin class — state fields + lifecycle overrides + declare signatures
// =============================================================================

export class DesktopUiPlugin extends Plugin<IVideoPlayer<VideoPlaylistItem>, DesktopUiOptions, DesktopUiEvents> {
	static override readonly id: string = 'desktop-ui';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'Official desktop UI overlay (v2 rewrite)';
	static override readonly moduleUrl: string = import.meta.url;

	static override readonly translations: Translations = translationsFromGlob('./i18n/*.ts');

	// ── overlay root ────────────────────────────────────────────────
	private overlayRoot!: HTMLElement;

	// ── top bar ─────────────────────────────────────────────────────
	private declare topBarRefs: TopBarRefs;

	// ── center ──────────────────────────────────────────────────────
	private declare centerWrap: HTMLDivElement;
	private declare centerBtn: HTMLButtonElement;
	/** Center toast / status line — `display-message` renderer + loading/buffering/error feedback. Lives on the container so it survives overlay auto-hide. */
	private declare messageEl: HTMLDivElement | null;
	private declare messageTimer: ReturnType<typeof setTimeout> | null;
	/** `true` while the current message is playback feedback (loading/buffering/error) rather than a consumer toast — feedback clears automatically when playback recovers. */
	private declare messageIsFeedback: boolean;

	// ── bottom bar ──────────────────────────────────────────────────
	private declare bottomBar: HTMLDivElement;

	// ── slider-bar tree ─────────────────────────────────────────────
	private declare sliderRefs: SliderBarRefs;
	private declare chapterRefs: ChapterMarkerRef[];

	/** Sprite preview thumbnails for the current playlist item. */
	private declare spriteSet: SpriteSet | null;
	private declare spriteLoadId: number;
	private declare spriteObjectUrl: string | null;

	private declare isMouseDown: boolean;
	private declare isScrubbing: boolean;
	private declare _showRemaining: boolean;

	// ── transport buttons ───────────────────────────────────────────
	private playBtn!: HTMLButtonElement;
	private prevBtn!: HTMLButtonElement;
	private nextBtn!: HTMLButtonElement;
	private rewindBtn!: HTMLButtonElement;
	private forwardBtn!: HTMLButtonElement;
	private chapBackBtn!: HTMLButtonElement;
	private chapFwdBtn!: HTMLButtonElement;
	private volBtn!: HTMLButtonElement;
	private declare volSlider: HTMLInputElement;
	/** Vertical volume slider popup. Null until `buildDom` creates it. */
	private declare volSliderVertical: HTMLDivElement | null;
	/** Mute toggle inside the vertical volume popup. Null until `buildDom` creates it. */
	private declare volPopupMuteBtn: HTMLButtonElement | null;
	private declare currentTimeEl: HTMLDivElement;
	private declare remainingTimeEl: HTMLDivElement;
	private aspectRatioBtn!: HTMLButtonElement;
	private speedBtn!: HTMLButtonElement;
	private qualityBtn!: HTMLButtonElement;
	private subsBtn!: HTMLButtonElement;
	private audioBtn!: HTMLButtonElement;
	private theaterBtn!: HTMLButtonElement;
	/** Theater's config-level visibility, captured at build — state hiding (fullscreen/PiP) composes on top, never overrides an opt-out. */
	private declare theaterConfigHidden: boolean;
	private declare fsActive: boolean;
	private declare pipActive: boolean;
	private pipBtn!: HTMLButtonElement;
	private playlistBtn!: HTMLButtonElement;
	private settingsBtn!: HTMLButtonElement;
	private fsBtn!: HTMLButtonElement;

	// ── menu refs ───────────────────────────────────────────────────
	private declare menus: MenuFrameRefs;
	private declare _menuControlState: MenuControlState;
	private declare _menuControlRefs: MenuControlRefs;

	// ── keyboard shortcuts overlay ───────────────────────────────────
	private declare shortcutsOverlay: HTMLDivElement | null;
	private declare _shortcutsVisible: boolean;

	// ── extracted-concern state ─────────────────────────────────────
	private declare _activityState: ActivityState;

	private declare _responsiveState: ResponsiveState;

	private declare cachedDuration: number;
	private declare _lastMouseX: number;
	private declare _lastMouseY: number;
	private declare _tooltipHoverToken: number | null;

	/** Initializes all mixin-owned state fields to their default values. Called at the top of `use()` before any mixin or DOM method runs. */
	private initState(): void {
		this.messageEl = null;
		this.messageTimer = null;
		this.messageIsFeedback = false;
		this.chapterRefs = [];
		this.spriteSet = null;
		this.spriteLoadId = 0;
		this.spriteObjectUrl = null;
		this.isMouseDown = false;
		this.isScrubbing = false;
		this._showRemaining = true;
		this.volSliderVertical = null;
		this.volPopupMuteBtn = null;
		this.theaterConfigHidden = false;
		this.fsActive = false;
		this.pipActive = false;
		this.shortcutsOverlay = null;
		this._shortcutsVisible = false;
		this._activityState = {
			activityActive: false,
			inactivityToken: null,
			menuOpen: false,
			isScrubbing: false,
			isControlsHovered: false,
			chromeHolds: 0,
		};
		this._responsiveState = makeResponsiveState();
		this.cachedDuration = 0;
		this._lastMouseX = -1;
		this._lastMouseY = -1;
		this._tooltipHoverToken = null;
	}

	// ── Lifecycle overrides — these call super so they CANNOT be mixins ──────

	override use(): void {
		// This plugin runs its own activity state machine (menu-open and hover
		// pinning, scrub state) — take over as the sole `activity` emitter so
		// the player's built-in tracker never fights it, and hand ownership
		// back at teardown so a UI-less player regains the default behavior.
		this.player.activityTracking(false);
		this.lifecycle.addCleanup(() => this.player.activityTracking(true));

		this.initState();
		this.appendStyles(new URL('./styles.css', import.meta.url).href, 'desktop-ui-styles');
		this.buildDom();
		this.wireTooltips();
		this.wireEvents();
		this.wireFeedback();
		this.wireMenuKeyboardNav();
		wireOrientation(
			this._responsiveState,
			this.player.container,
			this.opts,
			this.listen.bind(this),
			payload => this.emit('layout:breakpoint', payload),
		);
		wireNoHover(
			this._responsiveState,
			this.player.container,
			this.opts,
			this.listen.bind(this),
			payload => this.emit('layout:breakpoint', payload),
		);
		wireResponsive(
			this._responsiveState,
			{
				playBtn: this.playBtn,
				volBtn: this.volBtn,
				fsBtn: this.fsBtn,
				settingsBtn: this.settingsBtn,
				nextBtn: this.nextBtn,
				prevBtn: this.prevBtn,
				rewindBtn: this.rewindBtn,
				forwardBtn: this.forwardBtn,
				chapBackBtn: this.chapBackBtn,
				chapFwdBtn: this.chapFwdBtn,
				theaterBtn: this.theaterBtn,
				pipBtn: this.pipBtn,
				speedBtn: this.speedBtn,
				qualityBtn: this.qualityBtn,
				subsBtn: this.subsBtn,
				audioBtn: this.audioBtn,
				aspectRatioBtn: this.aspectRatioBtn,
				playlistBtn: this.playlistBtn,
			},
			this.player.container,
			this.opts,
			fn => this.lifecycle.addCleanup(fn),
			payload => this.emit('layout:breakpoint', payload),
		);
		void Promise.resolve(this.storage.getJSON('showRemaining')).then((stored) => {
			this._showRemaining = (stored as boolean | null) ?? true;
		});
		this.applyInitialState();
		this.bumpActivity();
		this.wireKeybindHint();
	}

	/**
	 * Disabling hides the overlay outright, not just its handlers. A peer that
	 * owns the screen (e.g. a disc-menu interpreter painting the disc's own
	 * chrome) disables this plugin to take over; leaving the rendered control
	 * bar on top would double up the chrome. The inactivity timer is cancelled
	 * and one final `activity:false` is emitted so nothing re-shows it while off.
	 */
	override disable(reason?: string): void {
		if (!this.enabled())
			return;
		super.disable(reason);
		if (this._activityState.inactivityToken !== null) {
			clearTimeout(this._activityState.inactivityToken);
			this._activityState.inactivityToken = null;
		}
		this.overlayRoot.hidden = true;
		setActivity(this._activityState, this.player, false);
	}

	/** Re-enabling restores the overlay and re-arms the auto-hide cycle. */
	override enable(): void {
		if (this.enabled())
			return;
		super.enable();
		this.overlayRoot.hidden = false;
		this.bumpActivity();
	}

	override dispose(): void {
		this._revokeSpriteObjectUrl();
	}

	/**
	 * The overlay root — the auto-hiding chrome layer this plugin owns.
	 * Other plugins mount their UI here (via
	 * `player.getPlugin(DesktopUiPlugin)?.overlay()`) so their elements
	 * inherit the overlay's show/hide lifecycle instead of floating over a
	 * hidden chrome. Returns `null` before `use()` has built the DOM — a
	 * field initializer would capture `undefined` forever, hence the method.
	 */
	overlay(): HTMLElement | null {
		return this.overlayRoot ?? null;
	}

	/**
	 * Pin the chrome visible while an external overlay of your own is open — a
	 * device picker or cast panel that lives outside this plugin but is anchored
	 * to its top/bottom bars, and so must not let them auto-hide underneath it.
	 * Shows the chrome now and holds it until every hold is released. Balance
	 * each call with exactly one `releaseChrome()`.
	 *
	 * This plugin's own menus don't need it — they already pin via `menuOpen`.
	 */
	holdChrome(): void {
		this._activityState.chromeHolds += 1;
		this.bumpActivity();
	}

	/**
	 * Release one `holdChrome()`. The auto-hide countdown resumes only once the
	 * last hold is gone. Extra releases are floored at zero rather than going
	 * negative, so a double-release can't wedge the chrome permanently hidden.
	 */
	releaseChrome(): void {
		this._activityState.chromeHolds = Math.max(0, this._activityState.chromeHolds - 1);
		if (this._activityState.chromeHolds === 0)
			this.bumpActivity();
	}

	// ── Declare signatures for mixin methods — bodies live in the mixin objects ──

	declare wireFeedback: () => void;
	declare showMessage: (text: string, ms?: number, isFeedback?: boolean) => void;
	declare hideMessage: () => void;

	declare toggleShortcuts: () => void;
	declare showShortcuts: () => void;
	declare hideShortcuts: () => void;

	declare bumpActivity: () => void;
	declare maybeHide: () => void;
	declare dismissOverlay: () => void;

	declare openMainMenu: () => void;
	declare openSubMenu: (id: SubMenuId) => void;
	declare wireMenuKeyboardNav: () => void;
	declare closeAllMenus: () => void;
	declare syncActiveIndexes: () => void;
	declare repaintSubsIfOpen: () => void;
	declare repaintAudioIfOpen: () => void;
	declare repaintQualityIfOpen: () => void;
	declare repaintSpeedIfOpen: () => void;
	declare repaintPlaylistIfOpen: () => void;
	declare repaintAspectRatioIfOpen: () => void;

	declare applyVolume: (level: number) => void;
	declare applyMuted: (muted: boolean) => void;
	declare applyMutedIcon: () => void;
	declare applyPopupMuteIcon: (muted: boolean) => void;
	declare applyRate: () => void;
	declare applyAudioIcon: () => void;
	declare applyQualityIcon: () => void;
	declare playingQualityLabel: () => string | undefined;
	declare resolvePlayingQualityIdx: () => number | null;
	declare applyFullscreen: () => void;
	declare applyTheaterIcon: (active: boolean) => void;
	declare applySubsIcon: () => void;
	declare applyMenuSubsIcon: () => void;
	declare applyPipIcon: (active: boolean) => void;
	declare applyAspectRatioIcon: () => void;

	declare setPlayingState: (playing: boolean) => void;
	declare handleCurrentChange: (item: VideoPlaylistItem | undefined | null) => void;
	declare applyTime: (seconds: number) => void;
	declare applyDuration: (dur: number) => void;
	declare _formatRemaining: (cur: number, dur: number) => string;
	declare _isLive: () => boolean;
	declare _liveWindow: () => { start: number; end: number } | null;
	declare applyLive: () => void;
	declare applyStateVisibility: () => void;
	declare setContentHidden: (btn: HTMLButtonElement, hidden: boolean) => void;
	declare refreshCapabilityVisibility: () => void;
	declare refreshTransportEnablement: () => void;
	declare setDisabled: (btn: HTMLButtonElement, disabled: boolean) => void;
	declare safeCurrentIndex: () => number;
	declare safeQueueLength: () => number;

	declare resolveDuration: () => number;
	declare refreshChaptersAndDuration: () => void;
	declare renderChapterMarkers: () => void;
	declare updateChapterProgress: (pct: number) => void;
	declare updateChapterBuffer: (pct: number) => void;
	declare updateChapterHover: (pct: number) => void;
	declare findChapterTitle: (time: number) => string | undefined;
	declare previousChapter: () => void;
	declare nextChapter: () => void;

	declare getScrubTime: (event: Event) => { scrubTime: number; scrubTimePlayer: number };
	declare clampPopOffset: (pct: number) => number;
	declare paintSpriteAt: (time: number) => void;
	declare _resolveSpriteUrl: (item: VideoPlaylistItem | undefined | null) => string | undefined;
	declare _revokeSpriteObjectUrl: () => void;
	declare loadSpritesForItem: (item: VideoPlaylistItem | undefined | null) => Promise<void>;

	declare buildDom: () => void;
	declare wireTooltips: () => void;
	declare applyInitialState: () => void;
	declare wireKeybindHint: () => void;
	declare wireSliderBar: () => void;
	declare wireEvents: () => void;
}

composeMixins(
	DesktopUiPlugin.prototype,
	feedbackMethods,
	shortcutsMethods,
	activityMethods,
	menuMethods,
	iconStateMethods,
	transportStateMethods,
	chapterMethods,
	spriteMethods,
	domMethods,
);

export const desktopUiPlugin = DesktopUiPlugin;
