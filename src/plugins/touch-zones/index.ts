// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Touch / click zones plugin for the video player.
 *
 * Renders a transparent tap-zone overlay that sits at z-index 10 — above the
 * video element (z-index 0) but below the desktop UI controls overlay (z-index 20).
 * This ordering is intentional: touch zones intercept taps before they reach
 * the video element, but control buttons on the desktop-ui layer remain clickable.
 *
 * Layout: 3-column × 6-row CSS grid.
 *   col 1 (left third)  — seek backward zone
 *   col 2 (centre)      — play/pause + fullscreen zone
 *   col 3 (right third) — seek forward zone
 * On mobile (detected via `ontouchstart` / `maxTouchPoints`) two extra zones are
 * added in col 2, rows 1–2 (volume up) and rows 5–6 (volume down), pushing the
 * play/pause zone to rows 3–5.
 *
 * Single-tap vs double-tap behaviour:
 *   Left / right zones:  single-tap shows/hides controls (toggle); double-tap seeks ±seekSeconds.
 *   Centre zone:         single-tap toggles play/pause; double-tap toggles fullscreen.
 *   Volume zones (mobile only): single-tap shows/hides controls (toggle); double-tap adjusts volume.
 *
 * Integration: emits `player.emit('activity', { active })` to notify the
 * desktop-ui plugin that controls should be shown or hidden. All other calls
 * go through the typed player surface (rewind, forward, togglePlayback, etc.).
 *
 * Seek-feedback indicators
 * ────────────────────────
 * Each seek zone hosts a floating indicator element (z-index 15 — above the
 * zones, below desktop-ui controls at z-index 20). The indicator is lazy-mounted
 * on the first double-tap of that side and remains in the DOM for the plugin's
 * lifetime.
 *
 * Layout: a circle pinned to the player edge (left/right), containing an SVG
 * chevron set and a text label showing the accumulated seek seconds for the
 * current burst (e.g. "−30s" after three rapid left-taps).
 *
 * Cumulative-count behaviour:
 *   Each double-tap adds `seekSeconds` to a per-side accumulator and updates the
 *   indicator text. A ~1 s collapse timer resets the accumulator when no further
 *   taps arrive. Rapid successive taps update the same element — no stacking.
 *
 * Animation: CSS transitions on `opacity` and `transform`. The indicator gains an
 * `nm-seek-indicator--visible` class on show, loses it on hide. The transition
 * in/out is handled entirely by CSS (no JS animation frames).
 */

import type { Translations } from '@nomercy-entertainment/nomercy-player-core';
import type { NMVideoPlayer, VideoPlaylistItem } from '@nomercy-entertainment/nomercy-video-player';

import { Plugin, translationsFromGlob } from '@nomercy-entertainment/nomercy-player-core';

export interface TouchZonesOptions {
	/** Milliseconds between taps that still counts as a double-tap. Default 300. */
	doubleTapThreshold?: number;
	/** Seconds to seek on double-tap. Default 10. */
	seekSeconds?: number;
	/**
	 * When true, single-click/tap on the center zone never toggles playback.
	 * Mirrors `disableClickToPause` on DesktopUiPlugin — both plugins ship their
	 * own click handlers (desktop-ui on the video element, touch-zones on the
	 * overlay zones), so the user needs the same switch on both. Default false.
	 */
	disableClickToPause?: boolean;
}

interface ZonePos {
	x: { start: number; end: number };
	y: { start: number; end: number };
}

const STYLE_ID = 'nmplayer-touch-zones-styles';

function ensureStyles(): void {
	if (document.getElementById(STYLE_ID))
		return;

	const el = document.createElement('style');
	el.id = STYLE_ID;
	el.textContent = `
.nm-touch-zones-root {
    position: absolute; inset: 0; z-index: 10;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    grid-template-rows: repeat(6, 1fr);
    pointer-events: none;
}
.nm-touch-box {
    pointer-events: auto;
    -webkit-tap-highlight-color: transparent;
    position: relative;
}
.nm-seek-indicator {
    position: absolute;
    top: 50%; transform: translateY(-50%) scale(0.85);
    z-index: 15;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 72px; height: 72px;
    background: rgba(0,0,0,0.45);
    color: #fff;
    font-size: 0.78rem;
    font-family: system-ui, sans-serif;
    font-weight: 600;
    pointer-events: none;
    border-radius: 50%;
    opacity: 0;
    transition: opacity 120ms ease-out, transform 120ms ease-out;
    user-select: none;
}
.nm-seek-indicator.nm-seek-indicator--left  { left: 16px; }
.nm-seek-indicator.nm-seek-indicator--right { right: 16px; }
.nm-seek-indicator--visible {
    opacity: 1;
    transform: translateY(-50%) scale(1);
}
.nm-seek-indicator svg {
    width: 20px; height: 20px;
    fill: none;
    stroke: #fff;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
}
`;
	document.head.appendChild(el);
}

interface SeekIndicatorState {
	el: HTMLDivElement;
	textEl: HTMLSpanElement;
	accumulated: number;
	collapseTimer: ReturnType<typeof setTimeout> | null;
	hideTimer: ReturnType<typeof setTimeout> | null;
}

export class TouchZonesPlugin<T extends VideoPlaylistItem = VideoPlaylistItem> extends Plugin<NMVideoPlayer<T>, TouchZonesOptions> {
	static override readonly id: string = 'touch-zones';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'Tap-zone overlay: double-tap to seek, single-tap to toggle playback';
	static override readonly translations: Translations = translationsFromGlob('./i18n/*.ts');

	private root!: HTMLDivElement;
	private _isMobile = false;

	/**
	 * Snapshot of control visibility captured at touchstart (capture phase),
	 * BEFORE desktop-ui's bubble-phase touchstart handler runs and potentially
	 * mutates the DOM. `onSingle` reads this snapshot to decide hide-vs-nothing
	 * based on what the user SAW when the tap started, not the post-wake state.
	 *
	 * Without this, a tap from hidden would:
	 *   1. touchstart (bubble) → desktop-ui bumpActivity → .active added
	 *   2. onSingle (300 ms later) → live DOM reads .active=true → hides
	 *   Net: show-then-hide flicker; tap appears to do nothing.
	 *
	 * Reset to null after each onSingle consumes it. Falls back to live DOM
	 * for non-touch paths (mouse clicks on desktop have no touchstart).
	 */
	private _tapWasVisible: boolean | null = null;

	private leftIndicator: SeekIndicatorState | null = null;
	private rightIndicator: SeekIndicatorState | null = null;

	override use(): void {
		ensureStyles();
		this.root = this.mount('root');
		this.addClasses(this.root, ['nm-touch-zones-root']);

		this._isMobile = this.detectMobile();

		// Capture-phase listener on the CONTAINER, bound to `pointerdown` — the
		// FIRST event of any tap gesture. On touch the real order is
		// pointerdown → touchstart → … and desktop-ui wakes the controls on the
		// EARLIEST of those (it listens to pointerdown AND touchstart, both
		// bubble-phase). So snapshotting on `touchstart` reads `.active` AFTER
		// pointerdown already woke it — capturing the wrong (post-wake) state and
		// making onSingle hide a just-shown overlay. Binding the snapshot to
		// `pointerdown` in the CAPTURE phase guarantees it runs before ANY of
		// desktop-ui's bubble-phase wake handlers, so it records the true pre-tap
		// visibility. Capture on the container fires before bubble regardless of
		// which child (zone box / overlay) the gesture started on.
		if (this.player.container) {
			this.listen(
				this.player.container,
				'pointerdown',
				() => { this._tapWasVisible = this.player.container.classList.contains('active'); },
				{ capture: true },
			);
		}

		if (this._isMobile) {
			this.buildSeekBack(this.root, { x: { start: 1, end: 2 }, y: { start: 2, end: 7 } });
			this.buildPlayback(this.root, { x: { start: 2, end: 3 }, y: { start: 3, end: 6 } });
			this.buildSeekForward(this.root, { x: { start: 3, end: 4 }, y: { start: 2, end: 7 } });
			this.buildVolUp(this.root, { x: { start: 2, end: 3 }, y: { start: 1, end: 3 } });
			this.buildVolDown(this.root, { x: { start: 2, end: 3 }, y: { start: 5, end: 7 } });
		}
		else {
			this.buildSeekBack(this.root, { x: { start: 1, end: 2 }, y: { start: 1, end: 7 } });
			this.buildPlayback(this.root, { x: { start: 2, end: 3 }, y: { start: 1, end: 7 } });
			this.buildSeekForward(this.root, { x: { start: 3, end: 4 }, y: { start: 1, end: 7 } });
		}
	}

	override dispose(): void {
		this.root?.remove();
	}

	private detectMobile(): boolean {
		return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
	}

	/**
	 * Returns the visibility of controls that should be used by the current
	 * onSingle handler to decide whether to hide.
	 *
	 * On a touch path: returns the PRE-TAP snapshot captured at touchstart
	 * (capture phase, before desktop-ui's bumpActivity may have added .active),
	 * then clears the snapshot. Using the pre-tap value prevents the race where
	 * "tap from hidden" shows controls (touchstart) then immediately hides them
	 * (onSingle sees .active=true that was just added, emits activity:false).
	 *
	 * On a mouse/keyboard path: no touchstart fires, so the snapshot is null.
	 * Falls back to the live `.active` class — correct for desktop where there
	 * is no doubleTap deferred window that races against pointer input.
	 */
	private wasControlsVisibleAtTapStart(): boolean {
		if (this._tapWasVisible !== null) {
			const snapshot = this._tapWasVisible;
			this._tapWasVisible = null;
			return snapshot;
		}

		return this.player.container.classList.contains('active');
	}

	private makeBox(parent: HTMLElement, pos: ZonePos): HTMLDivElement {
		const el = document.createElement('div');
		el.className = 'nm-touch-box';
		el.style.gridColumnStart = String(pos.x.start);
		el.style.gridColumnEnd = String(pos.x.end);
		el.style.gridRowStart = String(pos.y.start);
		el.style.gridRowEnd = String(pos.y.end);
		parent.appendChild(el);
		return el;
	}

	private doubleTap(
		onDouble: (event: Event) => void,
		onSingle?: (event: Event) => void,
	): EventListener {
		let lastTap = 0;
		let singleTimer: ReturnType<typeof setTimeout> | null = null;

		return (event: Event): void => {
			const delay = this.opts?.doubleTapThreshold ?? 300;
			const now = Date.now();
			const gap = now - lastTap;
			lastTap = now;

			if (gap > 0 && gap < delay) {
				if (singleTimer !== null) {
					clearTimeout(singleTimer);
					singleTimer = null;
				}
				event.preventDefault();
				onDouble(event);
			}
			else {
				// eslint-disable-next-line player/no-raw-timers-in-plugin -- tap-debounce timer with manual clearTimeout above for the double-tap cancel path; this.timeout() has no matching manual-cancel handle, so a raw timer is required here.
				singleTimer = setTimeout(() => {
					singleTimer = null;
					onSingle?.(event);
				}, delay);
			}
		};
	}

	/**
	 * Drive the PLAYER's activity state to hidden. `activity` is a player-level
	 * event (desktop-ui listens to toggle control visibility), not a
	 * touch-zones-scoped one, so it goes on the player bus directly — the scoped
	 * `this.emit()` would namespace it to `plugin:touch-zones:activity`, where
	 * nothing listens. Used by the single-tap paths to re-hide controls that were
	 * already visible at tap start.
	 */
	private dismissControls(): void {
		// eslint-disable-next-line player/no-raw-player-bus -- deliberate emit of the player-level `activity` event; see doc comment above.
		this.player.emit('activity', { active: false });
	}

	private createSeekIndicator(parent: HTMLElement, side: 'left' | 'right'): SeekIndicatorState {
		const el = document.createElement('div');
		el.className = `nm-seek-indicator nm-seek-indicator--${side}`;

		const svgNs = 'http://www.w3.org/2000/svg';
		const svg = document.createElementNS(svgNs, 'svg');
		svg.setAttribute('viewBox', '0 0 24 24');

		if (side === 'left') {
			const path = document.createElementNS(svgNs, 'path');
			path.setAttribute('d', 'M11 17l-5-5 5-5M18 17l-5-5 5-5');
			svg.appendChild(path);
		}
		else {
			const path = document.createElementNS(svgNs, 'path');
			path.setAttribute('d', 'M13 7l5 5-5 5M6 7l5 5-5 5');
			svg.appendChild(path);
		}

		const textEl = document.createElement('span');
		const seconds = this.opts?.seekSeconds ?? 10;
		textEl.textContent = side === 'left'
			? this.t('seek.back', { seconds: String(seconds) })
			: this.t('seek.forward', { seconds: String(seconds) });

		el.appendChild(svg);
		el.appendChild(textEl);
		parent.appendChild(el);

		return {
			el,
			textEl,
			accumulated: 0,
			collapseTimer: null,
			hideTimer: null,
		};
	}

	private showSeekIndicator(state: SeekIndicatorState, seconds: number, direction: 'back' | 'forward'): void {
		if (state.collapseTimer !== null) {
			clearTimeout(state.collapseTimer);
			state.collapseTimer = null;
		}

		if (state.hideTimer !== null) {
			clearTimeout(state.hideTimer);
			state.hideTimer = null;
		}

		// Position the indicator at the VIDEO's vertical centre, not the
		// container's centre. The container may be taller than the video
		// (letterboxing, bottom bar) so a CSS-only 50% sits off-centre on
		// the actual frame.
		const video = (this.player as { videoElement?: HTMLVideoElement }).videoElement;
		const parent = state.el.parentElement;
		if (video && parent) {
			const videoRect = video.getBoundingClientRect();
			const parentRect = parent.getBoundingClientRect();
			const centreY = videoRect.top + videoRect.height / 2 - parentRect.top;
			state.el.style.top = `${centreY}px`;
		}

		state.accumulated += seconds;

		const label = direction === 'back'
			? this.t('seek.back', { seconds: String(state.accumulated) })
			: this.t('seek.forward', { seconds: String(state.accumulated) });
		state.textEl.textContent = label;

		state.el.classList.add('nm-seek-indicator--visible');

		// eslint-disable-next-line player/no-raw-timers-in-plugin -- seek-indicator collapse timer, manually cleared/re-armed on each tap (see clearTimeout at the reset above); this.timeout() offers no manual-cancel handle for the re-arm path.
		state.collapseTimer = setTimeout(() => {
			state.accumulated = 0;
			state.collapseTimer = null;

			// eslint-disable-next-line player/no-raw-timers-in-plugin -- nested hide timer, manually cleared/re-armed alongside collapseTimer; same manual-cancel requirement.
			state.hideTimer = setTimeout(() => {
				state.el.classList.remove('nm-seek-indicator--visible');
				state.hideTimer = null;
			}, 200);
		}, 1000);
	}

	private buildSeekBack(parent: HTMLElement, pos: ZonePos): void {
		const el = this.makeBox(parent, pos);

		// Single-tap: hide if controls were visible AT TAP START (pre-wake snapshot).
		// wasControlsVisibleAtTapStart() returns the capture-phase snapshot taken
		// before desktop-ui's bumpActivity may have added .active. When controls
		// were hidden at tap start, do nothing — desktop-ui already showed them
		// via touchstart. Double-tap seeks regardless of state.
		const handler = this.doubleTap(
			() => {
				const seconds = this.opts?.seekSeconds ?? 10;
				void this.player.rewind?.(seconds);

				if (this.leftIndicator === null) {
					this.leftIndicator = this.createSeekIndicator(el, 'left');
				}

				this.showSeekIndicator(this.leftIndicator, seconds, 'back');
			},
			() => {
				if (this.wasControlsVisibleAtTapStart()) {
					this.dismissControls();
				}
			},
		);
		this.listen(el, 'click', handler);
	}

	private buildSeekForward(parent: HTMLElement, pos: ZonePos): void {
		const el = this.makeBox(parent, pos);

		const handler = this.doubleTap(
			() => {
				const seconds = this.opts?.seekSeconds ?? 10;
				void this.player.forward?.(seconds);

				if (this.rightIndicator === null) {
					this.rightIndicator = this.createSeekIndicator(el, 'right');
				}

				this.showSeekIndicator(this.rightIndicator, seconds, 'forward');
			},
			() => {
				if (this.wasControlsVisibleAtTapStart()) {
					this.dismissControls();
				}
			},
		);
		this.listen(el, 'click', handler);
	}

	private buildPlayback(parent: HTMLElement, pos: ZonePos): void {
		const el = this.makeBox(parent, pos);
		el.style.display = 'flex';
		el.style.alignItems = 'center';
		el.style.justifyContent = 'center';

		// Center zone contract:
		//   double-tap → toggleFullscreen (unconditional — matches the unguarded
		//                double-tap on every other zone)
		//   single-tap → togglePlayback  (unconditional — the center zone's ONLY
		//                purpose is play/pause; no "wake tap" concern applies here;
		//                disableClickToPause is the explicit opt-out)
		//
		// The previous guard (`!this._isMobile || this.controlsVisible`) was wrong:
		// _isMobile is a one-shot static capability flag that returns true on any
		// touch-capable device — including touch laptops used with a mouse and any
		// browser under DevTools touch emulation. A cold tap on mobile would always
		// find controlsVisible=false (debounced by 310 ms), silently no-oping.
		const handler = this.doubleTap(
			() => { void this.player.toggleFullscreen?.(); },
			() => {
				if (this.opts?.disableClickToPause || this.player.options?.disableClickToPause)
					return;
				void this.player.togglePlayback?.();
			},
		);
		this.listen(el, 'click', handler);
	}

	private buildVolUp(parent: HTMLElement, pos: ZonePos): void {
		const el = this.makeBox(parent, pos);

		const handler = this.doubleTap(
			() => { this.player.volumeUp?.(); },
			() => {
				if (this.wasControlsVisibleAtTapStart()) {
					this.dismissControls();
				}
			},
		);
		this.listen(el, 'click', handler);
	}

	private buildVolDown(parent: HTMLElement, pos: ZonePos): void {
		const el = this.makeBox(parent, pos);

		const handler = this.doubleTap(
			() => { this.player.volumeDown?.(); },
			() => {
				if (this.wasControlsVisibleAtTapStart()) {
					this.dismissControls();
				}
			},
		);
		this.listen(el, 'click', handler);
	}
}

export const touchZonesPlugin = TouchZonesPlugin;
