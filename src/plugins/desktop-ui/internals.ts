// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Shared `this`-context type used by every mixin in the desktop-ui plugin.
 *
 * Mixins composed onto `DesktopUiPlugin.prototype` via `composeMixins` need a
 * concrete `this` type so TypeScript can resolve `this.player`, `this.opts`,
 * and every plugin field without widening to `unknown`.
 *
 * This interface is NOT the public API — it is an internal contract between the
 * class body (which owns the fields) and the mixin objects (which own the
 * behaviour). It intentionally re-declares the protected Plugin helpers
 * (`on`, `once`, `listen`, `emit`, `timeout`, `storage`, `logger`, `t`,
 * `fetch`, `resolveUrl`, `lifecycle`, `mount`) as public so the mixin
 * functions can reach them. At runtime the methods ARE on the prototype —
 * the access-modifier change is TypeScript-only and carries no cost.
 */

import type { ILogger, IStorage, LifecycleRegistry, ResolvedUrl, UrlCategory } from '@nomercy-entertainment/nomercy-player-core';
import type { IVideoPlayer, VideoPlaylistItem } from '@nomercy-entertainment/nomercy-video-player';

import type { ActivityState } from './helpers/activity';
import type { MenuControlRefs, MenuControlState } from './helpers/menuControl';
import type { MenuFrameRefs, SubMenuId } from './helpers/menus';
import type { ChapterMarkerRef, SliderBarRefs } from './helpers/progressBar';
import type { ResponsiveState } from './helpers/responsive';
import type { SpriteSet } from './helpers/sprite';
import type { TopBarRefs } from './helpers/topBar';
import type {
	Breakpoint,
	DesktopUiButtonOptions,
	DesktopUiEvents,
	DesktopUiOptions,
} from './index';

/**
 * The complete `this` surface available inside every desktop-ui mixin method.
 *
 * Fields mirror `DesktopUiPlugin`'s private/public declarations exactly.
 * Plugin helpers are re-declared public so mixin functions (plain objects,
 * not class members) can access them without cast gymnastics.
 */
export interface DesktopUiInternals {
	// ── Player + options ────────────────────────────────────────────────────────
	readonly player: IVideoPlayer<VideoPlaylistItem>;
	opts: DesktopUiOptions;

	// ── Overlay root ─────────────────────────────────────────────────────────────
	overlayRoot: HTMLElement;

	// ── Top bar ──────────────────────────────────────────────────────────────────
	topBarRefs: TopBarRefs;

	// ── Center ───────────────────────────────────────────────────────────────────
	centerWrap: HTMLDivElement;
	centerBtn: HTMLButtonElement;
	messageEl: HTMLDivElement | null;
	messageTimer: ReturnType<typeof setTimeout> | null;
	messageIsFeedback: boolean;

	// ── Bottom bar ───────────────────────────────────────────────────────────────
	bottomBar: HTMLDivElement;

	// ── Slider-bar tree ──────────────────────────────────────────────────────────
	sliderRefs: SliderBarRefs;
	chapterRefs: ChapterMarkerRef[];

	// ── Sprite ───────────────────────────────────────────────────────────────────
	spriteSet: SpriteSet | null;
	spriteLoadId: number;
	spriteObjectUrl: string | null;

	// ── Scrub state ──────────────────────────────────────────────────────────────
	isMouseDown: boolean;
	isScrubbing: boolean;
	_showRemaining: boolean;

	// ── Transport buttons ────────────────────────────────────────────────────────
	playBtn: HTMLButtonElement;
	prevBtn: HTMLButtonElement;
	nextBtn: HTMLButtonElement;
	rewindBtn: HTMLButtonElement;
	forwardBtn: HTMLButtonElement;
	chapBackBtn: HTMLButtonElement;
	chapFwdBtn: HTMLButtonElement;
	volBtn: HTMLButtonElement;
	volSlider: HTMLInputElement;
	volSliderVertical: HTMLDivElement | null;
	volPopupMuteBtn: HTMLButtonElement | null;
	currentTimeEl: HTMLDivElement;
	remainingTimeEl: HTMLDivElement;
	aspectRatioBtn: HTMLButtonElement;
	speedBtn: HTMLButtonElement;
	qualityBtn: HTMLButtonElement;
	subsBtn: HTMLButtonElement;
	audioBtn: HTMLButtonElement;
	theaterBtn: HTMLButtonElement;
	theaterConfigHidden: boolean;
	fsActive: boolean;
	pipActive: boolean;
	pipBtn: HTMLButtonElement;
	playlistBtn: HTMLButtonElement;
	settingsBtn: HTMLButtonElement;
	fsBtn: HTMLButtonElement;

	// ── Menu refs ────────────────────────────────────────────────────────────────
	menus: MenuFrameRefs;
	_menuControlState: MenuControlState;
	_menuControlRefs: MenuControlRefs;

	// ── Keyboard shortcuts overlay ────────────────────────────────────────────────
	shortcutsOverlay: HTMLDivElement | null;
	_shortcutsVisible: boolean;

	// ── Extracted-concern state bags ──────────────────────────────────────────────
	_activityState: ActivityState;
	_responsiveState: ResponsiveState;

	// ── Misc ──────────────────────────────────────────────────────────────────────
	cachedDuration: number;
	_lastMouseX: number;
	_lastMouseY: number;
	_tooltipHoverToken: number | null;

	// ── Plugin helpers (re-declared public for mixin access) ──────────────────────
	readonly logger: ILogger;
	readonly storage: IStorage;
	readonly lifecycle: LifecycleRegistry;

	/** Scoped i18n lookup. */
	t(key: string, vars?: Record<string, string>): string;

	/** Scoped DOM event listener — auto-cleaned on plugin dispose. */
	listen(target: EventTarget, event: string, handler: EventListener, options?: AddEventListenerOptions): void;

	/** Scoped player event subscription — auto-cleaned on plugin dispose. */
	on(event: string, fn: (data: any) => void): void;

	/** Single-fire player event subscription — auto-cleaned on plugin dispose. */
	once(event: string, fn: (data: any) => void): void;

	/** Plugin-scoped event emit (namespaced under `plugin:desktop-ui:`). */
	emit<K extends keyof DesktopUiEvents>(event: K, data?: DesktopUiEvents[K]): void;

	/** Scoped setTimeout — cancelled on plugin dispose. */
	timeout(fn: () => void, ms: number): number;

	/** Auth-aware fetch. */
	fetch<T = string>(url: string, options?: { responseType?: 'text' | 'json' | 'arrayBuffer' }): Promise<T>;

	/** URL resolution through the player's configured resolver. */
	resolveUrl(url: string, category?: UrlCategory): Promise<ResolvedUrl>;

	/** Claim a `<div>` mount point on the player container. */
	mount(name: string): HTMLDivElement;

	/** Check whether any listener is registered for the given event. */
	hasListeners(event: string): boolean;

	// ── Methods declared on the class that mixins call cross-concern ──────────────

	/** Show a toast/feedback message on the player overlay. */
	showMessage(text: string, ms?: number, isFeedback?: boolean): void;

	/** Hide the current toast/feedback message. */
	hideMessage(): void;

	/** Apply icon + aria state for all icon-state methods. */
	applyMutedIcon(): void;

	/** Render chapter markers for the current item. */
	renderChapterMarkers(): void;

	/** Re-resolve and apply all transport button enabled states. */
	refreshTransportEnablement(): void;

	/** Re-resolve and apply capability-gated button visibility. */
	refreshCapabilityVisibility(): void;

	/** Compose display-state visibility (theater/PiP/fullscreen). */
	applyStateVisibility(): void;

	/** Show/hide a button based on content availability (not responsive rules). */
	setContentHidden(btn: HTMLButtonElement, hidden: boolean): void;

	/** Queue length safe accessor. */
	safeQueueLength(): number;

	/** Current queue index safe accessor. */
	safeCurrentIndex(): number;

	/** Return the active content duration (player → cached → element fallback). */
	resolveDuration(): number;

	/** Return the label for the currently playing quality level. */
	playingQualityLabel(): string | undefined;

	/** Return the currently playing quality level index. */
	resolvePlayingQualityIdx(): number | null;

	/** Bump the inactivity timer and show controls. */
	bumpActivity(): void;

	/** Close all open menus. */
	closeAllMenus(): void;

	/** Open the main settings menu. */
	openMainMenu(): void;

	/** Open a sub-menu by id. */
	openSubMenu(id: SubMenuId): void;

	/** Apply activity state. */
	maybeHide(): void;

	/** Dismiss overlay on background tap. */
	dismissOverlay(): void;

	// ── apply* icon helpers (called cross-concern) ────────────────────────────────
	applySubsIcon(): void;
	applyQualityIcon(): void;
	applyAudioIcon(): void;
	applyAspectRatioIcon(): void;
	applyPipIcon(active: boolean): void;
	applyTheaterIcon(active: boolean): void;
	applyFullscreen(): void;
	applyVolume(level: number): void;
	applyMuted(muted: boolean): void;
	applyRate(): void;
	applyTime(seconds: number): void;
	applyDuration(dur: number): void;

	// ── repaint helpers ───────────────────────────────────────────────────────────
	repaintSubsIfOpen(): void;
	repaintAudioIfOpen(): void;
	repaintQualityIfOpen(): void;
	repaintSpeedIfOpen(): void;
	repaintPlaylistIfOpen(): void;
	repaintAspectRatioIfOpen(): void;
	syncActiveIndexes(): void;

	// ── chapter helpers ───────────────────────────────────────────────────────────
	updateChapterProgress(pct: number): void;
	updateChapterBuffer(pct: number): void;
	updateChapterHover(pct: number): void;
	findChapterTitle(time: number): string | undefined;

	// ── scrub / sprite helpers ────────────────────────────────────────────────────
	getScrubTime(event: Event): { scrubTime: number; scrubTimePlayer: number };
	clampPopOffset(pct: number): number;
	paintSpriteAt(time: number): void;
	loadSpritesForItem(item: VideoPlaylistItem | undefined | null): Promise<void>;
	handleCurrentChange(item: VideoPlaylistItem | undefined | null): void;

	// ── chapter nav (called from wireEvents) ─────────────────────────────────────
	previousChapter(): void;
	nextChapter(): void;

	// ── playing state (called from wireEvents) ────────────────────────────────────
	setPlayingState(playing: boolean): void;

	// ── shortcut overlay helpers ──────────────────────────────────────────────────
	toggleShortcuts(): void;
	showShortcuts(): void;
	hideShortcuts(): void;
	wireSliderBar(): void;
	wireMenuKeyboardNav(): void;

	// ── format helper ─────────────────────────────────────────────────────────────
	_formatRemaining(cur: number, dur: number): string;
	_isLive(): boolean;
	_liveWindow(): { start: number; end: number } | null;
	applyLive(): void;

	// ── sprite URL ────────────────────────────────────────────────────────────────
	_resolveSpriteUrl(item: VideoPlaylistItem | undefined | null): string | undefined;
	_revokeSpriteObjectUrl(): void;

	// ── button helpers ────────────────────────────────────────────────────────────
	setDisabled(btn: HTMLButtonElement, disabled: boolean): void;

	// ── popup mute ────────────────────────────────────────────────────────────────
	applyPopupMuteIcon(muted: boolean): void;
	applyMenuSubsIcon(): void;

	// ── wireEvents / wireFeedback / buildDom ──────────────────────────────────────
	wireEvents(): void;
	wireFeedback(): void;
	buildDom(): void;
	wireTooltips(): void;
	applyInitialState(): void;
	wireKeybindHint(): void;
	refreshChaptersAndDuration(): void;

	// ── enabled() from Plugin ─────────────────────────────────────────────────────
	enabled(): boolean;

	// ── Breakpoint type re-export for responsive mixin ────────────────────────────
	readonly _breakpointType?: Breakpoint;
	readonly _buttonOptionsType?: DesktopUiButtonOptions;
}
