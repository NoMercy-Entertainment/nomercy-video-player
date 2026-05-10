/**
 * Desktop UI overlay plugin — v2-native rewrite of the v1 examples plugin.
 *
 * The DOM tree mirrors the v1 implementation div-by-div:
 *
 *   overlay
 *     ├─ nm-top-bar > nm-title
 *     ├─ nm-center > nm-spinner + nm-center-btn
 *     ├─ bottom-bar
 *     │   ├─ bottom-bar-shadow            (gradient backdrop)
 *     │   ├─ top-row                      (slider only)
 *     │   │   └─ slider-bar
 *     │   │       ├─ slider-buffer
 *     │   │       ├─ slider-hover
 *     │   │       ├─ slider-progress
 *     │   │       ├─ chapter-progress     (segmented chapter-markers)
 *     │   │       ├─ slider-nipple
 *     │   │       └─ slider-pop > slider-pop-image + slider-pop-text + chapter-text
 *     │   └─ bottom-row                   (transport buttons + times + settings)
 *     │       ├─ playback / previous / seek-back / seek-forward
 *     │       ├─ chapter-back / chapter-forward / next
 *     │       ├─ volume-container > volume-button + volume-slider
 *     │       ├─ current-time + divider + remaining-time
 *     │       └─ theater / pip / speed / subs / audio / quality / fullscreen
 *     └─ menu-frame-dialog (popover modal with main-menu + sub-menu panes)
 */

import { Plugin } from '@nomercy-entertainment/nomercy-player-core';
import type { NMVideoPlayer, VideoEventMap, VideoPlaylistItem } from '@nomercy-entertainment/nomercy-video-player';

import { fluentIcons, svgFromIcon } from './icons';
import { ensureDesktopUiStyles } from './styles';
import { loadSpriteSet, lookupCue, type SpriteSet } from './sprite';
import {
    buildMenuFrame,
    renderAudioPane,
    renderPlaylistPane,
    renderQualityPane,
    renderSpeedPane,
    renderSubsPane,
    renderSubtitleSettingsPane,
    type AudioTrackLite,
    type ChapterLite,
    type MenuFrameRefs,
    type MenuRenderState,
    type QualityLevelLite,
    type SubMenuId,
    type SubtitleTrackLite,
} from './menus';

export interface DesktopUiOptions {
    hideTitle?: boolean;
    disableClickToPause?: boolean;
    inactivityMs?: number;
    imageBaseUrl?: string;
}

function fmt(s: number): string {
    if (!Number.isFinite(s) || s < 0) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0
        ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
        : `${m}:${sec.toString().padStart(2, '0')}`;
}

interface ChapterMarkerRef {
    /** Chapter range, as percentages of total duration. */
    left: number;
    right: number;
    hover: HTMLDivElement;
    progress: HTMLDivElement;
}

export class DesktopUiPlugin extends Plugin<NMVideoPlayer<any>, DesktopUiOptions> {
    static override readonly id: string = 'desktop-ui';
    static override readonly version: string = '2.0.0';
    static override readonly description: string = 'Official desktop UI overlay (v2 rewrite)';

    private titleBar!: HTMLDivElement;
    private titleText!: HTMLSpanElement;
    private centerWrap!: HTMLDivElement;
    private centerBtn!: HTMLButtonElement;
    private spinner!: HTMLDivElement;

    private bottomBar!: HTMLDivElement;
    private topRow!: HTMLDivElement;
    private bottomRow!: HTMLDivElement;

    // ── slider-bar tree (v1) ────────────────────────────────────────
    private sliderBar!: HTMLDivElement;
    private sliderBuffer!: HTMLDivElement;
    private sliderHover!: HTMLDivElement;
    private sliderProgress!: HTMLDivElement;
    private chapterBar!: HTMLDivElement;
    private sliderNipple!: HTMLDivElement;
    private sliderPop!: HTMLDivElement;
    private sliderPopImage!: HTMLDivElement;
    private sliderPopText!: HTMLDivElement;
    private chapterText!: HTMLDivElement;
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
    private currentTimeEl!: HTMLDivElement;
    private remainingTimeEl!: HTMLDivElement;
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

    private inactivityToken: number | null = null;
    private cachedDuration = 0;

    override use(): void {
        ensureDesktopUiStyles();
        this.buildDom();
        this.wireEvents();
        this.applyInitialState();
        this.bumpActivity();
    }

    // ── DOM construction ─────────────────────────────────────────────────
    private buildDom(): void {
        const root = this.mount('overlay');
        this.player.addClasses(root, ['nmplayer-desktop-ui-overlay']);

        this.player.container.classList.add('nomercyplayer');

        if (!this.opts?.hideTitle) this.titleBar = this.buildTitleBar(root);
        this.centerWrap = this.buildCenter(root);
        this.bottomBar = this.buildBottomBar(root);

        this.menus = buildMenuFrame(this.player, root, this.listen.bind(this), {
            closeMenu: () => this.closeAllMenus(),
            openSubMenu: (id) => this.openSubMenu(id),
            backToMain: () => this.openMainMenu(),
        });
    }

    private buildTitleBar(parent: HTMLElement): HTMLDivElement {
        const bar = this.player.createElement('div', 'nmplayer-top-bar')
            .addClasses(['nm-top-bar'])
            .appendTo(parent).get();
        this.titleText = this.player.createElement('span', 'nmplayer-title')
            .addClasses(['nm-title'])
            .appendTo(bar).get();
        return bar;
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
        this.buildSliderBar(this.topRow);

        this.bottomRow = this.player.createElement('div', 'bottom-row')
            .addClasses(['bottom-row'])
            .appendTo(bar).get();
        this.buildBottomRow(this.bottomRow);

        return bar;
    }

    private buildBottomRow(parent: HTMLElement): void {

        this.playBtn = this.iconBtn('playback', 'play');
        parent.appendChild(this.playBtn);
        this.prevBtn = this.iconBtn('previous', 'previous');
        parent.appendChild(this.prevBtn);
        this.rewindBtn = this.iconBtn('seek-back', 'seekBack');
        parent.appendChild(this.rewindBtn);
        this.forwardBtn = this.iconBtn('seek-forward', 'seekForward');
        parent.appendChild(this.forwardBtn);
        this.chapBackBtn = this.iconBtn('chapter-back', 'chapterBack');
        parent.appendChild(this.chapBackBtn);
        this.chapFwdBtn = this.iconBtn('chapter-forward', 'chapterForward');
        parent.appendChild(this.chapFwdBtn);
        this.nextBtn = this.iconBtn('next', 'next');
        parent.appendChild(this.nextBtn);

        // Volume container (button + collapsible slider).
        const volContainer = this.player.createElement('div', 'volume-container')
            .addClasses(['volume-container'])
            .appendTo(parent).get();
        this.volBtn = this.iconBtn('volume', 'volumeHigh');
        volContainer.appendChild(this.volBtn);
        this.volSlider = this.player.createElement('input', 'volume-slider')
            .addClasses(['volume-slider'])
            .appendTo(volContainer).get() as HTMLInputElement;
        this.volSlider.type = 'range';
        this.volSlider.min = '0';
        this.volSlider.max = '100';
        this.volSlider.value = '100';
        this.volSlider.setAttribute('aria-label', 'Volume');

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

        this.theaterBtn = this.iconBtn('theater', 'theater');
        parent.appendChild(this.theaterBtn);
        this.pipBtn = this.iconBtn('pip', 'pipEnter');
        parent.appendChild(this.pipBtn);
        this.speedBtn = this.iconBtn('speed', 'speed');
        parent.appendChild(this.speedBtn);
        this.subsBtn = this.iconBtn('subtitles', 'subtitles');
        parent.appendChild(this.subsBtn);
        this.audioBtn = this.iconBtn('audio', 'language');
        parent.appendChild(this.audioBtn);
        this.qualityBtn = this.iconBtn('quality', 'quality');
        parent.appendChild(this.qualityBtn);
        this.playlistBtn = this.iconBtn('playlist', 'playlist');
        parent.appendChild(this.playlistBtn);
        this.settingsBtn = this.iconBtn('settings', 'settings');
        parent.appendChild(this.settingsBtn);
        this.fsBtn = this.iconBtn('fullscreen', 'fullscreen');
        parent.appendChild(this.fsBtn);
    }

    /** v1 progress strip — a verbatim port of `createProgressBar()`. */
    private buildSliderBar(parent: HTMLElement): void {
        this.sliderBar = this.player.createElement('div', 'slider-bar')
            .addClasses(['slider-bar'])
            .appendTo(parent).get();
        this.sliderBar.setAttribute('role', 'slider');
        this.sliderBar.setAttribute('aria-label', 'Seek');
        this.sliderBar.setAttribute('aria-valuemin', '0');
        this.sliderBar.setAttribute('aria-valuemax', '100');
        this.sliderBar.setAttribute('aria-valuenow', '0');

        this.sliderBuffer = this.player.createElement('div', 'slider-buffer')
            .addClasses(['slider-buffer'])
            .appendTo(this.sliderBar).get();
        this.sliderHover = this.player.createElement('div', 'slider-hover')
            .addClasses(['slider-hover'])
            .appendTo(this.sliderBar).get();
        this.sliderProgress = this.player.createElement('div', 'slider-progress')
            .addClasses(['slider-progress'])
            .appendTo(this.sliderBar).get();
        this.chapterBar = this.player.createElement('div', 'chapter-progress')
            .addClasses(['chapter-bar'])
            .appendTo(this.sliderBar).get();

        this.sliderNipple = this.player.createElement('div', 'slider-nipple')
            .addClasses(['slider-nipple'])
            .appendTo(this.sliderBar).get();

        this.sliderPop = this.player.createElement('div', 'slider-pop')
            .addClasses(['slider-pop'])
            .appendTo(this.sliderBar).get();
        this.sliderPop.style.setProperty('--visibility', '0');
        this.sliderPopImage = this.player.createElement('div', 'slider-pop-image')
            .addClasses(['slider-pop-image'])
            .appendTo(this.sliderPop).get();
        this.sliderPopText = this.player.createElement('div', 'slider-text')
            .addClasses(['slider-pop-text'])
            .appendTo(this.sliderPop).get();
        this.chapterText = this.player.createElement('div', 'chapter-text')
            .addClasses(['chapter-text'])
            .appendTo(this.sliderPop).get();
    }

    private iconBtn(id: string, iconName: string): HTMLButtonElement {
        const icon = fluentIcons[iconName];
        const btn = this.player.createButton(id, icon.title || iconName, () => {});
        this.player.addClasses(btn, ['nm-btn']);
        btn.innerHTML = svgFromIcon(icon);
        return btn;
    }

    // ── Event wiring ─────────────────────────────────────────────────────
    private wireEvents(): void {
        const container = this.player.container;
        if (container) {
            this.listen(container, 'mousemove', () => this.bumpActivity());
            this.listen(container, 'mousedown', () => this.bumpActivity());
            this.listen(container, 'pointerdown', () => this.bumpActivity());
            this.listen(container, 'keydown', () => this.bumpActivity());
            this.listen(container, 'mouseleave', () => this.maybeHide());
            this.listen(container, 'click', (e: Event) => {
                this.bumpActivity();
                const target = e.target as HTMLElement;
                if (target.tagName === 'VIDEO' && !this.opts?.disableClickToPause) {
                    void this.player.togglePlayback();
                }
            });
        }

        this.on('play', () => this.setPlayingState(true));
        this.on('pause', () => this.setPlayingState(false));
        this.on('ended', () => this.setPlayingState(false));
        this.on('current', (d) => this.handleCurrentChange(d.item));

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

        // HLS backend bridge fires 'level-switched' with the selected level index.
        this.on('level-switched', (d) => {
            const isAuto = this.player.qualityState() === 'auto';
            this.activeQualityIdx = isAuto ? 'auto' : (typeof d.level === 'number' ? d.level : 'auto');
            this.applyQualityIcon();
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

        this.wireSliderBar();

        this.listen(this.speedBtn, 'click', (e: Event) => { e.stopPropagation(); this.openSubMenu('speed'); });
        this.listen(this.qualityBtn, 'click', (e: Event) => { e.stopPropagation(); this.openSubMenu('quality'); });
        this.listen(this.subsBtn, 'click', (e: Event) => { e.stopPropagation(); this.openSubMenu('subtitles'); });
        this.listen(this.audioBtn, 'click', (e: Event) => { e.stopPropagation(); this.openSubMenu('language'); });
        this.listen(this.playlistBtn, 'click', (e: Event) => { e.stopPropagation(); this.openSubMenu('playlist'); });
        this.listen(this.settingsBtn, 'click', (e: Event) => { e.stopPropagation(); this.openMainMenu(); });

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
            this.sliderBar.classList.add('slider-scrubbing');
        };
        this.listen(this.sliderBar, 'mousedown', startScrub);
        this.listen(this.sliderBar, 'touchstart', startScrub);

        // Click on bottom bar finalizes the scrub (matches v1 behavior so
        // dragging off the slider before releasing still seeks).
        this.listen(this.bottomBar, 'click', (e: Event) => {
            if (!this.isMouseDown) return;
            this.isMouseDown = false;
            this.isScrubbing = false;
            this.sliderBar.classList.remove('slider-scrubbing');
            this.sliderPop.style.setProperty('--visibility', '0');
            const scrub = this.getScrubTime(e);
            this.sliderNipple.style.left = `${scrub.scrubTime}%`;
            void this.player.currentTime?.(scrub.scrubTimePlayer);
            this.bumpActivity();
        });

        const onMove = (e: Event) => {
            const scrub = this.getScrubTime(e);
            this.sliderPopText.textContent = fmt(scrub.scrubTimePlayer);
            this.paintSpriteAt(scrub.scrubTimePlayer);

            const popOffsetPct = this.clampPopOffset(scrub.scrubTime);
            this.sliderPop.style.left = `${popOffsetPct}%`;

            const chapters = this.getChapters();
            if (chapters.length === 0) {
                this.sliderHover.style.width = `${scrub.scrubTime}%`;
            } else {
                this.updateChapterHover(scrub.scrubTime);
            }
            this.chapterText.textContent = this.findChapterTitle(scrub.scrubTimePlayer) ?? '';

            if (!this.isMouseDown) return;
            this.sliderNipple.style.left = `${scrub.scrubTime}%`;
        };
        this.listen(this.sliderBar, 'mousemove', onMove);
        this.listen(this.sliderBar, 'touchmove', onMove);

        this.listen(this.sliderBar, 'mouseover', (e: Event) => {
            const scrub = this.getScrubTime(e);
            this.sliderPopText.textContent = fmt(scrub.scrubTimePlayer);
            this.paintSpriteAt(scrub.scrubTimePlayer);
            this.chapterText.textContent = this.findChapterTitle(scrub.scrubTimePlayer) ?? '';
            this.sliderPop.style.setProperty('--visibility', '1');
            this.sliderPop.style.left = `${this.clampPopOffset(scrub.scrubTime)}%`;
        });
        this.listen(this.sliderBar, 'mouseleave', () => {
            this.sliderPop.style.setProperty('--visibility', '0');
            this.sliderHover.style.width = '0';
            for (const ch of this.chapterRefs) ch.hover.style.transform = 'scaleX(0)';
        });
    }

    private getScrubTime(e: Event): { scrubTime: number; scrubTimePlayer: number } {
        const rect = this.sliderBar.getBoundingClientRect();
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
        const popWidthPct = (this.sliderPop.offsetWidth / Math.max(1, this.sliderBar.offsetWidth)) * 100;
        const half = popWidthPct / 2;
        return Math.max(half, Math.min(100 - half, pct));
    }

    // ── Initial state, capability gating, helpers ────────────────────
    private applyInitialState(): void {
        this.applyVolume(this.player.volume?.() ?? 1);
        this.applyMuted((this.player as any).volumeState?.() === 'muted');
        this.applyRate(this.player.playbackRate?.() ?? 1);
        this.applySubsIcon();
        this.applyQualityIcon();
        this.applyPipIcon(Boolean((document as any).pictureInPictureElement));
        const cur = this.player.current?.();
        if (cur) this.handleCurrentChange(cur);
        const dur = this.player.duration?.();
        if (dur) this.applyDuration(dur);
        this.refreshCapabilityVisibility();
    }

    private setPlayingState(playing: boolean): void {
        this.centerWrap.classList.toggle('nm-playing', playing);
        const icon = playing ? fluentIcons.pause : fluentIcons.play;
        this.playBtn.innerHTML = svgFromIcon(icon);
        this.centerBtn.innerHTML = svgFromIcon(playing ? fluentIcons.pause : fluentIcons.bigPlay, 32);
        this.playBtn.title = icon.title || (playing ? 'Pause' : 'Play');
        this.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
        this.bumpActivity();
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
        if (this.titleText) this.titleText.textContent = item?.title ?? '';
        this.refreshChaptersAndDuration();
        this.refreshCapabilityVisibility();
        this.repaintPlaylistIfOpen();
        void this.loadSpritesForItem(item);
    }

    private async loadSpritesForItem(item: VideoPlaylistItem | undefined | null): Promise<void> {
        const myToken = ++this.spriteLoadId;
        this.spriteSet = null;
        
        this.sliderPopImage.style.backgroundImage = '';
        this.sliderPopImage.style.backgroundPosition = '';
        this.sliderPopImage.style.width = '';
        this.sliderPopImage.style.height = '';

        const tracks = (item as any)?.tracks as Array<{ kind?: string; file?: string }> | undefined;
        if (!tracks) return;
        const thumbsTrack = tracks.find(t => t?.kind === 'thumbnails' && typeof t.file === 'string');
        if (!thumbsTrack?.file) return;

        const set = await loadSpriteSet(thumbsTrack.file);
        if (myToken !== this.spriteLoadId) return; // a newer item took over
        if (!set) return;

        this.spriteSet = set;
        this.sliderPopImage.style.backgroundImage = `url('${set.spriteUrl}')`;
    }
    
    private paintSpriteAt(time: number): void {
        if (!this.spriteSet) return;
        const cue = lookupCue(this.spriteSet, time);
        if (!cue) return;
        this.sliderPopImage.style.backgroundPosition = `-${cue.x}px -${cue.y}px`;
        this.sliderPopImage.style.width = `${cue.w}px`;
        this.sliderPopImage.style.height = `${cue.h}px`;
    }

    private refreshChaptersAndDuration(): void {
        const dur = this.player.duration?.() ?? 0;
        if (dur) this.applyDuration(dur);
        this.renderChapterMarkers();
    }

    /** Build segmented chapter-marker DOM, mirroring v1's createChapterMarker. */
    private renderChapterMarkers(): void {
        const chapters = this.getChapters();
        const dur = this.resolveDuration();
        this.chapterBar.replaceChildren();
        this.chapterRefs = [];

        if (!dur || chapters.length === 0) {
            this.sliderBar.classList.remove('has-chapters');
            return;
        }
        this.sliderBar.classList.add('has-chapters');

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
            const hover = document.createElement('div');
            hover.className = 'chapter-marker-hover';
            const progress = document.createElement('div');
            progress.className = 'chapter-marker-progress';

            marker.append(bg, hover, progress);
            this.chapterBar.appendChild(marker);

            this.listen(marker, 'click', (e: Event) => {
                e.stopPropagation();
                void this.player.seekToChapter?.(ch.index);
            });

            this.chapterRefs.push({ left, right, hover, progress });
        }
    }

    private updateChapterProgress(percentage: number): void {
        for (const m of this.chapterRefs) {
            if (percentage < m.left) m.progress.style.transform = 'scaleX(0)';
            else if (percentage > m.right) m.progress.style.transform = 'scaleX(1)';
            else {
                const span = Math.max(0.0001, m.right - m.left);
                m.progress.style.transform = `scaleX(${(percentage - m.left) / span})`;
            }
        }
    }

    private updateChapterHover(scrubPct: number): void {
        for (const m of this.chapterRefs) {
            if (scrubPct < m.left) m.hover.style.transform = 'scaleX(0)';
            else if (scrubPct > m.right) m.hover.style.transform = 'scaleX(1)';
            else {
                const span = Math.max(0.0001, m.right - m.left);
                m.hover.style.transform = `scaleX(${(scrubPct - m.left) / span})`;
            }
        }
    }

    private getChapters(): ChapterLite[] {
        return ((this.player as any).chapters?.() ?? []) as ChapterLite[];
    }

    private findChapterTitle(time: number): string | undefined {
        const chapters = this.getChapters();
        return chapters.find(c => time >= c.start && time <= c.end)?.title;
    }

    private resolveDuration(): number {
        const fromPlayer = this.player.duration?.() ?? 0;
        if (fromPlayer > 0) return fromPlayer;
        if (this.cachedDuration > 0) return this.cachedDuration;
        const el = (this.player as any).videoElement as HTMLVideoElement | undefined;
        return Number.isFinite(el?.duration) ? (el!.duration ?? 0) : 0;
    }

    private applyTime(t: number): void {
        const dur = this.resolveDuration();
        const pct = dur > 0 ? (t / dur) * 100 : 0;
        if (!this.isScrubbing) {
            this.sliderProgress.style.width = `${pct}%`;
            this.sliderNipple.style.left = `${pct}%`;
            this.sliderBar.setAttribute('aria-valuenow', String(Math.round(pct)));
            this.updateChapterProgress(pct);
        }
        try {
            const buf = (this.player as any).buffered?.() ?? 0;
            this.sliderBuffer.style.width = `${dur > 0 ? (buf / dur) * 100 : 0}%`;
        }
        catch { /* SourceBuffer detach */ }
        this.currentTimeEl.textContent = fmt(t);
        const remaining = Math.max(0, dur - t);
        this.remainingTimeEl.textContent = dur > 0 ? `-${fmt(remaining)}` : fmt(dur);
        this.refreshTransportEnablement();
    }

    private applyDuration(dur: number): void {
        this.cachedDuration = dur;
        const cur = this.player.currentTime?.() ?? 0;
        this.currentTimeEl.textContent = fmt(cur);
        this.remainingTimeEl.textContent = dur > 0 ? `-${fmt(Math.max(0, dur - cur))}` : fmt(dur);
        this.renderChapterMarkers();
    }

    private applyVolume(v: number): void {
        const pct = Math.round((v ?? 1) * 100);
        this.volSlider.value = String(pct);
        this.volSlider.style.setProperty('--vol-pct', `${pct}%`);
        this.applyMutedIcon();
    }

    private applyMuted(muted: boolean): void {
        this.volBtn.classList.toggle('nm-muted', muted);
        this.applyMutedIcon();
    }

    private applyMutedIcon(): void {
        const muted = (this.player as any).volumeState?.() === 'muted';
        const v = this.player.volume?.() ?? 1;
        const icon = muted || v === 0
            ? fluentIcons.volumeMuted
            : v < 0.34
                ? fluentIcons.volumeLow
                : v < 0.67
                    ? fluentIcons.volumeMedium
                    : fluentIcons.volumeHigh;
        this.volBtn.innerHTML = svgFromIcon(icon);
        this.volBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    }

    private applyRate(rate: number): void {
        const icon = rate === 1
            ? fluentIcons.speed
            : { ...fluentIcons.speed, normal: fluentIcons.speed.hover };
        this.speedBtn.innerHTML = svgFromIcon(icon);
        this.speedBtn.setAttribute('aria-label', rate === 1 ? 'Speed (1x)' : `Speed (${rate}x)`);
    }

    private applyQualityIcon(): void {
        const active = this.activeQualityIdx !== 'auto';
        const icon = active
            ? { ...fluentIcons.quality, normal: fluentIcons.quality.hover }
            : fluentIcons.quality;
        this.qualityBtn.innerHTML = svgFromIcon(icon);
        this.qualityBtn.setAttribute('aria-label', active ? 'Quality (manual)' : 'Quality (auto)');
    }

    private applyFullscreen(): void {
        const fs = Boolean(document.fullscreenElement);
        this.fsBtn.innerHTML = svgFromIcon(fs ? fluentIcons.exitFullscreen : fluentIcons.fullscreen);
    }

    /** Toggle subtitles button icon between subtitlesOff (no caption
     *  selected, the default) and subtitles (a track is active). v1
     *  pattern from `createCaptionsButton`. */
    private applySubsIcon(): void {
        const on = this.activeSubtitleIdx !== null && this.activeSubtitleIdx !== -1;
        this.subsBtn.innerHTML = svgFromIcon(on ? fluentIcons.subtitles : fluentIcons.subtitlesOff);
        this.subsBtn.setAttribute('aria-label', on ? 'Subtitles on' : 'Subtitles off');
    }

    private applyPipIcon(active: boolean): void {
        const label = active ? 'Exit picture-in-picture' : 'Picture-in-picture';
        this.pipBtn.innerHTML = svgFromIcon(active ? fluentIcons.pipExit : fluentIcons.pipEnter);
        this.pipBtn.setAttribute('aria-label', label);
        this.pipBtn.title = label;
    }

    private refreshCapabilityVisibility(): void {
        const subs = (this.player.subtitles?.() ?? []) as SubtitleTrackLite[];
        const subsCount = subs.length;

        const audios = (this.player.audioTracks?.() ?? []) as AudioTrackLite[];
        const levels = ((this.player as any).qualityLevels?.() ?? []) as QualityLevelLite[];

        this.subsBtn.hidden = subsCount === 0;
        this.audioBtn.hidden = audios.length === 0;
        this.qualityBtn.hidden = levels.length < 2;
        const chapters = this.getChapters();
        this.chapBackBtn.hidden = chapters.length === 0;
        this.chapFwdBtn.hidden = chapters.length === 0;

        const queueLen = this.safeQueueLength();
        this.playlistBtn.hidden = queueLen < 2;

        this.menus.mainButtons.subtitles.style.display = subsCount === 0 ? 'none' : 'flex';
        this.menus.mainButtons.language.style.display = audios.length === 0 ? 'none' : 'flex';
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

        const chapters = this.getChapters();
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
            const fn = (this.player as any).currentIndex;
            if (typeof fn === 'function') return Number(fn.call(this.player)) || 0;
        }
        catch { /* not implemented */ }
        return 0;
    }

    private safeQueueLength(): number {
        try {
            const fn = (this.player as any).queueLength;
            if (typeof fn === 'function') return Number(fn.call(this.player)) || 0;
        }
        catch { /* not implemented */ }
        const q = (this.player as any).queue?.();
        return Array.isArray(q) ? q.length : 0;
    }

    private previousChapter(): void {
        const chapters = this.getChapters();
        const t = this.player.currentTime?.() ?? 0;
        for (let i = chapters.length - 1; i >= 0; i--) {
            if (chapters[i].start < t - 1) { void this.player.currentTime?.(chapters[i].start); return; }
        }
        void this.player.currentTime?.(0);
    }

    private nextChapter(): void {
        const chapters = this.getChapters();
        const t = this.player.currentTime?.() ?? 0;
        for (let i = 0; i < chapters.length; i++) {
            if (chapters[i].start > t + 1) { void this.player.currentTime?.(chapters[i].start); return; }
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
        const be = (this.player as any).backend?.();
        const hls = be?.hls;

        // Audio
        const audios = (this.player.audioTracks?.() ?? []) as AudioTrackLite[];
        if (audios.length > 0) {
            const hlsAudio = hls?.audioTrack;
            if (typeof hlsAudio === 'number' && hlsAudio >= 0) {
                this.activeAudioIdx = hlsAudio;
            }
            else {
                const defIdx = audios.findIndex((t: any) => t?.default === true);
                this.activeAudioIdx = defIdx >= 0 ? defIdx : 0;
            }
        }

        const hlsHasSubs = (hls?.subtitleTracks?.length ?? 0) > 0;
        if (hlsHasSubs) {
            const subState = (this.player as any).subtitleState?.();
            const hlsSub = hls?.subtitleTrack;
            if (subState === 'off' || subState === 0) {
                this.activeSubtitleIdx = -1;
            }
            else if (typeof hlsSub === 'number') {
                this.activeSubtitleIdx = hlsSub >= 0 ? hlsSub : -1;
            }
        }

        // Quality
        const qState = (this.player as any).qualityState?.();
        if (qState === 'auto' || qState === 0) {
            this.activeQualityIdx = 'auto';
        }
        else if (typeof hls?.currentLevel === 'number') {
            this.activeQualityIdx = hls.currentLevel >= 0 ? hls.currentLevel : 'auto';
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
        const onPick = () => this.closeAllMenus();
        const listen = this.listen.bind(this);
        const st = this.menuState();
        if (id === 'speed') renderSpeedPane(this.menus.panes.speed, this.player, listen, onPick);
        if (id === 'quality') renderQualityPane(this.menus.panes.quality, this.player, listen, onPick, st);
        if (id === 'subtitles') renderSubsPane(this.menus.panes.subtitles, this.player, listen, onPick, st);
        if (id === 'language') renderAudioPane(this.menus.panes.language, this.player, listen, onPick, st);
        if (id === 'playlist') {
            renderPlaylistPane(this.menus.panes.playlist, this.player, listen, onPick, {
                imageBaseUrl: this.opts?.imageBaseUrl,
            });
        }
        if (id === 'subtitleSettings') {
            renderSubtitleSettingsPane(this.menus.panes.subtitleSettings, this.player, listen, onPick);
        }
    }

    private repaintSubsIfOpen(): void { if (this.currentSubMenu === 'subtitles') this.repaintPane('subtitles'); }
    private repaintAudioIfOpen(): void { if (this.currentSubMenu === 'language') this.repaintPane('language'); }
    private repaintQualityIfOpen(): void { if (this.currentSubMenu === 'quality') this.repaintPane('quality'); }
    private repaintSpeedIfOpen(): void { if (this.currentSubMenu === 'speed') this.repaintPane('speed'); }
    private repaintPlaylistIfOpen(): void { if (this.currentSubMenu === 'playlist') this.repaintPane('playlist'); }

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
