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

import { fluentIcons, svgFromIcon } from './icons';


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
    volBtn.innerHTML = svgFromIcon(icon);
    volBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
}


// ── Playback rate ──────────────────────────────────────────────────────────────

/** Update the speed button icon and aria-label. */
export function applyRate(speedBtn: HTMLButtonElement, rate: number): void {
    const icon = rate === 1
        ? fluentIcons.speed
        : { ...fluentIcons.speed, normal: fluentIcons.speed.hover };
    speedBtn.innerHTML = svgFromIcon(icon);
    speedBtn.setAttribute('aria-label', rate === 1 ? 'Speed (1x)' : `Speed (${rate}x)`);
}


// ── Quality ────────────────────────────────────────────────────────────────────

/** Update the quality button icon and aria-label based on manual-pick state. */
export function applyQualityIcon(qualityBtn: HTMLButtonElement, userPickedQuality: boolean): void {
    const icon = userPickedQuality
        ? { ...fluentIcons.quality, normal: fluentIcons.quality.hover }
        : fluentIcons.quality;
    qualityBtn.innerHTML = svgFromIcon(icon);
    qualityBtn.setAttribute('aria-label', userPickedQuality ? 'Quality (manual)' : 'Quality (auto)');
}


// ── Fullscreen ─────────────────────────────────────────────────────────────────

/** Sync the fullscreen button icon to the current fullscreen state. */
export function applyFullscreen(fsBtn: HTMLButtonElement): void {
    const fs = Boolean(document.fullscreenElement);
    fsBtn.innerHTML = svgFromIcon(fs ? fluentIcons.exitFullscreen : fluentIcons.fullscreen);
}


// ── Theater ────────────────────────────────────────────────────────────────────

/** Update the theater button icon and aria-label. */
export function applyTheaterIcon(theaterBtn: HTMLButtonElement, active: boolean): void {
    theaterBtn.innerHTML = svgFromIcon(active ? fluentIcons.theaterExit : fluentIcons.theater);
    theaterBtn.setAttribute('aria-label', active ? 'Exit theater mode' : 'Theater mode');
}


// ── Subtitles ──────────────────────────────────────────────────────────────────

/** Toggle subtitles button between the on/off icon based on the active track index. */
export function applySubsIcon(subsBtn: HTMLButtonElement, activeSubtitleIdx: number | null): void {
    const on = activeSubtitleIdx !== null && activeSubtitleIdx !== -1;
    subsBtn.innerHTML = svgFromIcon(on ? fluentIcons.subtitles : fluentIcons.subtitlesOff);
    subsBtn.setAttribute('aria-label', on ? 'Subtitles on' : 'Subtitles off');
}


// ── Picture-in-picture ─────────────────────────────────────────────────────────

/** Update the PiP button icon, aria-label, and title. */
export function applyPipIcon(pipBtn: HTMLButtonElement, active: boolean): void {
    const label = active ? 'Exit picture-in-picture' : 'Picture-in-picture';
    pipBtn.innerHTML = svgFromIcon(active ? fluentIcons.pipExit : fluentIcons.pipEnter);
    pipBtn.setAttribute('aria-label', label);
    pipBtn.title = label;
}


// ── Aspect ratio ───────────────────────────────────────────────────────────────

export const ASPECT_RATIO_LABELS: Record<'uniform' | 'fill' | 'exactfit' | 'none', string> = {
    uniform: 'Original',
    fill: 'Stretch',
    exactfit: 'Crop',
    none: 'Native',
};

/** Update the aspect-ratio button icon and aria-label. */
export function applyAspectRatioIcon(
    aspectRatioBtn: HTMLButtonElement,
    value: 'uniform' | 'fill' | 'exactfit' | 'none',
): void {
    const isDefault = value === 'uniform';
    const icon = isDefault
        ? fluentIcons.aspectFit
        : { ...fluentIcons.aspectFit, normal: fluentIcons.aspectFit.hover };
    aspectRatioBtn.innerHTML = svgFromIcon(icon);
    const label = `Aspect ratio (${ASPECT_RATIO_LABELS[value]})`;
    aspectRatioBtn.setAttribute('aria-label', label);
    aspectRatioBtn.title = label;
}
