/**
 * Progress bar concern — slider-bar DOM construction, chapter-marker rendering,
 * scrub helper types, and the time-formatting utility.
 *
 * Integration: `buildSliderBar()` returns `SliderBarRefs`. The plugin class
 * keeps the refs as instance fields and passes them into the chapter-marker
 * renderer and update helpers below. Event wiring (`wireSliderBar`) stays on
 * the class because it closes over both `this` state (isMouseDown, isScrubbing)
 * and the plugin lifecycle (`this.listen`, `this.timeout`).
 */

import type { NMVideoPlayer } from '@nomercy-entertainment/nomercy-video-player';


// ── Time formatting ────────────────────────────────────────────────────────────

/** Format a duration in seconds as `M:SS` or `H:MM:SS`. */
export function fmt(s: number): string {
    if (!Number.isFinite(s) || s < 0) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0
        ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
        : `${m}:${sec.toString().padStart(2, '0')}`;
}


// ── Slider bar DOM ─────────────────────────────────────────────────────────────

export interface SliderBarRefs {
    sliderBar: HTMLDivElement;
    sliderBuffer: HTMLDivElement;
    sliderHover: HTMLDivElement;
    sliderProgress: HTMLDivElement;
    chapterBar: HTMLDivElement;
    sliderNipple: HTMLDivElement;
    sliderPop: HTMLDivElement;
    sliderPopImage: HTMLDivElement;
    sliderPopText: HTMLDivElement;
    chapterText: HTMLDivElement;
}

/** Build the slider-bar subtree and return all named refs.
 *  Mirrors v1's `createProgressBar()`. The caller appends to its parent. */
export function buildSliderBar(player: NMVideoPlayer<any>): SliderBarRefs {
    const sliderBar = player.createElement('div', 'slider-bar')
        .addClasses(['slider-bar'])
        .get() as HTMLDivElement;
    sliderBar.setAttribute('role', 'slider');
    sliderBar.setAttribute('aria-label', 'Seek');
    sliderBar.setAttribute('aria-valuemin', '0');
    sliderBar.setAttribute('aria-valuemax', '100');
    sliderBar.setAttribute('aria-valuenow', '0');

    const sliderBuffer = player.createElement('div', 'slider-buffer')
        .addClasses(['slider-buffer'])
        .appendTo(sliderBar).get() as HTMLDivElement;
    const sliderHover = player.createElement('div', 'slider-hover')
        .addClasses(['slider-hover'])
        .appendTo(sliderBar).get() as HTMLDivElement;
    const sliderProgress = player.createElement('div', 'slider-progress')
        .addClasses(['slider-progress'])
        .appendTo(sliderBar).get() as HTMLDivElement;
    const chapterBar = player.createElement('div', 'chapter-progress')
        .addClasses(['chapter-bar'])
        .appendTo(sliderBar).get() as HTMLDivElement;

    const sliderNipple = player.createElement('div', 'slider-nipple')
        .addClasses(['slider-nipple'])
        .appendTo(sliderBar).get() as HTMLDivElement;

    const sliderPop = player.createElement('div', 'slider-pop')
        .addClasses(['slider-pop'])
        .appendTo(sliderBar).get() as HTMLDivElement;
    sliderPop.style.setProperty('--visibility', '0');

    const sliderPopImage = player.createElement('div', 'slider-pop-image')
        .addClasses(['slider-pop-image'])
        .appendTo(sliderPop).get() as HTMLDivElement;
    const sliderPopText = player.createElement('div', 'slider-text')
        .addClasses(['slider-pop-text'])
        .appendTo(sliderPop).get() as HTMLDivElement;
    const chapterText = player.createElement('div', 'chapter-text')
        .addClasses(['chapter-text'])
        .appendTo(sliderPop).get() as HTMLDivElement;

    return {
        sliderBar,
        sliderBuffer,
        sliderHover,
        sliderProgress,
        chapterBar,
        sliderNipple,
        sliderPop,
        sliderPopImage,
        sliderPopText,
        chapterText,
    };
}


// ── Chapter marker DOM ─────────────────────────────────────────────────────────

export interface ChapterMarkerRef {
    /** Chapter range, as percentages of total duration. */
    left: number;
    right: number;
    buffer: HTMLDivElement;
    hover: HTMLDivElement;
    progress: HTMLDivElement;
}

/** Chapter data as needed by the marker builder — subset of the player's chapter type. */
export interface ChapterLite {
    index: number;
    start: number;
    end: number;
    title?: string;
}

/** Build segmented chapter-marker DOM inside `chapterBar`, mirroring v1's
 *  `createChapterMarker`. Returns the new chapter refs array. The caller
 *  must wire click listeners via their own `listen` helper after calling this. */
export function buildChapterMarkers(
    chapterBar: HTMLDivElement,
    chapters: ChapterLite[],
    dur: number,
    onChapterClick: (index: number) => void,
    listen: (el: EventTarget, event: string, handler: (e: Event) => void) => void,
): ChapterMarkerRef[] {
    chapterBar.replaceChildren();

    if (!dur || chapters.length === 0) return [];

    const refs: ChapterMarkerRef[] = [];

    for (const ch of chapters) {
        const left = (ch.start / dur) * 100;
        const right = (ch.end / dur) * 100;
        const width = Math.max(0, right - left);

        const marker = document.createElement('div');
        marker.className = 'chapter-marker';
        marker.id = `chapter-marker-${ch.index}`;
        marker.style.left = `${left}%`;
        marker.style.width = `calc(${width}% - 2px)`;

        const bg = document.createElement('div');
        bg.className = 'chapter-marker-bg';
        const buffer = document.createElement('div');
        buffer.className = 'chapter-marker-buffer';
        const hover = document.createElement('div');
        hover.className = 'chapter-marker-hover';
        const progress = document.createElement('div');
        progress.className = 'chapter-marker-progress';

        marker.append(bg, buffer, hover, progress);
        chapterBar.appendChild(marker);

        listen(marker, 'click', (e: Event) => {
            e.stopPropagation();
            onChapterClick(ch.index);
        });

        refs.push({ left, right, buffer, hover, progress });
    }

    return refs;
}


// ── Chapter state updaters ─────────────────────────────────────────────────────

/** Update chapter-marker progress fills for the given playback percentage. */
export function updateChapterProgress(refs: ChapterMarkerRef[], percentage: number): void {
    for (const m of refs) {
        if (percentage < m.left) {
            m.progress.style.transform = 'scaleX(0)';
        }
        else if (percentage > m.right) {
            m.progress.style.transform = 'scaleX(1)';
        }
        else {
            const span = Math.max(0.0001, m.right - m.left);
            m.progress.style.transform = `scaleX(${(percentage - m.left) / span})`;
        }
    }
}

/** Update chapter-marker buffer fills for the given buffered percentage. */
export function updateChapterBuffer(refs: ChapterMarkerRef[], bufferedPct: number): void {
    for (const m of refs) {
        if (bufferedPct <= m.left) {
            m.buffer.style.transform = 'scaleX(0)';
        }
        else if (bufferedPct >= m.right) {
            m.buffer.style.transform = 'scaleX(1)';
        }
        else {
            const span = Math.max(0.0001, m.right - m.left);
            m.buffer.style.transform = `scaleX(${(bufferedPct - m.left) / span})`;
        }
    }
}

/** Update chapter-marker hover fills for the given scrub percentage. */
export function updateChapterHover(refs: ChapterMarkerRef[], scrubPct: number): void {
    for (const m of refs) {
        if (scrubPct < m.left) {
            m.hover.style.transform = 'scaleX(0)';
        }
        else if (scrubPct > m.right) {
            m.hover.style.transform = 'scaleX(1)';
        }
        else {
            const span = Math.max(0.0001, m.right - m.left);
            m.hover.style.transform = `scaleX(${(scrubPct - m.left) / span})`;
        }
    }
}
