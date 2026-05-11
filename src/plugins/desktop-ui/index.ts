/**
 * Desktop UI overlay plugin — v2-native rewrite of the v1 examples plugin.
 *
 * File map (desktop-ui/ folder):
 *
 *   index.ts        — DesktopUiPlugin class: lifecycle (use/dispose), DOM
 *                     composition, event wiring, menu state, activity/hide.
 *   topBar.ts       — Top-bar DOM + title/show-info update + back-button logic.
 *   progressBar.ts  — Slider-bar DOM, chapter-marker rendering, time formatting,
 *                     chapter state updaters (progress/buffer/hover).
 *   buttonState.ts  — apply* helpers: volume, mute, rate, quality, fullscreen,
 *                     theater, subtitles, PiP, aspect-ratio icon/aria updates.
 *   menus.ts        — Menu-frame DOM + all sub-pane renderers (speed, quality,
 *                     subtitles, audio, playlist, subtitleSettings, aspectRatio).
 *   buttons.ts      — Fluent UI icon SVG path data table.
 *   icons.ts        — svgFromIcon() renderer on top of buttons.ts.
 *   sprite.ts       — Sprite VTT parser + thumbnail lookup for slider-pop.
 *   styles.ts       — CSS injection (ensureDesktopUiStyles).
 *
 * UX rule — menu vs. cycle:
 *   Pointer-input buttons (control bar) open menus for multi-state features.
 *   The cycle action (cycleAspectRatio, etc.) is for remote-control and key-bind
 *   contexts where the user cannot pick from a list. Quality, subtitles, audio,
 *   speed, and aspect-ratio are all menu-driven on click. Theater / PiP /
 *   Fullscreen are binary toggles — direct action on click is correct for those.
 *
 * DOM tree (mirrors v1 div-by-div):
 *
 *   overlay
 *     ├─ nm-top-bar > nm-title              (topBar.ts)
 *     ├─ nm-center > nm-spinner + nm-center-btn
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

import { Plugin } from '@nomercy-entertainment/nomercy-player-core';
import { TheaterState, VolumeState, type NMVideoPlayer, type VideoEventMap, type VideoPlaylistItem } from '@nomercy-entertainment/nomercy-video-player';

import { svgFromIcon, fluentIcons } from './icons';
import { ensureDesktopUiStyles } from './styles';
import { loadSpriteSet, lookupCue, type SpriteSet } from './sprite';
import {
    buildMenuFrame,
    renderAspectRatioPane,
    renderAudioPane,
    renderPlaylistPane,
    renderQualityPane,
    renderSpeedPane,
    renderSubsPane,
    renderSubtitleSettingsPane,
    type AudioTrackLite,
    type MenuFrameRefs,
    type MenuRenderState,
    type QualityLevelLite,
    type SubMenuId,
    type SubtitleTrackLite,
} from './menus';
import {
    fmt,
    buildSliderBar,
    buildChapterMarkers,
    updateChapterProgress,
    updateChapterBuffer,
    updateChapterHover,
    type SliderBarRefs,
    type ChapterMarkerRef,
    type ChapterLite,
} from './progressBar';
import {
    buildTitleBar,
    updateTitleBar,
    refreshBackButton,
    type TopBarRefs,
} from './topBar';
import {
    applyVolume,
    applyMuted,
    applyMutedIcon,
    applyRate,
    applyQualityIcon,
    applyFullscreen,
    applyTheaterIcon,
    applySubsIcon,
    applyPipIcon,
    applyAspectRatioIcon,
} from './buttonState';

/**
 * Per-button visibility overrides for the desktop UI control bar.
 *
 * Default-ON buttons (omit or set `true` to show): play, mute, volume,
 * fullscreen, settings.
 *
 * Default-OFF buttons (set `true` to enable): theater, pip, speed, quality,
 * subtitles, audio, playlist, chapterPrev, chapterNext, seekBack, seekForward,
 * aspectRatio.
 *
 * Navigation (always-on when queue has multiple items): next, previous.
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

export interface DesktopUiOptions {
    hideTitle?: boolean;
    disableClickToPause?: boolean;
    inactivityMs?: number;
    imageBaseUrl?: string;
    /** Per-button opt-in / opt-out. Unset keys use the button's own default. */
    buttons?: DesktopUiButtonOptions;
    /**
     * Priority order for responsive removal when the container is narrow.
     * Buttons at the end are removed first. Override to change the default order.
     * Default order: play → mute → volume → fullscreen → settings → next →
     * previous → seekBack → seekForward → chapterPrev → chapterNext →
     * theater → pip → speed → quality → subtitles → audio → aspectRatio → playlist.
     */
    buttonPriority?: ButtonPriorityList;
    /**
     * Volume slider orientation.
     * - `'horizontal'` — inline slider that expands on hover (default).
     * - `'vertical'`   — popup slider above the mute button, toggle on click.
     * - `'auto'`       — vertical when the player width is ≤ 520 px, else horizontal.
     */
    volumeSlider?: 'horizontal' | 'vertical' | 'auto';
}

interface SidecarTrackEntry {
    kind?: string;
    file?: string;
}

interface ItemWithSidecarTracks {
    tracks: SidecarTrackEntry[];
}

function hasTrackArray(item: unknown): item is ItemWithSidecarTracks {
    return (
        item !== null
        && typeof item === 'object'
        && 'tracks' in item
        && Array.isArray((item as Record<string, unknown>).tracks)
    );
}

function readSidecarTracks(item: unknown): SidecarTrackEntry[] | undefined {
    if (!hasTrackArray(item)) return undefined;
    return item.tracks;
}

const DEFAULT_ON_BUTTONS: ReadonlySet<keyof DesktopUiButtonOptions> = new Set([
    'play', 'mute', 'volume', 'fullscreen', 'settings', 'next', 'previous',
    'seekBack', 'seekForward',
]);

function buttonVisible(
    key: keyof DesktopUiButtonOptions,
    opts: DesktopUiButtonOptions | undefined,
): boolean {
    if (opts && key in opts) return Boolean(opts[key]);
    return DEFAULT_ON_BUTTONS.has(key);
}


/** Events emitted by {@link DesktopUiPlugin} under the `plugin:desktop-ui:` namespace. */
export interface DesktopUiEvents {
    'shortcuts-toggle': undefined;
}


export class DesktopUiPlugin extends Plugin<NMVideoPlayer<VideoPlaylistItem>, DesktopUiOptions, DesktopUiEvents> {
    static override readonly id: string = 'desktop-ui';
    static override readonly version: string = '2.0.0';
    static override readonly description: string = 'Official desktop UI overlay (v2 rewrite)';

    static override readonly translations = {
        en: {
            'plugin.desktop-ui.tooltip.play': 'Play / Pause',
            'plugin.desktop-ui.tooltip.previous': 'Previous',
            'plugin.desktop-ui.tooltip.next': 'Next',
            'plugin.desktop-ui.tooltip.seekBack': 'Seek back 10 s',
            'plugin.desktop-ui.tooltip.seekForward': 'Seek forward 10 s',
            'plugin.desktop-ui.tooltip.chapterPrev': 'Previous chapter',
            'plugin.desktop-ui.tooltip.chapterNext': 'Next chapter',
            'plugin.desktop-ui.tooltip.mute': 'Mute / Unmute',
            'plugin.desktop-ui.tooltip.aspectRatio': 'Aspect ratio',
            'plugin.desktop-ui.tooltip.theater': 'Theater mode',
            'plugin.desktop-ui.tooltip.pip': 'Picture-in-picture',
            'plugin.desktop-ui.tooltip.speed': 'Playback speed',
            'plugin.desktop-ui.tooltip.subtitles': 'Subtitles',
            'plugin.desktop-ui.tooltip.audio': 'Audio track',
            'plugin.desktop-ui.tooltip.quality': 'Quality',
            'plugin.desktop-ui.tooltip.playlist': 'Episodes',
            'plugin.desktop-ui.tooltip.settings': 'Settings',
            'plugin.desktop-ui.tooltip.fullscreen': 'Fullscreen',
            'plugin.desktop-ui.tooltip.nextWithTitle': 'Next: {title}',
            'plugin.desktop-ui.tooltip.previousWithTitle': 'Previous: {title}',
            'plugin.desktop-ui.tooltip.nextChapterWithTitle': 'Next chapter: {title}',
            'plugin.desktop-ui.tooltip.previousChapterWithTitle': 'Previous chapter: {title}',
            'plugin.desktop-ui.shortcuts.title': 'Keyboard shortcuts',
            'plugin.desktop-ui.shortcuts.playPause': 'Play / Pause',
            'plugin.desktop-ui.shortcuts.seekBackForward': 'Seek −10 s / +10 s',
            'plugin.desktop-ui.shortcuts.volumeUpDown': 'Volume +10% / −10%',
            'plugin.desktop-ui.shortcuts.mute': 'Mute / Unmute',
            'plugin.desktop-ui.shortcuts.fullscreen': 'Fullscreen',
            'plugin.desktop-ui.shortcuts.theater': 'Theater mode',
            'plugin.desktop-ui.shortcuts.pip': 'Picture-in-picture',
            'plugin.desktop-ui.shortcuts.next': 'Next item',
            'plugin.desktop-ui.shortcuts.previous': 'Previous item',
            'plugin.desktop-ui.shortcuts.chapters': 'Previous / Next chapter',
            'plugin.desktop-ui.shortcuts.help': 'Show / hide shortcuts',
        },
    };

    // ── top bar ─────────────────────────────────────────────────────
    private topBarRefs!: TopBarRefs;

    private centerWrap!: HTMLDivElement;
    private centerBtn!: HTMLButtonElement;
    private spinner!: HTMLDivElement;

    private bottomBar!: HTMLDivElement;
    private topRow!: HTMLDivElement;
    private bottomRow!: HTMLDivElement;

    // ── slider-bar tree ─────────────────────────────────────────────
    private sliderRefs!: SliderBarRefs;
    private chapterRefs: ChapterMarkerRef[] = [];

    /** Sprite preview thumbnails for the current playlist item. */
    private spriteSet: SpriteSet | null = null;
    private spriteLoadId = 0;

    /** v2's subtitleState/audioTrackState/qualityState methods return
     *  ON/OFF/AUTO/MANUAL enums — not the active track index. The menu
     *  panes need to know which entry to mark active, so we track the
     *  selected indexes ourselves from the player's `subtitle` /
     *  `audioTrack` / `level-switched` events. -1 / null = "off / auto". */
    private activeSubtitleIdx: number | null = -1;
    private activeAudioIdx: number = -1;
    private activeQualityIdx: number | 'auto' = 'auto';

    private isMouseDown = false;
    private isScrubbing = false;
    private _showRemaining = true;

    /** True when the user explicitly picked a non-auto quality level via the
     *  menu. Resets to false when "Auto" is picked. HLS level-switched events
     *  never touch this flag — it tracks user INTENT, not the actual level. */
    private _userPickedQuality = false;

    // ── transport buttons ───────────────────────────────────────────
    private playBtn!: HTMLButtonElement;
    private prevBtn!: HTMLButtonElement;
    private nextBtn!: HTMLButtonElement;
    private rewindBtn!: HTMLButtonElement;
    private forwardBtn!: HTMLButtonElement;
    private chapBackBtn!: HTMLButtonElement;
    private chapFwdBtn!: HTMLButtonElement;
    private volBtn!: HTMLButtonElement;
    private volSlider!: HTMLInputElement;
    /** Vertical volume slider popup. Null until `buildBottomRow` creates it. */
    private volSliderVertical: HTMLDivElement | null = null;
    private _volSliderVerticalOpen = false;
    private currentTimeEl!: HTMLDivElement;
    private remainingTimeEl!: HTMLDivElement;
    private aspectRatioBtn!: HTMLButtonElement;
    private speedBtn!: HTMLButtonElement;
    private qualityBtn!: HTMLButtonElement;
    private subsBtn!: HTMLButtonElement;
    private audioBtn!: HTMLButtonElement;
    private theaterBtn!: HTMLButtonElement;
    private pipBtn!: HTMLButtonElement;
    private playlistBtn!: HTMLButtonElement;
    private settingsBtn!: HTMLButtonElement;
    private fsBtn!: HTMLButtonElement;

    // ── menu refs ───────────────────────────────────────────────────
    private menus!: MenuFrameRefs;
    private menuOpen = false;
    private currentSubMenu: SubMenuId | null = null;

    // ── keyboard shortcuts overlay ───────────────────────────────────
    private shortcutsOverlay: HTMLDivElement | null = null;
    private _shortcutsVisible = false;

    private inactivityToken: number | null = null;
    private cachedDuration = 0;
    private _lastMouseX = -1;
    private _lastMouseY = -1;
    private _tooltipHoverToken: number | null = null;
    private _resizeObserver: ResizeObserver | null = null;

    override use(): void {
        ensureDesktopUiStyles();
        this.buildDom();
        this.wireTooltips();
        this.wireEvents();
        this.wireResponsive();
        void Promise.resolve(this.storage.getJSON('showRemaining')).then(v => {
            this._showRemaining = (v as boolean | null) ?? true;
        });
        this.applyInitialState();
        this.bumpActivity();
    }

    // ── DOM construction ─────────────────────────────────────────────────
    private buildDom(): void {
        const root = this.mount('overlay');
        this.player.addClasses(root, ['nmplayer-desktop-ui-overlay']);

        this.player.container.classList.add('nomercyplayer');

        if (!this.opts?.hideTitle) {
            this.topBarRefs = buildTitleBar(this.player, root);
        }
        this.centerWrap = this.buildCenter(root);
        this.bottomBar = this.buildBottomBar(root);

        this.menus = buildMenuFrame(this.player, root, this.listen.bind(this), {
            closeMenu: () => this.closeAllMenus(),
            openSubMenu: (id) => this.openSubMenu(id),
            backToMain: () => this.openMainMenu(),
        });

        this.shortcutsOverlay = this.buildShortcutsOverlay(root);
    }

    private buildCenter(parent: HTMLElement): HTMLDivElement {
        const wrap = this.player.createElement('div', 'nmplayer-center')
            .addClasses(['nm-center'])
            .appendTo(parent).get();

        this.spinner = this.player.createElement('div', 'nmplayer-spinner')
            .addClasses(['nm-spinner'])
            .appendTo(wrap).get();
        this.spinner.innerHTML = '<svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="100 28"/></svg>';

        this.centerBtn = this.player.createButton('nmplayer-center-btn', fluentIcons.bigPlay.title || 'Play', () => {});
        this.player.addClasses(this.centerBtn, ['nm-center-btn']);
        this.centerBtn.innerHTML = svgFromIcon(fluentIcons.bigPlay, 32);
        wrap.appendChild(this.centerBtn);
        return wrap;
    }

    // ── Keyboard shortcuts overlay ───────────────────────────────────────
    private buildShortcutsOverlay(parent: HTMLElement): HTMLDivElement {
        const overlay = this.player.createElement('div', 'nm-shortcuts-overlay')
            .addClasses(['nm-shortcuts-overlay'])
            .appendTo(parent).get();

        const shortcutRows: Array<[string, string]> = [
            ['Space', 'shortcuts.playPause'],
            ['← / →', 'shortcuts.seekBackForward'],
            ['↑ / ↓', 'shortcuts.volumeUpDown'],
            ['M', 'shortcuts.mute'],
            ['F', 'shortcuts.fullscreen'],
            ['T', 'shortcuts.theater'],
            ['P', 'shortcuts.pip'],
            ['N', 'shortcuts.next'],
            ['B', 'shortcuts.previous'],
            ['Shift+N / Shift+P', 'shortcuts.chapters'],
            ['?', 'shortcuts.help'],
        ];

        const title = document.createElement('h2');
        title.className = 'nm-shortcuts-title';
        title.textContent = this.t('shortcuts.title', {});
        overlay.appendChild(title);

        const grid = document.createElement('dl');
        grid.className = 'nm-shortcuts-grid';
        for (const [key, labelKey] of shortcutRows) {
            const term = document.createElement('dt');
            term.textContent = key;
            const def = document.createElement('dd');
            def.textContent = this.t(labelKey, {});
            grid.appendChild(term);
            grid.appendChild(def);
        }
        overlay.appendChild(grid);

        this.listen(overlay, 'click', () => this.toggleShortcuts());

        return overlay;
    }

    private toggleShortcuts(): void {
        this._shortcutsVisible = !this._shortcutsVisible;
        if (this.shortcutsOverlay) {
            this.shortcutsOverlay.classList.toggle('nm-shortcuts-overlay-visible', this._shortcutsVisible);
        }
    }

    private buildBottomBar(parent: HTMLElement): HTMLDivElement {
        const bar = this.player.createElement('div', 'bottom-bar')
            .addClasses(['bottom-bar'])
            .appendTo(parent).get();

        // Gradient backdrop sits behind everything in the bottom bar.
        this.player.createElement('div', 'bottom-bar-shadow')
            .addClasses(['bottom-bar-shadow'])
            .appendTo(bar);

        this.topRow = this.player.createElement('div', 'top-row')
            .addClasses(['top-row'])
            .appendTo(bar).get();

        this.sliderRefs = buildSliderBar(this.player);
        this.topRow.appendChild(this.sliderRefs.sliderBar);

        this.bottomRow = this.player.createElement('div', 'bottom-row')
            .addClasses(['bottom-row'])
            .appendTo(bar).get();
        this.buildBottomRow(this.bottomRow);

        return bar;
    }

    private buildBottomRow(parent: HTMLElement): void {
        const btns = this.opts?.buttons;
        const show = (key: keyof DesktopUiButtonOptions): boolean => buttonVisible(key, btns);

        this.playBtn = this.iconBtn('playback', 'play');
        this.playBtn.hidden = !show('play');
        parent.appendChild(this.playBtn);

        this.prevBtn = this.iconBtn('previous', 'previous');
        this.prevBtn.hidden = !show('previous');
        parent.appendChild(this.prevBtn);

        this.rewindBtn = this.iconBtn('seek-back', 'seekBack');
        this.rewindBtn.hidden = !show('seekBack');
        parent.appendChild(this.rewindBtn);

        this.forwardBtn = this.iconBtn('seek-forward', 'seekForward');
        this.forwardBtn.hidden = !show('seekForward');
        parent.appendChild(this.forwardBtn);

        this.chapBackBtn = this.iconBtn('chapter-back', 'chapterBack');
        this.chapBackBtn.hidden = !show('chapterPrev');
        parent.appendChild(this.chapBackBtn);

        this.chapFwdBtn = this.iconBtn('chapter-forward', 'chapterForward');
        this.chapFwdBtn.hidden = !show('chapterNext');
        parent.appendChild(this.chapFwdBtn);

        this.nextBtn = this.iconBtn('next', 'next');
        this.nextBtn.hidden = !show('next');
        parent.appendChild(this.nextBtn);

        const volContainer = this.player.createElement('div', 'volume-container')
            .addClasses(['volume-container'])
            .appendTo(parent).get();
        volContainer.hidden = !show('mute') && !show('volume');

        this.volBtn = this.iconBtn('volume', 'volumeHigh');
        this.volBtn.hidden = !show('mute');
        volContainer.appendChild(this.volBtn);

        this.volSlider = this.player.createElement('input', 'volume-slider')
            .addClasses(['volume-slider'])
            .appendTo(volContainer).get();
        this.volSlider.type = 'range';
        this.volSlider.min = '0';
        this.volSlider.max = '100';
        this.volSlider.value = '100';
        this.volSlider.setAttribute('aria-label', 'Volume');
        this.volSlider.hidden = !show('volume');

        // Vertical slider popup (hidden initially; activated by wireVolumeSlider).
        const vertPop = this.player.createElement('div', 'volume-slider-vertical')
            .addClasses(['volume-slider-vertical'])
            .appendTo(volContainer).get();
        const vertInput = this.player.createElement('input', 'volume-slider-vertical-input')
            .addClasses(['volume-slider-vertical-input'])
            .appendTo(vertPop).get();
        vertInput.type = 'range';
        vertInput.min = '0';
        vertInput.max = '100';
        vertInput.value = '100';
        vertInput.setAttribute('aria-label', 'Volume');
        vertInput.setAttribute('orient', 'vertical');
        this.volSliderVertical = vertPop;

        this.wireVolumeSlider(volContainer, vertPop, vertInput);

        this.currentTimeEl = this.player.createElement('div', 'current-time')
            .addClasses(['current-time', 'time'])
            .appendTo(parent).get();
        this.currentTimeEl.textContent = '0:00';

        this.player.createElement('div', 'divider')
            .addClasses(['divider'])
            .appendTo(parent);

        this.remainingTimeEl = this.player.createElement('div', 'remaining-time')
            .addClasses(['remaining-time', 'time'])
            .appendTo(parent).get();
        this.remainingTimeEl.textContent = '0:00';

        this.aspectRatioBtn = this.iconBtn('aspect-ratio', 'aspectFit');
        this.aspectRatioBtn.hidden = !show('aspectRatio');
        parent.appendChild(this.aspectRatioBtn);

        this.theaterBtn = this.iconBtn('theater', 'theater');
        this.theaterBtn.hidden = !show('theater');
        parent.appendChild(this.theaterBtn);

        this.pipBtn = this.iconBtn('pip', 'pipEnter');
        this.pipBtn.hidden = !show('pip');
        parent.appendChild(this.pipBtn);

        this.speedBtn = this.iconBtn('speed', 'speed');
        this.speedBtn.setAttribute('aria-label', 'Speed (1x)');
        this.speedBtn.hidden = !show('speed');
        parent.appendChild(this.speedBtn);

        this.subsBtn = this.iconBtn('subtitles', 'subtitles');
        this.subsBtn.hidden = !show('subtitles');
        parent.appendChild(this.subsBtn);

        this.audioBtn = this.iconBtn('audio', 'language');
        this.audioBtn.hidden = !show('audio');
        parent.appendChild(this.audioBtn);

        this.qualityBtn = this.iconBtn('quality', 'quality');
        this.qualityBtn.hidden = !show('quality');
        parent.appendChild(this.qualityBtn);

        this.playlistBtn = this.iconBtn('playlist', 'playlist');
        this.playlistBtn.hidden = !show('playlist');
        parent.appendChild(this.playlistBtn);

        this.settingsBtn = this.iconBtn('settings', 'settings');
        this.settingsBtn.hidden = !show('settings');
        parent.appendChild(this.settingsBtn);

        this.fsBtn = this.iconBtn('fullscreen', 'fullscreen');
        this.fsBtn.hidden = !show('fullscreen');
        parent.appendChild(this.fsBtn);
    }

    private iconBtn(id: string, iconName: string): HTMLButtonElement {
        const icon = fluentIcons[iconName];
        const btn = this.player.createButton(id, icon.title || iconName, () => {});
        this.player.addClasses(btn, ['nm-btn']);
        btn.style.position = 'relative';
        btn.innerHTML = svgFromIcon(icon);
        return btn;
    }

    /**
     * Attach a hover tooltip to a button. `getText` is evaluated lazily on
     * each hover so dynamic labels (next chapter, next item title) stay current.
     * Tooltip appears after 500 ms; dismissed on click or mouseleave.
     * The tooltip is clamped so it never escapes the player container's left/right edge.
     */
    private addTooltip(btn: HTMLButtonElement, getText: () => string): void {
        const tip = document.createElement('span');
        tip.className = 'nm-tooltip';

        const show = (): void => {
            tip.textContent = getText();
            tip.classList.add('nm-tooltip-visible');
            this.clampTooltip(tip, btn);
        };
        const hide = (): void => {
            if (this._tooltipHoverToken !== null) {
                clearTimeout(this._tooltipHoverToken);
                this._tooltipHoverToken = null;
            }
            tip.classList.remove('nm-tooltip-visible');
        };

        btn.removeAttribute('title');
        btn.appendChild(tip);

        this.listen(btn, 'mouseenter', () => {
            if (this._tooltipHoverToken !== null) clearTimeout(this._tooltipHoverToken);
            this._tooltipHoverToken = this.timeout(() => show(), 500);
        });
        this.listen(btn, 'mouseleave', () => hide());
        this.listen(btn, 'click', () => hide());
    }

    private clampTooltip(tip: HTMLSpanElement, btn: HTMLButtonElement): void {
        const containerRect = this.player.container.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        const tipWidth = tip.offsetWidth;

        const btnCenter = btnRect.left + btnRect.width / 2;
        const halfTip = tipWidth / 2;

        const rawLeft = btnCenter - halfTip;
        const rawRight = btnCenter + halfTip;

        const clampedLeft = Math.max(containerRect.left, rawLeft);
        const clampedRight = Math.min(containerRect.right, rawRight);

        const actualLeft = rawLeft < clampedLeft
            ? clampedLeft
            : rawRight > clampedRight
                ? rawRight - tipWidth
                : rawLeft;

        const shift = actualLeft - btnCenter + halfTip;
        tip.style.transform = `translateX(calc(-50% + ${shift}px))`;
    }

    private wireTooltips(): void {
        this.addTooltip(this.playBtn, () => this.t('tooltip.play', {}));
        this.addTooltip(this.rewindBtn, () => this.t('tooltip.seekBack', {}));
        this.addTooltip(this.forwardBtn, () => this.t('tooltip.seekForward', {}));
        this.addTooltip(this.volBtn, () => this.t('tooltip.mute', {}));
        this.addTooltip(this.aspectRatioBtn, () => this.t('tooltip.aspectRatio', {}));
        this.addTooltip(this.theaterBtn, () => this.t('tooltip.theater', {}));
        this.addTooltip(this.pipBtn, () => this.t('tooltip.pip', {}));
        this.addTooltip(this.speedBtn, () => this.t('tooltip.speed', {}));
        this.addTooltip(this.subsBtn, () => this.t('tooltip.subtitles', {}));
        this.addTooltip(this.audioBtn, () => this.t('tooltip.audio', {}));
        this.addTooltip(this.qualityBtn, () => this.t('tooltip.quality', {}));
        this.addTooltip(this.playlistBtn, () => this.t('tooltip.playlist', {}));
        this.addTooltip(this.settingsBtn, () => this.t('tooltip.settings', {}));
        this.addTooltip(this.fsBtn, () => this.t('tooltip.fullscreen', {}));

        this.addTooltip(this.prevBtn, () => {
            const idx = this.safeCurrentIndex();
            const queue = this.player.queue() ?? [];
            const prevItem = idx > 0 ? queue[idx - 1] : undefined;
            if (prevItem?.title) {
                return this.t('tooltip.previousWithTitle', { title: prevItem.title });
            }
            return this.t('tooltip.previous', {});
        });

        this.addTooltip(this.nextBtn, () => {
            const idx = this.safeCurrentIndex();
            const queue = this.player.queue() ?? [];
            const nextItem = queue[idx + 1];
            if (nextItem?.title) {
                return this.t('tooltip.nextWithTitle', { title: nextItem.title });
            }
            return this.t('tooltip.next', {});
        });

        this.addTooltip(this.chapBackBtn, () => {
            const chapters = this.player.chapters();
            const time = this.player.currentTime?.() ?? 0;
            const prev = [...chapters].reverse().find(ch => ch.start < time - 1);
            if (prev?.title) {
                return this.t('tooltip.previousChapterWithTitle', { title: prev.title });
            }
            return this.t('tooltip.chapterPrev', {});
        });

        this.addTooltip(this.chapFwdBtn, () => {
            const chapters = this.player.chapters();
            const time = this.player.currentTime?.() ?? 0;
            const next = chapters.find(ch => ch.start > time + 1);
            if (next?.title) {
                return this.t('tooltip.nextChapterWithTitle', { title: next.title });
            }
            return this.t('tooltip.chapterNext', {});
        });
    }

    // ── Responsive button removal ────────────────────────────────────────
    private wireResponsive(): void {
        if (typeof ResizeObserver === 'undefined') return;

        const defaultPriority: ButtonPriorityList = [
            'play', 'mute', 'volume', 'fullscreen', 'settings',
            'next', 'previous', 'seekBack', 'seekForward',
            'chapterPrev', 'chapterNext',
            'theater', 'pip', 'speed', 'quality', 'subtitles', 'audio', 'aspectRatio', 'playlist',
        ];
        const priority = this.opts?.buttonPriority ?? defaultPriority;

        const buttonMap: Record<keyof DesktopUiButtonOptions, HTMLButtonElement | null> = {
            play: this.playBtn,
            mute: this.volBtn,
            volume: null,
            fullscreen: this.fsBtn,
            settings: this.settingsBtn,
            next: this.nextBtn,
            previous: this.prevBtn,
            seekBack: this.rewindBtn,
            seekForward: this.forwardBtn,
            chapterPrev: this.chapBackBtn,
            chapterNext: this.chapFwdBtn,
            theater: this.theaterBtn,
            pip: this.pipBtn,
            speed: this.speedBtn,
            quality: this.qualityBtn,
            subtitles: this.subsBtn,
            audio: this.audioBtn,
            aspectRatio: this.aspectRatioBtn,
            playlist: this.playlistBtn,
        };

        const COLLAPSE_THRESHOLD = 480;

        const applyResponsive = (width: number): void => {
            const narrow = width < COLLAPSE_THRESHOLD;
            for (let idx = priority.length - 1; idx >= 0; idx--) {
                const key = priority[idx];
                if (!key) continue;
                const btn = buttonMap[key];
                if (!btn) continue;
                const optHidden = !buttonVisible(key, this.opts?.buttons);
                if (optHidden) continue;
                const rank = priority.length - 1 - idx;
                const shouldHide = narrow && rank > 3;
                btn.hidden = shouldHide;
            }
        };

        this._resizeObserver = new ResizeObserver(entries => {
            const entry = entries[0];
            if (!entry) return;
            applyResponsive(entry.contentRect.width);
        });

        this._resizeObserver.observe(this.player.container);
        this.lifecycle.addCleanup(() => {
            this._resizeObserver?.disconnect();
            this._resizeObserver = null;
        });
    }

    // ── Volume slider orientation ─────────────────────────────────────────
    /**
     * Decides at construction time (before ResizeObserver fires) whether to
     * render the horizontal expand-on-hover slider or the vertical click-popup.
     * `auto` defers to a ResizeObserver callback that toggles the mode live.
     */
    private wireVolumeSlider(
        volContainer: HTMLElement,
        vertPop: HTMLDivElement,
        vertInput: HTMLInputElement,
    ): void {
        const mode = this.opts?.volumeSlider ?? 'horizontal';

        const applyVertical = (on: boolean): void => {
            volContainer.classList.toggle('volume-container-vertical', on);
        };

        const syncVertInput = (): void => {
            const pct = Math.round((this.player.volume?.() ?? 1) * 100);
            vertInput.value = String(pct);
            vertInput.style.setProperty('--vol-pct', `${pct}%`);
        };

        const openVertPop = (): void => {
            if (this._volSliderVerticalOpen) {
                vertPop.classList.remove('volume-slider-vertical-open');
                this._volSliderVerticalOpen = false;
                return;
            }
            syncVertInput();
            vertPop.classList.add('volume-slider-vertical-open');
            this._volSliderVerticalOpen = true;
        };

        const closeVertPop = (): void => {
            vertPop.classList.remove('volume-slider-vertical-open');
            this._volSliderVerticalOpen = false;
        };

        this.listen(vertInput, 'input', () => {
            const level = Number(vertInput.value) / 100;
            vertInput.style.setProperty('--vol-pct', `${vertInput.value}%`);
            void this.player.volume?.(level);
        });

        if (mode === 'vertical') {
            applyVertical(true);
            this.listen(this.volBtn, 'click', () => openVertPop());
            this.listen(document, 'click', (e: Event) => {
                if (!volContainer.contains(e.target as Node)) closeVertPop();
            });
            return;
        }

        if (mode === 'auto') {
            if (typeof ResizeObserver === 'undefined') return;

            const AUTO_VERTICAL_THRESHOLD = 520;
            const resizer = new ResizeObserver(entries => {
                const entry = entries[0];
                if (!entry) return;
                const useVertical = entry.contentRect.width <= AUTO_VERTICAL_THRESHOLD;
                applyVertical(useVertical);
                if (!useVertical && this._volSliderVerticalOpen) closeVertPop();
            });
            resizer.observe(this.player.container);
            this.lifecycle.addCleanup(() => resizer.disconnect());

            this.listen(this.volBtn, 'click', () => {
                if (volContainer.classList.contains('volume-container-vertical')) {
                    openVertPop();
                }
            });
            this.listen(document, 'click', (e: Event) => {
                if (!volContainer.contains(e.target as Node)) closeVertPop();
            });
        }

        // `horizontal` mode: no extra wiring — CSS handles expand-on-hover.
    }

    // ── Event wiring ─────────────────────────────────────────────────────
    private wireEvents(): void {
        const container = this.player.container;
        if (container) {
            this.listen(container, 'mousemove', (e: Event) => {
                const me = e as MouseEvent;
                const dx = me.clientX - this._lastMouseX;
                const dy = me.clientY - this._lastMouseY;
                if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
                this._lastMouseX = me.clientX;
                this._lastMouseY = me.clientY;
                this.bumpActivity();
            });
            this.listen(container, 'mousedown', () => this.bumpActivity());
            this.listen(container, 'pointerdown', () => this.bumpActivity());
            this.listen(container, 'keydown', (e: Event) => {
                this.bumpActivity();
                const ke = e as KeyboardEvent;
                if (ke.key === '?' && !ke.ctrlKey && !ke.metaKey && !ke.altKey) {
                    ke.preventDefault();
                    this.toggleShortcuts();
                }
            });
            this.listen(container, 'mouseleave', () => this.maybeHide());
            this.listen(container, 'click', (e: Event) => {
                this.bumpActivity();
                const target = e.target as HTMLElement;
                if (target.tagName === 'VIDEO' && !this.opts?.disableClickToPause) {
                    void this.player.togglePlayback();
                }
            });
        }

        this.on(DesktopUiPlugin, 'shortcuts-toggle', () => this.toggleShortcuts());

        this.on('play', () => this.setPlayingState(true));
        this.on('pause', () => this.setPlayingState(false));
        this.on('ended', () => this.setPlayingState(false));
        this.on('current', (d) => this.handleCurrentChange(d.item));

        this.on('listeners-changed', (d) => {
            if (d.name === 'back' && this.topBarRefs) refreshBackButton(this.topBarRefs, this.player);
        });

        // mediaReady: refresh chapters + duration, then sync all track lists
        // (subtitles / audio / quality) that may have changed with the new source.
        this.on('mediaReady', () => {
            this.refreshChaptersAndDuration();
            this.syncActiveIndexes();
            this.applySubsIcon();
            this.applyQualityIcon();
            this.refreshCapabilityVisibility();
            this.repaintSubsIfOpen();
            this.repaintAudioIfOpen();
            this.repaintQualityIfOpen();
        });

        this.on('chapters', () => {
            this.renderChapterMarkers();
            this.refreshCapabilityVisibility();
        });

        this.on('duration', (d) => this.applyDuration(d.duration));
        this.on('time', (d) => this.applyTime(d.time));

        this.on('volume', (d) => {
            const level = typeof d?.level === 'number' ? d.level : this.player.volume?.() ?? 1;
            this.applyVolume(level);
        });
        this.on('mute', (d) => this.applyMuted(d?.muted ?? this.player.volumeState?.() === 'muted'));

        // 'backend:ratechange' is the correct player-level event — emitted by
        // base-player.ts:playbackRate() and carried on the typed event map.
        this.on('backend:ratechange', (d) => {
            this.applyRate(d.rate);
            this.repaintSpeedIfOpen();
        });

        // v2 emits 'subtitle' (not 'subtitleChanged') with `{ track: idx | null }`.
        this.on('subtitle', (d) => {
            const idx = d.track;
            this.activeSubtitleIdx = (typeof idx === 'number' && idx >= 0) ? idx : -1;
            this.applySubsIcon();
            this.repaintSubsIfOpen();
        });

        // v2 emits 'audioTrack' (not 'audioTrackChanged') with `{ id: idx }`.
        this.on('audioTrack', (d) => {
            this.activeAudioIdx = typeof d.id === 'number' ? d.id : -1;
            this.repaintAudioIfOpen();
        });

        this.onVideo('quality:requested', (d) => {
            this.activeQualityIdx = d.level;
            this._userPickedQuality = d.level !== 'auto';
            this.applyQualityIcon();
            this.repaintQualityIfOpen();
        });

        this.on('level-switched', (d) => {
            if (!this._userPickedQuality) {
                this.activeQualityIdx = 'auto';
            }
            else {
                this.activeQualityIdx = typeof d.level === 'number' ? d.level : this.activeQualityIdx;
            }
            this.repaintQualityIfOpen();
        });

        // Track lists arrive asynchronously after HLS manifest parse — may be
        // empty at mediaReady. Refresh capability visibility when they land.
        this.onVideo('levels', () => { this.refreshCapabilityVisibility(); });
        this.onVideo('audioTracks', () => { this.refreshCapabilityVisibility(); });

        this.onVideo('fullscreen', () => {
            this.applyFullscreen();
        });
        this.onVideo('pip', () => {
            this.applyPipIcon(Boolean(document.pictureInPictureElement));
        });
        this.onVideo('theater', d => {
            this.applyTheaterIcon(d.active);
            this.player.container.classList.toggle('theater', d.active);
        });

        this.onVideo('aspectRatio', d => {
            this.applyAspectRatioIcon(d.value);
            this.repaintAspectRatioIfOpen();
        });

        this.listen(this.centerBtn, 'click', () => { void this.player.togglePlayback(); this.bumpActivity(); });
        this.listen(this.playBtn, 'click', () => { void this.player.togglePlayback(); this.bumpActivity(); });

        this.listen(this.prevBtn, 'click', () => { void this.player.previous?.(); });
        this.listen(this.nextBtn, 'click', () => { void this.player.next?.(); });
        this.listen(this.rewindBtn, 'click', () => { this.player.rewind?.(10); });
        this.listen(this.forwardBtn, 'click', () => { this.player.forward?.(10); });
        this.listen(this.chapBackBtn, 'click', () => this.previousChapter());
        this.listen(this.chapFwdBtn, 'click', () => this.nextChapter());

        this.listen(this.volBtn, 'click', () => { this.player.toggleMute?.(); });
        this.listen(this.volSlider, 'input', () => {
            const v = Number(this.volSlider.value) / 100;
            this.player.volume?.(v);
        });

        this.listen(this.remainingTimeEl, 'click', () => {
            this._showRemaining = !this._showRemaining;
            void Promise.resolve(this.storage.setJSON('showRemaining', this._showRemaining));
            this.applyTime(this.player.currentTime?.() ?? 0);
        });

        this.wireSliderBar();

        this.listen(this.speedBtn, 'click', (e: Event) => { e.stopPropagation(); this.openSubMenu('speed'); });
        this.listen(this.qualityBtn, 'click', (e: Event) => { e.stopPropagation(); this.openSubMenu('quality'); });
        this.listen(this.subsBtn, 'click', (e: Event) => { e.stopPropagation(); this.openSubMenu('subtitles'); });
        this.listen(this.audioBtn, 'click', (e: Event) => { e.stopPropagation(); this.openSubMenu('language'); });
        this.listen(this.playlistBtn, 'click', (e: Event) => { e.stopPropagation(); this.openSubMenu('playlist'); });
        this.listen(this.settingsBtn, 'click', (e: Event) => { e.stopPropagation(); this.openMainMenu(); });

        this.listen(this.aspectRatioBtn, 'click', (e: Event) => { e.stopPropagation(); this.openSubMenu('aspectRatio'); });
        this.listen(this.theaterBtn, 'click', () => { this.player.toggleTheater(); });
        this.listen(this.pipBtn, 'click', () => { this.player.togglePip(); });
        this.listen(this.fsBtn, 'click', () => { this.player.toggleFullscreen(); });

        const videoEl = this.player.videoElement;
        if (videoEl) {
            this.listen(videoEl, 'enterpictureinpicture', () => this.applyPipIcon(true));
            this.listen(videoEl, 'leavepictureinpicture', () => this.applyPipIcon(false));
        }

        this.listen(document, 'click', (e: Event) => {
            if (!this.menuOpen) return;
            const t = e.target as Node;
            if (this.menus.frame.contains(t)) return;
            this.closeAllMenus();
        });

        if (!('pictureInPictureEnabled' in document)) this.pipBtn.hidden = true;
    }

    /** v1 scrub behavior — see desktopUIPlugin.createProgressBar. */
    private wireSliderBar(): void {
        const startScrub = () => {
            if (this.isMouseDown) return;
            this.isMouseDown = true;
            this.isScrubbing = true;
            this.sliderRefs.sliderBar.classList.add('slider-scrubbing');
        };
        this.listen(this.sliderRefs.sliderBar, 'mousedown', startScrub);
        this.listen(this.sliderRefs.sliderBar, 'touchstart', startScrub);

        // Click on bottom bar finalizes the scrub (matches v1 behavior so
        // dragging off the slider before releasing still seeks).
        this.listen(this.bottomBar, 'click', (e: Event) => {
            if (!this.isMouseDown) return;
            this.isMouseDown = false;
            this.isScrubbing = false;
            this.sliderRefs.sliderBar.classList.remove('slider-scrubbing');
            this.sliderRefs.sliderPop.style.setProperty('--visibility', '0');
            const scrub = this.getScrubTime(e);
            this.sliderRefs.sliderNipple.style.left = `${scrub.scrubTime}%`;
            void this.player.currentTime?.(scrub.scrubTimePlayer);
            this.bumpActivity();
        });

        const onMove = (e: Event) => {
            const scrub = this.getScrubTime(e);
            this.sliderRefs.sliderPopText.textContent = fmt(scrub.scrubTimePlayer);
            this.paintSpriteAt(scrub.scrubTimePlayer);

            const popOffsetPct = this.clampPopOffset(scrub.scrubTime);
            this.sliderRefs.sliderPop.style.left = `${popOffsetPct}%`;

            const chapters = this.player.chapters();
            if (chapters.length === 0) {
                this.sliderRefs.sliderHover.style.width = `${scrub.scrubTime}%`;
            } else {
                this.updateChapterHover(scrub.scrubTime);
            }
            this.sliderRefs.chapterText.textContent = this.findChapterTitle(scrub.scrubTimePlayer) ?? '';

            if (!this.isMouseDown) return;
            this.sliderRefs.sliderNipple.style.left = `${scrub.scrubTime}%`;
        };
        this.listen(this.sliderRefs.sliderBar, 'mousemove', onMove);
        this.listen(this.sliderRefs.sliderBar, 'touchmove', onMove);

        this.listen(this.sliderRefs.sliderBar, 'mouseover', (e: Event) => {
            const scrub = this.getScrubTime(e);
            this.sliderRefs.sliderPopText.textContent = fmt(scrub.scrubTimePlayer);
            this.paintSpriteAt(scrub.scrubTimePlayer);
            this.sliderRefs.chapterText.textContent = this.findChapterTitle(scrub.scrubTimePlayer) ?? '';
            this.sliderRefs.sliderPop.style.setProperty('--visibility', '1');
            this.sliderRefs.sliderPop.style.left = `${this.clampPopOffset(scrub.scrubTime)}%`;
        });
        this.listen(this.sliderRefs.sliderBar, 'mouseleave', () => {
            this.sliderRefs.sliderPop.style.setProperty('--visibility', '0');
            this.sliderRefs.sliderHover.style.width = '0';
            for (const ch of this.chapterRefs) ch.hover.style.transform = 'scaleX(0)';
        });
    }

    private getScrubTime(e: Event): { scrubTime: number; scrubTimePlayer: number } {
        const rect = this.sliderRefs.sliderBar.getBoundingClientRect();
        const me = e as MouseEvent;
        const te = e as TouchEvent;
        const x = me.clientX ?? te.touches?.[0]?.clientX ?? te.changedTouches?.[0]?.clientX ?? 0;
        let offsetX = x - rect.left;
        if (offsetX <= 0) offsetX = 0;
        if (offsetX >= rect.width) offsetX = rect.width;
        const dur = this.resolveDuration();
        return {
            scrubTime: rect.width > 0 ? (offsetX / rect.width) * 100 : 0,
            scrubTimePlayer: rect.width > 0 ? (offsetX / rect.width) * dur : 0,
        };
    }

    private clampPopOffset(pct: number): number {
        const popWidthPct = (this.sliderRefs.sliderPop.offsetWidth / Math.max(1, this.sliderRefs.sliderBar.offsetWidth)) * 100;
        const half = popWidthPct / 2;
        return Math.max(half, Math.min(100 - half, pct));
    }

    // ── Initial state, capability gating, helpers ────────────────────
    private applyInitialState(): void {
        this.applyVolume(this.player.volume?.() ?? 1);
        this.applyMuted(this.player.volumeState() === VolumeState.MUTED);
        this.applyRate(this.player.playbackRate?.() ?? 1);
        this.applySubsIcon();
        this.applyQualityIcon();
        this.applyAspectRatioIcon(this.player.aspectRatio?.() ?? 'uniform');
        this.applyPipIcon(Boolean(document.pictureInPictureElement));
        const theaterActive = this.player.theaterState() === TheaterState.ON;
        this.applyTheaterIcon(theaterActive);
        this.player.container.classList.toggle('theater', theaterActive);
        const cur = this.player.current?.();
        if (cur) this.handleCurrentChange(cur);
        const dur = this.player.duration?.();
        if (dur) this.applyDuration(dur);
        this.refreshCapabilityVisibility();
        if (this.topBarRefs) refreshBackButton(this.topBarRefs, this.player);
    }

    private setPlayingState(playing: boolean): void {
        this.centerWrap.classList.toggle('nm-playing', playing);
        const icon = playing ? fluentIcons.pause : fluentIcons.play;
        this.playBtn.innerHTML = svgFromIcon(icon);
        this.centerBtn.innerHTML = svgFromIcon(playing ? fluentIcons.pause : fluentIcons.bigPlay, 32);
        this.playBtn.title = icon.title || (playing ? 'Pause' : 'Play');
        this.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    }

    /**
     * Subscribe to a video-specific player event (`VideoEventMap` key that is
     * not part of `BaseEventMap`). TypeScript's conditional-type inference cannot
     * resolve `PlayerEventMap<NMVideoPlayer<any>>` to `VideoEventMap` inside
     * `Plugin.on()` due to class-complexity limitations, so this helper types the
     * call directly against `VideoEventMap` and registers the same lifecycle
     * cleanup that `Plugin.on()` would.
     */
    private onVideo<K extends keyof VideoEventMap>(
        event: K,
        fn: (data: VideoEventMap[K]) => void,
    ): void {
        this.player.on(event, fn);
        this.lifecycle.addCleanup(() => { this.player.off(event, fn); });
    }

    private handleCurrentChange(item: VideoPlaylistItem | undefined | null): void {
        if (this.topBarRefs) updateTitleBar(this.topBarRefs, item);

        // Reset cached duration so chapter markers are not computed against
        // the previous item's duration while the new media loads.
        this.cachedDuration = 0;
        this.refreshChaptersAndDuration();
        this.refreshCapabilityVisibility();
        this.repaintPlaylistIfOpen();
        void this.loadSpritesForItem(item);
    }

    private async loadSpritesForItem(item: VideoPlaylistItem | undefined | null): Promise<void> {
        const myToken = ++this.spriteLoadId;
        this.spriteSet = null;

        this.sliderRefs.sliderPopImage.style.backgroundImage = '';
        this.sliderRefs.sliderPopImage.style.backgroundPosition = '';
        this.sliderRefs.sliderPopImage.style.width = '';
        this.sliderRefs.sliderPopImage.style.height = '';

        const tracks = readSidecarTracks(item);
        if (!tracks) return;
        const thumbsTrack = tracks.find(t => t?.kind === 'thumbnails' && typeof t.file === 'string');
        if (!thumbsTrack?.file) return;

        const set = await loadSpriteSet(thumbsTrack.file);
        if (myToken !== this.spriteLoadId) return;
        if (!set) return;

        this.spriteSet = set;
        this.sliderRefs.sliderPopImage.style.backgroundImage = `url('${set.spriteUrl}')`;
    }
    
    private paintSpriteAt(time: number): void {
        if (!this.spriteSet) return;
        const cue = lookupCue(this.spriteSet, time);
        if (!cue) return;
        this.sliderRefs.sliderPopImage.style.backgroundPosition = `-${cue.x}px -${cue.y}px`;
        this.sliderRefs.sliderPopImage.style.width = `${cue.w}px`;
        this.sliderRefs.sliderPopImage.style.height = `${cue.h}px`;
    }

    private refreshChaptersAndDuration(): void {
        const dur = this.player.duration?.() ?? 0;
        if (dur) this.applyDuration(dur);
        this.renderChapterMarkers();
    }

    /** Rebuild the segmented chapter-marker DOM for the current item. */
    private renderChapterMarkers(): void {
        const chapters = this.player.chapters();
        const dur = this.resolveDuration();

        if (!dur || chapters.length === 0) {
            this.sliderRefs.sliderBar.classList.remove('has-chapters');
        }
        else {
            this.sliderRefs.sliderBar.classList.add('has-chapters');
        }

        this.chapterRefs = buildChapterMarkers(
            this.sliderRefs.chapterBar,
            chapters,
            dur,
            (index) => { void this.player.seekToChapter?.(index); },
            this.listen.bind(this),
        );
    }

    private updateChapterProgress(percentage: number): void {
        updateChapterProgress(this.chapterRefs, percentage);
    }

    private updateChapterBuffer(bufferedPct: number): void {
        updateChapterBuffer(this.chapterRefs, bufferedPct);
    }

    private updateChapterHover(scrubPct: number): void {
        updateChapterHover(this.chapterRefs, scrubPct);
    }

    private findChapterTitle(time: number): string | undefined {
        return this.player.chapters().find(c => time >= c.start && time <= c.end)?.title;
    }

    private resolveDuration(): number {
        const fromPlayer = this.player.duration?.() ?? 0;
        if (fromPlayer > 0) return fromPlayer;
        if (this.cachedDuration > 0) return this.cachedDuration;
        const el = this.player.videoElement;
        return Number.isFinite(el?.duration) ? (el!.duration ?? 0) : 0;
    }

    private applyTime(t: number): void {
        const dur = this.resolveDuration();
        const pct = dur > 0 ? (t / dur) * 100 : 0;
        if (!this.isScrubbing) {
            this.sliderRefs.sliderProgress.style.width = `${pct}%`;
            this.sliderRefs.sliderNipple.style.left = `${pct}%`;
            this.sliderRefs.sliderBar.setAttribute('aria-valuenow', String(Math.round(pct)));
            this.updateChapterProgress(pct);
        }
        try {
            const buf = this.player.buffered();
            const bufPct = dur > 0 ? (buf / dur) * 100 : 0;
            if (this.chapterRefs.length > 0) {
                this.updateChapterBuffer(bufPct);
            }
            else {
                this.sliderRefs.sliderBuffer.style.width = `${bufPct}%`;
            }
        }
        catch { /* SourceBuffer detach */ }
        this.currentTimeEl.textContent = fmt(t);
        this.remainingTimeEl.textContent = this._formatRemaining(t, dur);
        this.refreshTransportEnablement();
    }

    private applyDuration(dur: number): void {
        this.cachedDuration = dur;
        const cur = this.player.currentTime?.() ?? 0;
        this.currentTimeEl.textContent = fmt(cur);
        this.remainingTimeEl.textContent = this._formatRemaining(cur, dur);
        this.renderChapterMarkers();
    }

    private _formatRemaining(cur: number, dur: number): string {
        if (dur <= 0) return fmt(0);
        if (this._showRemaining) return `-${fmt(Math.max(0, dur - cur))}`;
        return fmt(dur);
    }

    private applyVolume(v: number): void {
        applyVolume(this.volSlider, () => this.applyMutedIcon(), v);

        // Keep the vertical popup input in sync when volume changes externally.
        if (this.volSliderVertical) {
            const vertInput = this.volSliderVertical.querySelector<HTMLInputElement>('.volume-slider-vertical-input');
            if (vertInput) {
                const pct = Math.round(v * 100);
                vertInput.value = String(pct);
                vertInput.style.setProperty('--vol-pct', `${pct}%`);
            }
        }
    }

    private applyMuted(muted: boolean): void {
        applyMuted(this.volBtn, () => this.applyMutedIcon(), muted);
    }

    private applyMutedIcon(): void {
        applyMutedIcon(this.volBtn, this.player);
    }

    private applyRate(rate: number): void {
        applyRate(this.speedBtn, rate);
    }

    private applyQualityIcon(): void {
        applyQualityIcon(this.qualityBtn, this._userPickedQuality);
    }

    private applyFullscreen(): void {
        applyFullscreen(this.fsBtn);
    }

    private applyTheaterIcon(active: boolean): void {
        applyTheaterIcon(this.theaterBtn, active);
    }

    private applySubsIcon(): void {
        applySubsIcon(this.subsBtn, this.activeSubtitleIdx);
    }

    private applyPipIcon(active: boolean): void {
        applyPipIcon(this.pipBtn, active);
    }

    private applyAspectRatioIcon(value: 'uniform' | 'fill' | 'exactfit' | 'none'): void {
        applyAspectRatioIcon(this.aspectRatioBtn, value);
    }

    private refreshCapabilityVisibility(): void {
        const btns = this.opts?.buttons;
        const show = (key: keyof DesktopUiButtonOptions): boolean => buttonVisible(key, btns);

        const subs = this.player.subtitles?.() ?? [];
        const subsCount = subs.length;

        const audios = this.player.audioTracks?.() ?? [];
        const levels = this.player.qualityLevels?.() ?? [];

        this.subsBtn.hidden = !show('subtitles') || subsCount === 0;
        this.audioBtn.hidden = !show('audio') || audios.length <= 1;
        this.qualityBtn.hidden = !show('quality') || levels.length < 2;

        const chapters = this.player.chapters();
        this.chapBackBtn.hidden = !show('chapterPrev') || chapters.length === 0;
        this.chapFwdBtn.hidden = !show('chapterNext') || chapters.length === 0;

        const queueLen = this.safeQueueLength();
        this.playlistBtn.hidden = !show('playlist') || queueLen < 2;

        this.menus.mainButtons.subtitles.style.display = subsCount === 0 ? 'none' : 'flex';
        this.menus.mainButtons.language.style.display = audios.length <= 1 ? 'none' : 'flex';
        this.menus.mainButtons.quality.style.display = levels.length < 2 ? 'none' : 'flex';
        this.menus.mainButtons.playlist.style.display = queueLen < 2 ? 'none' : 'flex';

        this.refreshTransportEnablement();
    }

    private refreshTransportEnablement(): void {
        const idx = this.safeCurrentIndex();
        const len = this.safeQueueLength();

        const onFirst = idx <= 0 || len <= 1;
        const onLast = idx >= len - 1 || len <= 1;
        this.setDisabled(this.prevBtn, onFirst);
        this.setDisabled(this.nextBtn, onLast);

        const t = this.player.currentTime?.() ?? 0;
        const dur = this.resolveDuration();
        this.setDisabled(this.rewindBtn, t <= 0);
        this.setDisabled(this.forwardBtn, dur > 0 && t >= dur - 0.25);

        const chapters = this.player.chapters();
        const hasPrevChap = chapters.some(c => c.start < t - 1);
        const hasNextChap = chapters.some(c => c.start > t + 1);
        this.setDisabled(this.chapBackBtn, !hasPrevChap);
        this.setDisabled(this.chapFwdBtn, !hasNextChap);
    }

    private setDisabled(btn: HTMLButtonElement, disabled: boolean): void {
        if (disabled) {
            btn.setAttribute('disabled', 'true');
            btn.setAttribute('aria-disabled', 'true');
        }
        else {
            btn.removeAttribute('disabled');
            btn.removeAttribute('aria-disabled');
        }
    }

    private safeCurrentIndex(): number {
        try {
            return this.player.currentIndex();
        }
        catch { /* not implemented */ }
        return 0;
    }

    private safeQueueLength(): number {
        try {
            return this.player.queueLength();
        }
        catch { /* not implemented */ }
        return this.player.queue().length;
    }

    private previousChapter(): void {
        const chapters = this.player.chapters();
        const t = this.player.currentTime?.() ?? 0;
        for (let i = chapters.length - 1; i >= 0; i--) {
            if (chapters[i]!.start < t - 1) { void this.player.currentTime?.(chapters[i]!.start); return; }
        }
        void this.player.currentTime?.(0);
    }

    private nextChapter(): void {
        const chapters = this.player.chapters();
        const t = this.player.currentTime?.() ?? 0;
        for (let i = 0; i < chapters.length; i++) {
            if (chapters[i]!.start > t + 1) { void this.player.currentTime?.(chapters[i]!.start); return; }
        }
    }

    // ── Menu state ──────────────────────────────────────────────────
    private openMainMenu(): void {
        this.menuOpen = true;
        this.currentSubMenu = null;
        this.menus.frame.classList.add('open');
        this.menus.content.classList.remove('sub-menu-open');
        for (const pane of Object.values(this.menus.panes)) pane.classList.remove('is-open');
        try { this.menus.frameDialog.show?.(); } catch { /* not supported */ }
    }

    private openSubMenu(id: SubMenuId): void {
        this.menuOpen = true;
        this.currentSubMenu = id;
        this.menus.frame.classList.add('open');
        this.menus.content.classList.add('sub-menu-open');
        for (const [k, pane] of Object.entries(this.menus.panes)) {
            pane.classList.toggle('is-open', k === id);
        }
        this.repaintPane(id);
        try { this.menus.frameDialog.show?.(); } catch { /* not supported */ }
        this.bumpActivity();
    }

    private closeAllMenus(): void {
        this.menuOpen = false;
        this.currentSubMenu = null;
        this.menus.frame.classList.remove('open');
        this.menus.content.classList.remove('sub-menu-open');
        for (const pane of Object.values(this.menus.panes)) pane.classList.remove('is-open');
        try { this.menus.frameDialog.close?.(); } catch { /* already closed */ }
    }
    
    private syncActiveIndexes(): void {
        const audios = this.player.audioTracks?.() ?? [];
        if (audios.length > 0) {
            const defIdx = audios.findIndex(t => t.default === true);
            this.activeAudioIdx = defIdx >= 0 ? defIdx : 0;
        }

        const subState = this.player.subtitleState();
        this.activeSubtitleIdx = subState === 'off' ? -1 : 0;

        if (!this._userPickedQuality) {
            this.activeQualityIdx = this.player.qualityState() === 'auto' ? 'auto' : 0;
        }
    }

    private menuState(): MenuRenderState {
        this.syncActiveIndexes();
        return {
            subtitleIdx: this.activeSubtitleIdx,
            audioIdx: this.activeAudioIdx,
            qualityIdx: this.activeQualityIdx,
        };
    }

    private repaintPane(id: SubMenuId): void {
        const closeOnPick = () => this.closeAllMenus();
        const keepOpenOnPick = (paneId: SubMenuId) => () => this.repaintPane(paneId);
        const listen = this.listen.bind(this);
        const st = this.menuState();
        if (id === 'speed') renderSpeedPane(this.menus.panes.speed, this.player, listen, keepOpenOnPick('speed'));
        if (id === 'quality') renderQualityPane(this.menus.panes.quality, this.player, listen, closeOnPick, st);
        if (id === 'subtitles') renderSubsPane(this.menus.panes.subtitles, this.player, listen, closeOnPick, st);
        if (id === 'language') renderAudioPane(this.menus.panes.language, this.player, listen, closeOnPick, st);
        if (id === 'playlist') {
            renderPlaylistPane(this.menus.panes.playlist, this.player, listen, closeOnPick, {
                imageBaseUrl: this.opts?.imageBaseUrl,
            });
        }
        if (id === 'subtitleSettings') {
            renderSubtitleSettingsPane(this.menus.panes.subtitleSettings, this.player, listen, closeOnPick);
        }
        if (id === 'aspectRatio') {
            renderAspectRatioPane(this.menus.panes.aspectRatio, this.player, listen, keepOpenOnPick('aspectRatio'));
        }
    }

    private repaintSubsIfOpen(): void { if (this.currentSubMenu === 'subtitles') this.repaintPane('subtitles'); }
    private repaintAudioIfOpen(): void { if (this.currentSubMenu === 'language') this.repaintPane('language'); }
    private repaintQualityIfOpen(): void { if (this.currentSubMenu === 'quality') this.repaintPane('quality'); }
    private repaintSpeedIfOpen(): void { if (this.currentSubMenu === 'speed') this.repaintPane('speed'); }
    private repaintPlaylistIfOpen(): void { if (this.currentSubMenu === 'playlist') this.repaintPane('playlist'); }
    private repaintAspectRatioIfOpen(): void { if (this.currentSubMenu === 'aspectRatio') this.repaintPane('aspectRatio'); }

    // ── Activity / auto-hide ────────────────────────────────────────
    private bumpActivity(): void {
        this.player.emit('activity', { active: true });

        if (this.inactivityToken !== null) clearTimeout(this.inactivityToken);
        const ms = this.opts?.inactivityMs ?? 4000;
        this.inactivityToken = this.timeout(() => this.maybeHide(), ms);
    }

    private maybeHide(): void {
        if (!this.player.playState || this.player.playState() !== 'playing') return;
        if (this.menuOpen) return;

        this.player.emit('activity', { active: false });
    }
}

export const desktopUiPlugin = DesktopUiPlugin;
