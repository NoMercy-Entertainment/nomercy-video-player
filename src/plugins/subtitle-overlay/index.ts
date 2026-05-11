/**
 * Subtitle overlay plugin — renders the player's `subtitleCue` stream
 * onto a positioned DOM tree above the video element.
 *
 * Pure consumer: every piece of "where do cues come from" logic lives in
 * the kit (sidecar VTT fetch + parse + tracker) and the v2 video
 * player's backend (native `TextTrack` cuechange forwarding). The
 * overlay subscribes to a single event — `subtitleCue` — and renders
 * one positioned `.subtitle-area` per active cue, with the user's
 * `subtitleStyle` settings applied to every `.subtitle-text` span.
 *
 * The DOM mirrors v1's tree:
 *   subtitle-overlay > subtitle-safezone > subtitle-area.sized.<aligned>
 *                                          > subtitle-text<span data-language=…>
 *
 * `.subtitle-area` instances are pooled so two cues active at different
 * `line` percentages render as two independently-positioned boxes —
 * matching the browser's native VTT layout.
 */

import {
    buildSubtitleFragment,
    Plugin,
} from '@nomercy-entertainment/nomercy-player-core';
import type { SubtitleCueChange, SubtitleStyle } from '@nomercy-entertainment/nomercy-player-core';
import type { NMVideoPlayer } from '@nomercy-entertainment/nomercy-video-player';

export interface SubtitleOverlayOptions {
    /** Inactivity timeout before clearing stale text. Pure safety —
     *  doesn't usually trigger when cues meet end-to-end. */
    cueTtlMs?: number;
}

// `SubtitleCueChange` and `SubtitleStyle` are imported above from the
// kit so the overlay's listener parameter types and style cache come
// from the canonical source. No local re-declarations.
type SubtitleCue = SubtitleCueChange['cues'][number];

export class SubtitleOverlayPlugin extends Plugin<NMVideoPlayer, SubtitleOverlayOptions> {
    static override readonly id: string = 'subtitle-overlay';
    static override readonly version: string = '1.0.0';
    static override readonly description: string = 'Renders the player\'s subtitleCue stream as a styled DOM overlay.';

    /** `.subtitle-overlay` — outer positioned wrapper sized to the
     *  video display rectangle by `bindOverlayToVideo`. */
    private overlay!: HTMLDivElement;
    /** `.subtitle-safezone` — inner wrapper that hosts cue areas
     *  inside the WebVTT 5% safe-area inset. */
    private safezone!: HTMLDivElement;

    /** Pool of `.subtitle-area > .subtitle-text` pairs — one per
     *  active cue. The browser's native VTT renderer paints each
     *  active cue as a separate positioned box, so we mirror that.
     *  Pool grows on demand and shrinks back to zero when no cues
     *  are active. */
    private areas: Array<{ area: HTMLDivElement; text: HTMLSpanElement }> = [];

    /** Last-applied subtitle style — re-applied to each new pool
     *  entry so a cue spawned mid-playback inherits the latest
     *  font / color / edge / area background. Initialised lazily
     *  from `player.subtitleStyle()` in `use()`. */
    private currentStyle: SubtitleStyle | null = null;

    /** Active language tag, mirrored onto every `.subtitle-text` for
     *  language-specific CSS rules / selectors. */
    private currentLanguage: string | undefined;

    override use(): void {
        this.overlay = this.mount('subtitle-overlay');
        this.player.addClasses(this.overlay, ['subtitle-overlay']);
        this.safezone = this.player.createElement('div', 'subtitle-safezone')
            .addClasses(['subtitle-safezone'])
            .appendTo(this.overlay).get();

        ensureStyles();
        this.bindOverlayToVideo();

        // Cache the kit's current style so the next paint applies the
        // user's last-saved preferences without an extra round-trip.
        // `subtitleStyle()` lazily seeds defaults the first time it's
        // read so the cache is always populated.
        this.currentStyle = this.player.subtitleStyle();

        // Live style updates — repaint existing cue areas immediately.
        this.on('subtitleStyle', (style) => {
            if (!style) return;
            this.currentStyle = { ...style };
            for (const a of this.areas) this.applyStyleTo(a.text, a.area);
        });

        // The sole rendering signal — kit + backend funnel both sidecar
        // and native cues into this single channel.
        this.on('subtitleCue', (change) => {
            if (!change) return;
            if (change.language !== this.currentLanguage) {
                this.setLanguage(change.language);
            }
            this.renderCues(change.cues);
        });

        // Item change — paint nothing until `subtitleCue` arrives for
        // the new item. (The kit drops the sidecar tracker on `current`
        // and the backend's `unload` emits `cues: []`, so we'll usually
        // get the empty event implicitly — clearing here is belt-and-
        // braces for races during track-list refresh.)
        this.on('current', () => this.renderCues([]));
    }

    /**
     * Resize the cue-area pool to exactly `n` entries. Reuses existing
     * DOM nodes; new entries are appended with `.subtitle-area`
     * + `.aligned-center` defaults (overridden per-cue when the
     * `align` setting differs). Overflow entries are removed.
     */
    private ensureAreaCount(n: number): void {
        while (this.areas.length < n) {
            const area = this.player.createElement('div', `subtitle-area-${this.areas.length}`)
                .addClasses(['subtitle-area', 'aligned-center'])
                .appendTo(this.safezone).get();
            const text = this.player.createElement('span', `subtitle-text-${this.areas.length}`)
                .addClasses(['subtitle-text'])
                .appendTo(area).get();
            this.areas.push({ area, text });
            this.applyStyleTo(text, area);
            if (this.currentLanguage) text.setAttribute('data-language', this.currentLanguage);
        }
        while (this.areas.length > n) {
            const last = this.areas.pop();
            last?.area.remove();
        }
    }

    private setLanguage(lang: string | undefined): void {
        this.currentLanguage = lang;
        for (const a of this.areas) {
            if (lang) a.text.setAttribute('data-language', lang);
            else a.text.removeAttribute('data-language');
        }
    }

    /**
     * Render every active cue into its own positioned `.subtitle-area`.
     * Called from the player's `subtitleCue` event — that event fires
     * on every cuechange (native track) or every `enter`/`exit` from
     * the kit's sidecar `CueTracker`, so the pool always reflects the
     * current `activeCues` set.
     */
    private renderCues(cues: ReadonlyArray<SubtitleCue>): void {
        if (cues.length === 0) {
            this.ensureAreaCount(0);
            return;
        }
        this.ensureAreaCount(cues.length);
        for (let i = 0; i < cues.length; i++) {
            const cue = cues[i]!;
            const slot = this.areas[i]!;
            slot.text.replaceChildren(buildSubtitleFragment(cue.text));
            this.applyCuePositioningTo(slot.area, cue);
            this.applyStyleTo(slot.text, slot.area);
        }
        // Mirror the browser's native VTT cue layout — cues placed at
        // overlapping `line` positions get pushed apart so each one
        // remains readable. Without this, two cues at line:14% and
        // line:15% paint on top of each other.
        if (cues.length > 1) this.avoidCueCollisions();
    }

    /**
     * Resolve overlaps between active cue areas by pushing later cues
     * away from the earlier ones along the line axis. Walks areas in
     * cue order — the cue listed first gets to keep its requested
     * position; subsequent cues are nudged so they don't visually
     * collide.
     *
     * Per WebVTT step 12 (cue layout) the displaced cue is pushed in
     * the line direction. For top-anchored cues that's downward; for
     * bottom-anchored cues that's upward. We pick the direction so the
     * displaced cue never crosses the safezone bottom — if pushing
     * down would overflow, push up instead and re-anchor as `bottom:`.
     */
    private avoidCueCollisions(): void {
        const safezoneRect = this.safezone.getBoundingClientRect();
        if (safezoneRect.height <= 0) return;

        // Snapshot current rendered rects — getBoundingClientRect()
        // forces a layout flush, so do it once per area up front.
        const placed: Array<{ area: HTMLDivElement; rect: DOMRect }> = this.areas
            .map(a => ({ area: a.area, rect: a.area.getBoundingClientRect() }));

        const overlaps = (a: DOMRect, b: DOMRect): boolean =>
            a.top < b.bottom && a.bottom > b.top;

        for (let i = 1; i < placed.length; i++) {
            const curr = placed[i]!;
            for (let j = 0; j < i; j++) {
                const prev = placed[j]!;
                if (!overlaps(curr.rect, prev.rect)) continue;
                const height = curr.rect.height;
                const downTopPx = prev.rect.bottom - safezoneRect.top;
                const downBottomPx = downTopPx + height;
                const fitsDown = downBottomPx <= safezoneRect.height;
                if (fitsDown) {
                    const newTopPct = (downTopPx / safezoneRect.height) * 100;
                    curr.area.style.top = `${newTopPct}%`;
                    curr.area.style.bottom = '';
                }
                else {
                    // Push above the colliding cue so the displaced area
                    // anchors by `bottom:` and stays inside the safezone.
                    const upBottomPx = safezoneRect.bottom - prev.rect.top;
                    const newBottomPct = (upBottomPx / safezoneRect.height) * 100;
                    curr.area.style.bottom = `${newBottomPct}%`;
                    curr.area.style.top = '';
                }
                curr.rect = curr.area.getBoundingClientRect();
            }
        }
    }

    /**
     * Mirror v1's `resize()`: size the overlay to the actual video
     * display rectangle (letterbox-fit), not the player container. The
     * font-size baseline (28px) is anchored to that rect via the CSS
     * rules, so cues scale proportionally with the video — not with
     * the surrounding chrome.
     */
    private bindOverlayToVideo(): void {
        const fit = (): void => {
            const video = this.player.videoElement as HTMLVideoElement | undefined;
            const container = this.player.container as HTMLElement | undefined;
            if (!video || !container) return;

            const containerW = container.clientWidth;
            const containerH = container.clientHeight;
            const videoW = video.videoWidth;
            const videoH = video.videoHeight;
            if (!videoW || !videoH || !containerW || !containerH) {
                this.overlay.style.width = '100%';
                this.overlay.style.height = '100%';
                this.overlay.style.top = '0';
                this.overlay.style.left = '0';
                this.overlay.style.transform = 'none';
                return;
            }

            const containerAR = containerW / containerH;
            const videoAR = videoW / videoH;
            let w: number;
            let h: number;
            if (videoAR > containerAR) { w = containerW; h = containerW / videoAR; }
            else { h = containerH; w = containerH * videoAR; }

            this.overlay.style.width = `${Math.round(w)}px`;
            this.overlay.style.height = `${Math.round(h)}px`;
            this.overlay.style.top = '50%';
            this.overlay.style.left = '50%';
            this.overlay.style.transform = 'translate(-50%, -50%)';
        };

        fit();
        this.on('mediaReady', fit);
        this.on('duration', fit);
        this.on('fullscreen', fit);

        const ro = new ResizeObserver(fit);
        const container = this.player.container as HTMLElement | undefined;
        if (container) ro.observe(container);
        const video = this.player.videoElement as HTMLVideoElement | undefined;
        if (video) ro.observe(video);
        this.lifecycle?.addCleanup?.(() => ro.disconnect());
    }

    /**
     * Apply the cached subtitle-style to a specific area+text pair.
     * Port of v1's `applySubtitleStyle` (see
     * `nomercy-video-player/src/player/core.ts`). Colors run through
     * `parseColorToHex` which yields `#RRGGBBAA` so the alpha byte is
     * correct even when `textOpacity` / `windowOpacity` is 0.
     */
    private applyStyleTo(text: HTMLSpanElement, area: HTMLDivElement): void {
        const style = this.currentStyle;
        if (!style) return;

        const t = text.style;
        const a = area.style;

        t.fontSize = `calc(100% * ${style.fontSize / 100})`;
        t.fontFamily = style.fontFamily;
        t.color = parseColorToHex(style.textColor, style.textOpacity / 100);
        t.textShadow = getEdgeStyle(style.edgeStyle, style.textOpacity / 100);
        t.backgroundColor = parseColorToHex(style.backgroundColor, style.backgroundOpacity / 100);
        a.backgroundColor = parseColorToHex(style.areaColor, style.windowOpacity / 100);
    }

    /**
     * Translate a cue's `line` / `align` / `size` into CSS positioning
     * on a single `.subtitle-area`, per the WebVTT cue layout rules
     * (W3C WebVTT 1.0 §7.2 "Apply WebVTT cue settings"):
     *
     *   horizontal:
     *     position default = 0% / 50% / 100% based on alignment
     *     left  = position - alignment_anchor * size
     *     width = size%
     *
     *     where alignment_anchor is 0 / 0.5 / 1 for start / center / end.
     *
     *   vertical:
     *     line auto             → `bottom: 0` (anchored to safezone bottom)
     *     line in lower half    → anchored by `bottom: <100 - line>%` so
     *                              the cue sits ABOVE the line position
     *                              and never extends past the safezone
     *                              bottom (matches the native renderer's
     *                              fallback when a top-anchored cue
     *                              would overflow)
     *     line in upper half    → anchored by `top: <line>%`
     *
     *   text alignment inside the box maps to `.aligned-{start|center|end}`.
     *
     * Width is written as `size%`, never `100%` plus `left:3%` — that
     * combination would overflow the safezone by 3% on the right.
     */
    private applyCuePositioningTo(area: HTMLDivElement, cue: SubtitleCue): void {
        const a = area.style;

        // Vertical anchor — `line` is the cue's anchor position as a
        // percentage of the safezone. Native VTT renderers default
        // `lineAlign` to `start` (top edge at line%) but fall back to
        // bottom-anchoring when the cue would otherwise overflow the
        // safe area. We approximate that fallback by anchoring on the
        // closer edge: line ≤ 50 → top, line > 50 → bottom. This
        // keeps line:0 on the top edge and line:100 on the bottom
        // edge while preserving the gradient between them.
        if (typeof cue.line === 'number' && cue.line >= 0 && cue.line <= 100) {
            if (cue.line > 50) {
                a.top = '';
                a.bottom = `${100 - cue.line}%`;
            }
            else {
                a.bottom = '';
                a.top = `${cue.line}%`;
            }
        }
        else {
            a.top = '';
            a.bottom = '0';
        }

        // Text alignment inside the cue box.
        area.classList.remove('aligned-start', 'aligned-center', 'aligned-end');
        if (cue.align === 'start') area.classList.add('aligned-start');
        else if (cue.align === 'end') area.classList.add('aligned-end');
        else area.classList.add('aligned-center');

        // Horizontal box geometry — derived from `size` + `align` +
        // `position` per WebVTT cue layout (W3C WebVTT 1.0 §7.2):
        //
        //   anchor = 0 (start) | 0.5 (center) | 1 (end)
        //   position default = 0% (start) | 50% (center) | 100% (end)
        //   left = position - anchor * size
        //   width = size
        //
        // When the resulting box would extend past the safe-area
        // (left + width > 100%), the spec says to abandon the explicit
        // layout and try `line:auto`. Pragmatically we clamp width so
        // the box stays inside — preserves the requested anchor while
        // never losing trailing text off-screen.
        const size = Math.max(0, Math.min(100, cue.size));
        let anchor: number;
        let positionDefault: number;
        if (cue.align === 'start') { anchor = 0; positionDefault = 0; }
        else if (cue.align === 'end') { anchor = 1; positionDefault = 100; }
        else { anchor = 0.5; positionDefault = 50; }
        const position = (typeof cue.position === 'number') ? cue.position : positionDefault;
        const rawLeft = position - anchor * size;
        const left = Math.max(0, Math.min(100 - 0, rawLeft));
        const width = Math.max(0, Math.min(100 - left, size));

        a.left = `${left}%`;
        a.width = `${width}%`;
        // Clear any prior `right` so width-from-(left,right) computation
        // never fights the explicit width.
        a.right = '';
    }
}

/**
 * Color → `#RRGGBBAA` ported verbatim from the v1 player's
 * `parseColorToHex` (utils.ts). Uses a 2D canvas to normalise any CSS
 * color string the browser understands, then folds the 0–1 opacity
 * into the alpha byte. `'transparent'` short-circuits to `#00000000`,
 * and `NAMED_COLORS` is consulted first so common menu values
 * (`'white'`, `'black'`, …) resolve without spinning up a canvas.
 */
function parseColorToHex(color: string, opacity: number = 1): string {
    if (color.toLowerCase() === 'transparent') return '#00000000';
    if (NAMED_COLORS[color.toLowerCase()]) {
        return normalizeHex(NAMED_COLORS[color.toLowerCase()], opacity);
    }
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return '#00000000';
    ctx.fillStyle = color;
    const computed = ctx.fillStyle;
    if (computed.startsWith('rgb')) return rgbToHex(computed, opacity);
    if (/^#[0-9A-F]{3,8}$/i.test(computed)) return normalizeHex(computed, opacity);
    return computed;
}

function rgbToHex(rgb: string, opacity: number): string {
    const match = rgb.match(/\d+/g);
    if (!match) return '#00000000';
    const [r, g, b] = match.map(Number);
    const a = Math.round(opacity * 255);
    return `#${r!.toString(16).padStart(2, '0').toUpperCase()}`
        + `${g!.toString(16).padStart(2, '0').toUpperCase()}`
        + `${b!.toString(16).padStart(2, '0').toUpperCase()}`
        + `${a.toString(16).padStart(2, '0').toUpperCase()}`;
}

function normalizeHex(hex: string, opacity: number): string {
    if (hex.length === 4) {
        hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toUpperCase();
    }
    if (hex.length === 7) {
        const alpha = Math.round(opacity * 255).toString(16).padStart(2, '0').toUpperCase();
        return hex.toUpperCase() + alpha;
    }
    return hex.toUpperCase();
}

const NAMED_COLORS: Record<string, string> = {
    white: '#FFFFFF',
    black: '#000000',
    red: '#FF0000',
    green: '#00FF00',
    blue: '#0000FF',
    yellow: '#FFFF00',
    cyan: '#00FFFF',
    magenta: '#FF00FF',
    gray: '#808080',
};

/**
 * Edge style → CSS `text-shadow` ported verbatim from v1's `getEdgeStyle`.
 * Values are not arbitrary — they're what users picked in the original
 * settings menu, so deviating would surprise anyone migrating saved prefs.
 */
function getEdgeStyle(edgeStyle: string, opacity: number): string {
    const black = parseColorToHex('black', opacity);
    switch (edgeStyle) {
        case 'depressed': return `1px 1px 2px ${black}`;
        case 'dropShadow': return `2px 2px 4px ${black}`;
        case 'raised': return `-1px -1px 2px ${black}`;
        case 'uniform': return `0px 0px 4px ${black}`;
        case 'textShadow':
            return Array.from({ length: 7 }, () => `${black} 0px 0px 4px`).join(', ');
        default: return '';
    }
}

const STYLE_ID = 'nm-subtitle-overlay-styles';

function ensureStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.subtitle-overlay {
    pointer-events: none;
    position: absolute;
    z-index: 0;
}
.subtitle-overlay .subtitle-safezone {
    position: absolute;
    inset: 0;
    /* Action-safe inset for captions. WCAG 2.1 SC 1.2.2 / FCC 47 CFR
     * 79.4 only require captions to be "viewable in their entirety" -
     * they don't pin a specific percentage. SMPTE RP 27.3's 5%/5% rule
     * was calibrated to CRT overscan, which doesn't exist for web
     * delivery. Modern streamers (Netflix, YouTube, Apple TV+) ship
     * smaller horizontal margins to maximise readable line width on
     * widescreen and avoid the lopsided pixel inset that equal
     * percentages produce on non-square pictures.
     *
     * 5% top/bottom keeps captions clear of the edge no matter what
     * chrome / scrubber / device-bezel could clip them; 3% left/right
     * gives long lines breathing room without crowding. Per-axis
     * percentages still scale with the picture (the safezone is
     * letterbox-fit to the video display rect via the JS resize
     * handler), so pillarboxed 4:3 content gets a 3% horizontal
     * margin of the actual 4:3 picture, not the 16:9 player frame. */
    inset-block: 5%;
    inset-inline: 3%;
    margin: 0;
}
.subtitle-overlay .subtitle-area {
    direction: ltr;
    writing-mode: horizontal-tb;
    unicode-bidi: plaintext;
    white-space: pre-line;
    padding: 0.5rem 0;
    position: absolute;
    height: fit-content;
    font-size: 28px;
}
.subtitle-overlay .subtitle-area.aligned-start { text-align: left; }
.subtitle-overlay .subtitle-area.aligned-center { text-align: center; }
.subtitle-overlay .subtitle-area.aligned-end { text-align: right; }
.subtitle-overlay .subtitle-text {
    display: inline-block;
    white-space: pre-line;
    padding: 0 0.5rem;
    line-height: 1.2;
    writing-mode: horizontal-tb;
    unicode-bidi: plaintext;
    font-family: 'ReithSans', sans-serif;
    font-weight: 500;
    font-style: normal;
}
.subtitle-overlay .subtitle-text:empty { display: none; }
.subtitle-overlay .subtitle-text i { font-style: italic; }
.subtitle-overlay .subtitle-text b { font-weight: 800; }
.subtitle-overlay .subtitle-text u { text-decoration: underline; }
.subtitle-overlay .subtitle-text b i,
.subtitle-overlay .subtitle-text i b { font-weight: 800; font-style: italic; }
`;
    document.head.appendChild(style);
}

export const subtitleOverlayPlugin = SubtitleOverlayPlugin;
