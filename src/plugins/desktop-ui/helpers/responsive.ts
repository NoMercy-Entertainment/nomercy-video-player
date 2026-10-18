// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Responsive / breakpoint / orientation / volume-slider concern for the
 * desktop UI plugin.
 *
 * Owns:
 *   - `wireOrientation`   — portrait/landscape MediaQueryList listener
 *   - `wireNoHover`       — touch-only device detection
 *   - `wireResponsive`    — ResizeObserver → `applyAllVisibilityRules`
 *   - `wireVolumeSlider`  — horizontal / vertical / auto volume slider mode
 *   - `applyAllVisibilityRules` — the four-rule button visibility pass
 *   - `shouldShowButton` / `buttonFootprint` — per-button fit helpers
 *   - `initButtonMap`     — builds the key→element lookup after DOM is ready
 *   - `resolveBreakpoints` — derives the active breakpoint progression from opts
 *
 * Integration: called from `DesktopUiPlugin.use()` after `buildDom()`.
 * All mutable state is held in `ResponsiveState`; the plugin stores one
 * instance and passes it to every call here.
 *
 * Exported constants (`DEFAULT_PRIORITY`, `DEFAULT_BREAKPOINTS`,
 * `PORTRAIT_HIDDEN`, `BUTTON_WIDTH`, `VOL_SLIDER_EXPANDED_WIDTH`) replace the
 * former `static readonly` members on the plugin class.
 */

import type { Breakpoint, ButtonPriorityList, DesktopUiButtonOptions, DesktopUiOptions, LayoutBreakpointPayload } from '../index';

// ── Re-exported constants (previously static class members) ───────────────────

export const BUTTON_WIDTH = 40;
export const VOL_SLIDER_EXPANDED_WIDTH = 96;

/**
 * Default set forced off in portrait regardless of width.
 *
 * A default, not a rule: override it per consumer with
 * `DesktopUiOptions.portraitHidden`. A phone viewer who wants to skip an intro
 * or jump to the next episode shouldn't have to rotate the device, but which
 * controls earn that scarce row is the app's call, not the library's.
 */
export const PORTRAIT_HIDDEN: ReadonlySet<keyof DesktopUiButtonOptions> = new Set([
	'chapterPrev',
	'chapterNext',
	'previous',
	'next',
	'subtitles',
	'audio',
	'quality',
	'playlist',
]);

/** Default priority list — most essential first, least essential last. */
export const DEFAULT_PRIORITY: ButtonPriorityList = [
	'play',
	'mute',
	'volume',
	'fullscreen',
	'settings',
	'next',
	'previous',
	'chapterPrev',
	'chapterNext',
	// Forward above back: the two are a pair, and ranking back higher made the
	// bar drop forward first and leave a lone rewind button on it — a player that
	// looks like it can only go backwards. Forward is also the one that earns the
	// place, because skipping an intro is what it is for.
	'seekForward',
	// Subtitles and audio outrank seekBack, theater, pip and speed.
	//
	// A narrow bar that keeps a picture-in-picture button and drops the subtitle
	// menu has kept a convenience and lost the control some viewers cannot watch
	// without. Subtitles sit above audio because a track nobody can read is worse
	// than a language nobody can change, and both sit above the four framing and
	// pacing controls, which every one of them is a preference rather than access.
	'quality',
	'subtitles',
	'audio',
	'seekBack',
	'theater',
	'pip',
	'speed',
	'aspectRatio',
	'playlist',
];

/**
 * Default breakpoint progression:
 * - xs (≤ 320): play + mute only (rank 0–1)
 * - sm (≤ 480): play / mute / fullscreen / settings (rank 0–4)
 * - md (≤ 720): + nav + chapter buttons (rank 0–8)
 * - lg (≤ 1024): + theater / pip / speed (rank 0–13)
 * - xl (> 1024): all buttons visible
 */
export const DEFAULT_BREAKPOINTS: ReadonlyArray<Breakpoint> = [
	{ name: 'xs', maxWidth: 320, hideAfterRank: 1 },
	{ name: 'sm', maxWidth: 480, hideAfterRank: 4 },
	{ name: 'md', maxWidth: 720, hideAfterRank: 8 },
	{ name: 'lg', maxWidth: 1024, hideAfterRank: 13 },
	{ name: 'xl', maxWidth: Infinity, hideAfterRank: Infinity },
];

// ── Mutable state bag ─────────────────────────────────────────────────────────

export interface ResponsiveState {
	isPortrait: boolean;
	isNoHover: boolean;
	lastContainerWidth: number;
	currentBreakpointName: string;
	buttonMap: Record<keyof DesktopUiButtonOptions, HTMLButtonElement | null> | null;
	resizeObserver: ResizeObserver | null;
	volSliderVerticalOpen: boolean;
}

export function makeResponsiveState(): ResponsiveState {
	return {
		isPortrait: false,
		isNoHover: false,
		lastContainerWidth: 0,
		currentBreakpointName: 'xl',
		buttonMap: null,
		resizeObserver: null,
		volSliderVerticalOpen: false,
	};
}

// ── Button-refs bag (for initButtonMap) ───────────────────────────────────────

export interface ResponsiveButtonRefs {
	playBtn: HTMLButtonElement;
	volBtn: HTMLButtonElement;
	fsBtn: HTMLButtonElement;
	settingsBtn: HTMLButtonElement;
	nextBtn: HTMLButtonElement;
	prevBtn: HTMLButtonElement;
	rewindBtn: HTMLButtonElement;
	forwardBtn: HTMLButtonElement;
	chapBackBtn: HTMLButtonElement;
	chapFwdBtn: HTMLButtonElement;
	theaterBtn: HTMLButtonElement;
	pipBtn: HTMLButtonElement;
	speedBtn: HTMLButtonElement;
	qualityBtn: HTMLButtonElement;
	subsBtn: HTMLButtonElement;
	audioBtn: HTMLButtonElement;
	aspectRatioBtn: HTMLButtonElement;
	playlistBtn: HTMLButtonElement;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Resolve the active breakpoint progression from consumer options. */
export function resolveBreakpoints(opts: DesktopUiOptions | undefined): ReadonlyArray<Breakpoint> {
	if (opts?.breakpoints && opts.breakpoints.length > 0)
		return opts.breakpoints;

	const stages = opts?.collapseStages;
	if (stages) {
		return [
			{ name: 'xs', maxWidth: 320, hideAfterRank: 1 },
			{ name: 'sm', maxWidth: 480, hideAfterRank: stages[0] },
			{ name: 'md', maxWidth: 720, hideAfterRank: stages[1] },
			{ name: 'lg', maxWidth: 1024, hideAfterRank: stages[2] },
			{ name: 'xl', maxWidth: Infinity, hideAfterRank: Infinity },
		];
	}

	return DEFAULT_BREAKPOINTS;
}

function buttonVisible(
	key: keyof DesktopUiButtonOptions,
	opts: DesktopUiButtonOptions | undefined,
): boolean {
	const DEFAULT_ON: ReadonlySet<keyof DesktopUiButtonOptions> = new Set([
		'play',
		'mute',
		'volume',
		'fullscreen',
		'settings',
		'next',
		'previous',
		'chapterPrev',
		'chapterNext',
	]);
	if (opts && key in opts)
		return Boolean(opts[key]);
	return DEFAULT_ON.has(key);
}

/** Estimated pixel footprint of a button in the bottom row. */
export function buttonFootprint(
	key: keyof DesktopUiButtonOptions,
	isNoHover: boolean,
): number {
	return (key === 'mute' && !isNoHover)
		? BUTTON_WIDTH + VOL_SLIDER_EXPANDED_WIDTH
		: BUTTON_WIDTH;
}

/**
 * Returns `true` when the button should be visible at the given accumulated
 * width. Applies the four-rule composition:
 *   1. Consumer opt-out
 *   3. Orientation (portrait hides a fixed set)
 *   4. Container fit
 * Rule 2 (content-gating) is checked by the caller before calling this.
 */
export function shouldShowButton(
	key: keyof DesktopUiButtonOptions,
	accumulatedWidth: number,
	containerWidth: number,
	isPortrait: boolean,
	isNoHover: boolean,
	buttonOpts: DesktopUiButtonOptions | undefined,
	portraitHidden: ReadonlySet<keyof DesktopUiButtonOptions> = PORTRAIT_HIDDEN,
): boolean {
	if (!buttonVisible(key, buttonOpts))
		return false;

	if (isPortrait && portraitHidden.has(key))
		return false;

	return accumulatedWidth + buttonFootprint(key, isNoHover) <= containerWidth;
}

/** Resolves the consumer's portrait override, falling back to the default set. */
export function resolvePortraitHidden(opts: DesktopUiOptions | undefined): ReadonlySet<keyof DesktopUiButtonOptions> {
	return opts?.portraitHidden ? new Set(opts.portraitHidden) : PORTRAIT_HIDDEN;
}

/** Build the key→element map once the DOM is ready. */
export function initButtonMap(
	refs: ResponsiveButtonRefs,
): Record<keyof DesktopUiButtonOptions, HTMLButtonElement | null> {
	return {
		play: refs.playBtn,
		mute: refs.volBtn,
		volume: null,
		fullscreen: refs.fsBtn,
		settings: refs.settingsBtn,
		next: refs.nextBtn,
		previous: refs.prevBtn,
		seekBack: refs.rewindBtn,
		seekForward: refs.forwardBtn,
		chapterPrev: refs.chapBackBtn,
		chapterNext: refs.chapFwdBtn,
		theater: refs.theaterBtn,
		pip: refs.pipBtn,
		speed: refs.speedBtn,
		quality: refs.qualityBtn,
		subtitles: refs.subsBtn,
		audio: refs.audioBtn,
		aspectRatio: refs.aspectRatioBtn,
		playlist: refs.playlistBtn,
		// `cast` lives in the top bar, never the bottom-row control bar it
		// collapses — same reason `volume` is null here (no discrete
		// responsive-managed element). Gating stays on `applyStateVisibility()`.
		cast: null,
	};
}

/**
 * Primary visibility pass: walk the priority list most-important first,
 * accumulate widths, hide any button that doesn't fit. Also emits
 * `layout:breakpoint` for backwards-compat subscribers.
 */
export function applyAllVisibilityRules(
	state: ResponsiveState,
	opts: DesktopUiOptions | undefined,
	containerWidth: number,
	emitBreakpoint: (payload: LayoutBreakpointPayload) => void,
	container: HTMLElement,
): void {
	if (!state.buttonMap)
		return;

	const priority = opts?.buttonPriority ?? DEFAULT_PRIORITY;
	const portraitHidden = resolvePortraitHidden(opts);

	// Reserve space for the time labels and divider (non-button chrome in the
	// bottom row). current-time ≈ 50px, divider min-width 16px,
	// remaining-time ≈ 50px, padding 32px.
	const RESERVED_CHROME_WIDTH = 148;
	const availableWidth = Math.max(0, containerWidth - RESERVED_CHROME_WIDTH);

	const breakpoints = resolveBreakpoints(opts);
	const active = breakpoints.find(bp => containerWidth <= bp.maxWidth)
		?? breakpoints[breakpoints.length - 1]!;

	let accumulatedWidth = 0;
	const visibleKeys: Array<keyof DesktopUiButtonOptions> = [];
	const hiddenKeys: Array<keyof DesktopUiButtonOptions> = [];

	for (const [rank, key] of priority.entries()) {
		const btn = state.buttonMap[key];
		if (!btn)
			continue;

		// Rank is the index in the priority list, counting keys without an element.
		if (rank > active.hideAfterRank) {
			btn.hidden = true;
			hiddenKeys.push(key);
			continue;
		}

		// Rule 2 — content gating: already hidden by capability logic, skip.
		const contentHidden = btn.getAttribute('data-content-hidden') === 'true';
		if (contentHidden) {
			hiddenKeys.push(key);
			continue;
		}

		const fits = shouldShowButton(
			key,
			accumulatedWidth,
			availableWidth,
			state.isPortrait,
			state.isNoHover,
			opts?.buttons,
			portraitHidden,
		);

		if (fits) {
			btn.hidden = false;
			accumulatedWidth += buttonFootprint(key, state.isNoHover);
			visibleKeys.push(key);
		}
		else {
			btn.hidden = true;
			hiddenKeys.push(key);
		}
	}

	// Emit layout:breakpoint for backwards-compat subscribers.
	container.setAttribute('data-breakpoint', active.name);

	if (active.name !== state.currentBreakpointName) {
		const previousName = state.currentBreakpointName;
		state.currentBreakpointName = active.name;
		emitBreakpoint({
			from: previousName,
			to: active.name,
			visibleButtons: visibleKeys,
			hiddenButtons: hiddenKeys,
		});
	}
}

// ── Wire functions ────────────────────────────────────────────────────────────

/**
 * Wire orientation changes. Sets `data-orientation` on the container and
 * re-evaluates visibility whenever the device rotates.
 */
export function wireOrientation(
	state: ResponsiveState,
	container: HTMLElement,
	opts: DesktopUiOptions | undefined,
	listen: (target: EventTarget, event: string, fn: (event: Event) => void) => void,
	emitBreakpoint: (payload: LayoutBreakpointPayload) => void,
): void {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
		return;

	const mql = window.matchMedia('(orientation: portrait)');
	state.isPortrait = mql.matches;
	container.setAttribute('data-orientation', mql.matches ? 'portrait' : 'landscape');

	const onChange = (): void => {
		state.isPortrait = mql.matches;
		container.setAttribute('data-orientation', mql.matches ? 'portrait' : 'landscape');
		applyAllVisibilityRules(state, opts, state.lastContainerWidth, emitBreakpoint, container);
	};

	listen(mql as unknown as EventTarget /* MediaQueryList satisfies EventTarget but lib.dom types it narrowly */, 'change', onChange);
}

/**
 * Wire touch-device detection. On `(hover: none) and (pointer: coarse)`
 * devices the volume slider never expands so we must not reserve space for
 * it.
 */
export function wireNoHover(
	state: ResponsiveState,
	container: HTMLElement,
	opts: DesktopUiOptions | undefined,
	listen: (target: EventTarget, event: string, fn: (event: Event) => void) => void,
	emitBreakpoint: (payload: LayoutBreakpointPayload) => void,
): void {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
		return;

	const mql = window.matchMedia('(hover: none) and (pointer: coarse)');
	state.isNoHover = mql.matches;
	container.toggleAttribute('data-no-hover', mql.matches);

	const onChange = (): void => {
		state.isNoHover = mql.matches;
		container.toggleAttribute('data-no-hover', mql.matches);
		applyAllVisibilityRules(state, opts, state.lastContainerWidth, emitBreakpoint, container);
	};

	listen(mql as unknown as EventTarget /* MediaQueryList satisfies EventTarget but lib.dom types it narrowly */, 'change', onChange);
}

/**
 * Wire the ResizeObserver that drives button-fit visibility on every resize.
 */
export function wireResponsive(
	state: ResponsiveState,
	refs: ResponsiveButtonRefs,
	container: HTMLElement,
	opts: DesktopUiOptions | undefined,
	addCleanup: (fn: () => void) => void,
	emitBreakpoint: (payload: LayoutBreakpointPayload) => void,
): void {
	if (typeof ResizeObserver === 'undefined')
		return;

	state.buttonMap = initButtonMap(refs);

	state.resizeObserver = new ResizeObserver((entries) => {
		const entry = entries[0];
		if (!entry)
			return;
		state.lastContainerWidth = entry.contentRect.width;
		applyAllVisibilityRules(state, opts, entry.contentRect.width, emitBreakpoint, container);
	});

	state.resizeObserver.observe(container);
	addCleanup(() => {
		state.resizeObserver?.disconnect();
		state.resizeObserver = null;
	});
}

/**
 * Wire the volume slider — horizontal (CSS-only expand on hover), vertical
 * (click-popup), or auto (ResizeObserver picks based on container width and
 * hover capability).
 *
 * Decides at construction time (before ResizeObserver fires) whether to render
 * the horizontal expand-on-hover slider or the vertical click-popup.
 */
export function wireVolumeSlider(
	state: ResponsiveState,
	opts: DesktopUiOptions | undefined,
	playerContainer: HTMLElement,
	volContainer: HTMLElement,
	vertPop: HTMLDivElement,
	vertInput: HTMLInputElement,
	volBtn: HTMLButtonElement,
	volPopupMuteBtn: HTMLButtonElement | null,
	listen: (target: EventTarget, event: string, fn: (event: Event) => void) => void,
	getVolume: () => number,
	setVolume: (level: number) => void,
	toggleMute: () => void,
	addCleanup: (fn: () => void) => void,
): void {
	// Default to 'auto' so touch / narrow viewports get the vertical popup
	// automatically. Horizontal hover-expand requires a real pointer, so it
	// can't be the default.
	const mode = opts?.volumeSlider ?? 'auto';

	const applyVertical = (on: boolean): void => {
		volContainer.classList.toggle('volume-container-vertical', on);
	};

	const syncVertInput = (): void => {
		const pct = Math.round(getVolume());
		vertInput.value = String(pct);
		vertInput.style.setProperty('--vol-pct', `${pct}%`);
	};

	const openVertPop = (): void => {
		if (state.volSliderVerticalOpen) {
			vertPop.classList.remove('volume-slider-vertical-open');
			state.volSliderVerticalOpen = false;
			return;
		}
		syncVertInput();
		vertPop.classList.add('volume-slider-vertical-open');
		state.volSliderVerticalOpen = true;
	};

	const closeVertPop = (): void => {
		vertPop.classList.remove('volume-slider-vertical-open');
		state.volSliderVerticalOpen = false;
	};

	listen(vertInput, 'input', () => {
		const level = Number(vertInput.value);
		vertInput.style.setProperty('--vol-pct', `${vertInput.value}%`);
		setVolume(level);
	});

	if (volPopupMuteBtn) {
		listen(volPopupMuteBtn, 'click', (event: Event) => {
			event.stopPropagation();
			toggleMute();
		});
	}

	if (mode === 'vertical') {
		applyVertical(true);
		listen(volBtn, 'click', () => openVertPop());
		listen(document, 'click', (event: Event) => {
			if (!volContainer.contains(event.target as Node))
				closeVertPop();
		});
		return;
	}

	if (mode === 'auto') {
		if (typeof ResizeObserver === 'undefined')
			return;

		const AUTO_VERTICAL_THRESHOLD = 520;
		const evaluate = (width: number): boolean =>
			state.isNoHover || width <= AUTO_VERTICAL_THRESHOLD;

		applyVertical(evaluate(playerContainer.clientWidth ?? 0));

		const resizer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry)
				return;
			const useVertical = evaluate(entry.contentRect.width);
			applyVertical(useVertical);
			if (!useVertical && state.volSliderVerticalOpen)
				closeVertPop();
		});
		resizer.observe(playerContainer);
		addCleanup(() => resizer.disconnect());

		listen(volBtn, 'click', () => {
			if (volContainer.classList.contains('volume-container-vertical')) {
				openVertPop();
			}
		});
		listen(document, 'click', (event: Event) => {
			if (!volContainer.contains(event.target as Node))
				closeVertPop();
		});
	}

	// `horizontal` mode: no extra wiring — CSS handles expand-on-hover.
}
