/**
 * Button-state concern — all `apply*` helpers that update button icons,
 * aria-labels, and visual state in response to player events.
 *
 * Integration: each helper receives only the DOM refs it touches and any
 * scalar values it needs. No plugin instance is passed; these are pure DOM
 * mutations driven by event data that the plugin class hands in.
 */

import { VolumeState } from '@nomercy-entertainment/nomercy-video-player';
import type { NMVideoPlayer } from '@nomercy-entertainment/nomercy-video-player';
import type { ITranslator } from '@nomercy-entertainment/nomercy-player-core';

import { fluentIcons, svgFromIcon } from './icons';

/**
 * Render an icon into the button's `.nm-btn-icon` child, falling back to the
 * button itself for buttons created before the icon-holder pattern. Keeping
 * the icon in a sibling element prevents `innerHTML` reassignments from
 * destroying the `.nm-tooltip` span attached by `addTooltip()`.
 */
function setBtnIcon(btn: HTMLElement, html: string): void {
    const target = btn.querySelector('.nm-btn-icon') ?? btn;
    target.innerHTML = html;
}


// ── Volume ─────────────────────────────────────────────────────────────────────

/** Sync the volume slider value and CSS custom property. */
export function applyVolume(
    volSlider: HTMLInputElement,
    applyMutedIconFn: () => void,
    v: number,
): void {
    const pct = Math.round((v ?? 1) * 100);
    volSlider.value = String(pct);
    volSlider.style.setProperty('--vol-pct', `${pct}%`);
    applyMutedIconFn();
}

/** Toggle the muted CSS class on the volume button. */
export function applyMuted(volBtn: HTMLButtonElement, applyMutedIconFn: () => void, muted: boolean): void {
    volBtn.classList.toggle('nm-muted', muted);
    applyMutedIconFn();
}

/** Update the volume button icon and aria-label to reflect current mute + level. */
export function applyMutedIcon(
    volBtn: HTMLButtonElement,
    player: NMVideoPlayer<any>,
    t: ITranslator['t'],
): void {
    const muted = player.volumeState() === VolumeState.MUTED;
    const v = player.volume?.() ?? 1;
    const icon = muted || v === 0
        ? fluentIcons.volumeMuted
        : v < 0.34
            ? fluentIcons.volumeLow
            : v < 0.67
                ? fluentIcons.volumeMedium
                : fluentIcons.volumeHigh;
    setBtnIcon(volBtn, svgFromIcon(icon));
    volBtn.setAttribute('aria-label', t('tooltip.mute'));
}


// ── Playback rate ──────────────────────────────────────────────────────────────

/** Update the speed button icon and aria-label. */
export function applyRate(speedBtn: HTMLButtonElement, t: ITranslator['t']): void {
    setBtnIcon(speedBtn, svgFromIcon(fluentIcons.speed));
    speedBtn.setAttribute('aria-label', t('tooltip.speed'));
}


// ── Quality ────────────────────────────────────────────────────────────────────

/** Update the quality button icon and aria-label. */
export function applyQualityIcon(qualityBtn: HTMLButtonElement, t: ITranslator['t']): void {
    setBtnIcon(qualityBtn, svgFromIcon(fluentIcons.quality));
    qualityBtn.setAttribute('aria-label', t('tooltip.quality'));
}


// ── Fullscreen ─────────────────────────────────────────────────────────────────

/** Sync the fullscreen button icon to the current fullscreen state. */
export function applyFullscreen(fsBtn: HTMLButtonElement): void {
    const fs = Boolean(document.fullscreenElement);
    setBtnIcon(fsBtn, svgFromIcon(fs ? fluentIcons.exitFullscreen : fluentIcons.fullscreen));
}


// ── Theater ────────────────────────────────────────────────────────────────────

/** Update the theater button icon and aria-label. */
export function applyTheaterIcon(theaterBtn: HTMLButtonElement, active: boolean, t: ITranslator['t']): void {
    setBtnIcon(theaterBtn, svgFromIcon(active ? fluentIcons.theaterExit : fluentIcons.theater));
    theaterBtn.setAttribute('aria-label', t('tooltip.theater'));
}


// ── Subtitles ──────────────────────────────────────────────────────────────────

/** Toggle subtitles button between the on/off icon based on the active track index. */
export function applySubsIcon(subsBtn: HTMLButtonElement, activeSubtitleIdx: number | null, t: ITranslator['t']): void {
    const on = activeSubtitleIdx !== null && activeSubtitleIdx !== -1;
    setBtnIcon(subsBtn, svgFromIcon(on ? fluentIcons.subtitles : fluentIcons.subtitlesOff));
    subsBtn.setAttribute('aria-label', t('tooltip.subtitles'));
}


// ── Picture-in-picture ─────────────────────────────────────────────────────────

/** Update the PiP button icon and aria-label. The hover tooltip is owned by `addTooltip()`. */
export function applyPipIcon(pipBtn: HTMLButtonElement, active: boolean, t: ITranslator['t']): void {
    setBtnIcon(pipBtn, svgFromIcon(active ? fluentIcons.pipExit : fluentIcons.pipEnter));
    pipBtn.setAttribute('aria-label', t('tooltip.pip'));
}


// ── Aspect ratio ───────────────────────────────────────────────────────────────

/** Update the aspect-ratio button icon and aria-label. The hover tooltip is owned by `addTooltip()`. */
export function applyAspectRatioIcon(aspectRatioBtn: HTMLButtonElement, t: ITranslator['t']): void {
    setBtnIcon(aspectRatioBtn, svgFromIcon(fluentIcons.aspectFit));
    aspectRatioBtn.setAttribute('aria-label', t('tooltip.aspectRatio'));
}
