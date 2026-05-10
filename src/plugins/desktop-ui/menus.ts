/**
 * Menu DOM builders for the desktop UI plugin.
 *
 * Mirrors the v1 plugin's menu-frame structure div-by-div:
 *
 *   menu-frame-dialog (<dialog>)
 *     └─ menu-wrapper
 *        └─ menu-frame   (.open when any menu is showing)
 *           └─ menu-content   (.sub-menu-open when a sub-menu replaces main)
 *              ├─ main-menu        (back-button list of categories)
 *              └─ sub-menu         (slot that holds one of the sub-menu-content panes)
 *                  ├─ language-menu        (sub-menu-content.is-open when active)
 *                  ├─ subtitle-menu
 *                  ├─ quality-menu
 *                  └─ speed-menu
 *
 * The plugin owns DOM listener cleanup via `this.listen(...)`, so each
 * builder takes a `listen` helper and a small action-callback bag.
 */

import type { NMVideoPlayer } from '@nomercy-entertainment/nomercy-video-player';
import { fluentIcons, svgFromIcon } from './icons';
import {
    colors,
    defaultSubtitleStyles,
    edgeStyles,
    fontFamilies,
    subtitleSettingActions,
    type SubtitleStyle,
} from './buttons';

export type MenuListen = (target: EventTarget, event: string, fn: (e: Event) => void) => void;

export type SubMenuId = 'language' | 'subtitles' | 'quality' | 'speed' | 'playlist' | 'subtitleSettings';

export interface SubtitleTrackLite { id?: string | number; label?: string; language?: string; kind?: string }
export interface AudioTrackLite { id?: string | number; name?: string; language?: string; label?: string; default?: boolean }
export interface QualityLevelLite { id?: string | number; index?: number; height?: number; width?: number; name?: string; label?: string; bitrate?: number }
export interface ChapterLite { index: number; start: number; end: number; title: string }

export interface MenuActions {
    closeMenu: () => void;
    openSubMenu: (id: SubMenuId) => void;
    backToMain: () => void;
}

/** Build the empty `<dialog>` shell + main-menu + sub-menu containers. */
export interface MenuFrameRefs {
    frameDialog: HTMLDialogElement;
    frame: HTMLDivElement;
    content: HTMLDivElement;
    main: HTMLDivElement;
    sub: HTMLDivElement;
    /** A map of sub-menu id → its sub-menu-content pane. The plugin
     *  populates these on demand as data changes. */
    panes: Record<SubMenuId, HTMLDivElement>;
    /** A map of sub-menu id → its corresponding main-menu button.
     *  The plugin toggles `display: none` on these when a category has
     *  no available options. */
    mainButtons: Record<SubMenuId, HTMLButtonElement>;
}

export function buildMenuFrame(
    player: NMVideoPlayer,
    parent: HTMLElement,
    listen: MenuListen,
    actions: MenuActions,
): MenuFrameRefs {
    const frameDialog = player.createElement('dialog', 'menu-frame-dialog')
        .addClasses(['menu-frame-dialog'])
        .appendTo(parent).get() as HTMLDialogElement;
    frameDialog.setAttribute('popover', 'manual');
    frameDialog.setAttribute('role', 'modal');

    const wrapper = player.createElement('div', 'menu-wrapper')
        .addClasses(['menu-wrapper'])
        .appendTo(frameDialog).get();

    const frame = player.createElement('div', 'menu-frame')
        .addClasses(['menu-frame'])
        .appendTo(wrapper).get();

    const content = player.createElement('div', 'menu-content')
        .addClasses(['menu-content'])
        .appendTo(frame).get();

    const main = buildMainMenu(player, content, listen, actions);
    const sub = player.createElement('div', 'sub-menu')
        .addClasses(['sub-menu'])
        .appendTo(content).get();

    const panes: Record<SubMenuId, HTMLDivElement> = {
        language: buildSubMenuPane(player, sub, 'language', 'Audio', listen, actions),
        subtitles: buildSubMenuPane(player, sub, 'subtitles', 'Subtitles', listen, actions),
        quality: buildSubMenuPane(player, sub, 'quality', 'Quality', listen, actions),
        speed: buildSubMenuPane(player, sub, 'speed', 'Speed', listen, actions),
        playlist: buildPlaylistPaneShell(player, sub, listen, actions),
        subtitleSettings: buildSubMenuPane(player, sub, 'subtitleSettings', 'Subtitle Settings', listen, actions),
    };

    return {
        frameDialog,
        frame,
        content,
        main,
        sub,
        panes,
        mainButtons: {
            language: main.querySelector<HTMLButtonElement>('#menu-button-language')!,
            subtitles: main.querySelector<HTMLButtonElement>('#menu-button-subtitles')!,
            quality: main.querySelector<HTMLButtonElement>('#menu-button-quality')!,
            speed: main.querySelector<HTMLButtonElement>('#menu-button-speed')!,
            playlist: main.querySelector<HTMLButtonElement>('#menu-button-playlist')!,
            subtitleSettings: main.querySelector<HTMLButtonElement>('#menu-button-subtitleSettings')!,
        },
    };
}

function buildMainMenu(
    player: NMVideoPlayer,
    parent: HTMLElement,
    listen: MenuListen,
    actions: MenuActions,
): HTMLDivElement {
    const main = player.createElement('div', 'main-menu')
        .addClasses(['main-menu'])
        .appendTo(parent).get();

    // Header (close).
    const header = player.createElement('div', 'menu-header-main')
        .addClasses(['menu-header'])
        .appendTo(main).get();
    const closeBtn = player.createButton('menu-close', 'Close', () => {});
    closeBtn.classList.add('menu-header-close');
    closeBtn.innerHTML = svgFromIcon(fluentIcons.close);
    header.appendChild(closeBtn);
    listen(closeBtn, 'click', (e: Event) => { e.stopPropagation(); actions.closeMenu(); });

    // Category buttons. v1 order: language, subtitles, subtitle settings,
    // quality, speed, playlist.
    const cats: { id: SubMenuId; label: string; iconKey: keyof typeof fluentIcons }[] = [
        { id: 'language', label: 'Audio', iconKey: 'language' },
        { id: 'subtitles', label: 'Subtitles', iconKey: 'subtitles' },
        { id: 'subtitleSettings', label: 'Subtitle Settings', iconKey: 'subtitleSettings' },
        { id: 'quality', label: 'Quality', iconKey: 'quality' },
        { id: 'speed', label: 'Speed', iconKey: 'speed' },
        { id: 'playlist', label: 'Playlist', iconKey: 'playlist' },
    ];
    for (const c of cats) {
        const btn = player.createButton(`menu-button-${c.id}`, c.label, () => {});
        btn.classList.add('language-button');
        btn.innerHTML = `
            <span class="menu-button-icon-left">${svgFromIcon(fluentIcons[c.iconKey])}</span>
            <span class="menu-button-text">${c.label}</span>
            <span class="menu-button-chevron">${svgFromIcon(fluentIcons.chevronR)}</span>
        `;
        main.appendChild(btn);
        listen(btn, 'click', (e: Event) => { e.stopPropagation(); actions.openSubMenu(c.id); });
    }
    return main;
}

/**
 * Build the v1 two-pane playlist shell: a Seasons rail on the left
 * (with its own back/title/close header and an empty scroll container
 * for season buttons) and a wider Episodes rail on the right (with a
 * close-only header and the rich-card episode list).
 *
 * The empty rails are populated by `renderPlaylistPane`. Stays in sync
 * structurally with v1's `createEpisodeMenu`.
 */
function buildPlaylistPaneShell(
    player: NMVideoPlayer,
    parent: HTMLElement,
    listen: MenuListen,
    actions: MenuActions,
): HTMLDivElement {
    const root = player.createElement('div', 'playlist-menu')
        .addClasses(['sub-menu-content', 'playlist-menu'])
        .appendTo(parent).get();

    // Left pane — Seasons rail.
    const seasons = player.createElement('div', 'playlist-seasons-pane')
        .addClasses(['sub-menu-content', 'seasons-pane'])
        .appendTo(root).get();
    {
        const header = player.createElement('div', 'menu-header-seasons')
            .addClasses(['menu-header'])
            .appendTo(seasons).get();
        const back = player.createButton('seasons-back', 'Back', () => {});
        back.classList.add('menu-header-back');
        back.innerHTML = svgFromIcon(fluentIcons.chevronL);
        header.appendChild(back);
        listen(back, 'click', (e: Event) => { e.stopPropagation(); actions.backToMain(); });

        const title = document.createElement('span');
        title.className = 'menu-button-text';
        title.textContent = 'Seasons';
        header.appendChild(title);

        player.createElement('div', 'playlist-seasons-scroll-container')
            .addClasses(['scroll-container', 'playlist-seasons-scroll-container'])
            .appendTo(seasons);
    }

    // Right pane — Episodes / movies rail.
    const episodes = player.createElement('div', 'episode-menu')
        .addClasses(['sub-menu-content', 'episode-menu'])
        .appendTo(root).get();
    {
        const header = player.createElement('div', 'menu-header-episodes')
            .addClasses(['menu-header'])
            .appendTo(episodes).get();
        const close = player.createButton('episodes-close', 'Close', () => {});
        close.classList.add('menu-header-close');
        close.innerHTML = svgFromIcon(fluentIcons.close);
        header.appendChild(close);
        listen(close, 'click', (e: Event) => { e.stopPropagation(); actions.closeMenu(); });

        player.createElement('div', 'playlist-scroll-container')
            .addClasses(['scroll-container', 'playlist-scroll-container'])
            .appendTo(episodes);
    }

    return root;
}

function buildSubMenuPane(
    player: NMVideoPlayer,
    parent: HTMLElement,
    id: SubMenuId,
    title: string,
    listen: MenuListen,
    actions: MenuActions,
): HTMLDivElement {
    const pane = player.createElement('div', `${id}-menu`)
        .addClasses(['sub-menu-content', `${id}-menu`])
        .appendTo(parent).get();

    const header = player.createElement('div', `menu-header-${id}`)
        .addClasses(['menu-header'])
        .appendTo(pane).get();
    const back = player.createButton(`menu-back-${id}`, 'Back', () => {});
    back.classList.add('menu-header-back');
    back.innerHTML = svgFromIcon(fluentIcons.chevronL);
    header.appendChild(back);
    listen(back, 'click', (e: Event) => { e.stopPropagation(); actions.backToMain(); });

    const titleSpan = document.createElement('span');
    titleSpan.className = 'menu-button-text';
    titleSpan.textContent = title;
    header.appendChild(titleSpan);

    const close = player.createButton(`menu-close-${id}`, 'Close', () => {});
    close.classList.add('menu-header-close');
    close.innerHTML = svgFromIcon(fluentIcons.close);
    header.appendChild(close);
    listen(close, 'click', (e: Event) => { e.stopPropagation(); actions.closeMenu(); });

    player.createElement('div', `${id}-scroll-container`)
        .addClasses(['scroll-container', `${id}-scroll-container`])
        .appendTo(pane);
    return pane;
}

// ── Pane content renderers ─────────────────────────────────────────────
// Each renderer wipes the scroll-container of its pane and rebuilds the
// list. Called on initial wire and on every relevant player event change.

export interface MenuRenderState {
    /** Active subtitle index, or -1 / null when subtitles are off. */
    subtitleIdx: number | null;
    /** Active audio track index. -1 = none / default. */
    audioIdx: number;
    /** Active quality level index, or `'auto'` for auto. */
    qualityIdx: number | 'auto';
}

export function renderSpeedPane(
    pane: HTMLDivElement,
    player: NMVideoPlayer,
    listen: MenuListen,
    onPick: () => void,
): void {
    const scroll = pane.querySelector<HTMLDivElement>('.speed-scroll-container');
    if (!scroll) return;
    scroll.replaceChildren();
    const rates = ((player as any).playbackRates?.() ?? [0.5, 0.75, 1, 1.25, 1.5, 2]) as number[];
    const cur = player.playbackRate?.() ?? 1;
    for (const r of rates) {
        const btn = player.createButton(`speed-button-${r}`, `${r}×`, () => {});
        btn.classList.add('language-button');
        if (r === cur) btn.classList.add('is-active');
        btn.innerHTML = `
            <span class="menu-button-text">${r === 1 ? 'Normal' : `${r}×`}</span>
            <span class="menu-button-check">${svgFromIcon(fluentIcons.checkmark, 18)}</span>
        `;
        scroll.appendChild(btn);
        listen(btn, 'click', () => { player.playbackRate?.(r); onPick(); });
    }
}

export function renderQualityPane(
    pane: HTMLDivElement,
    player: NMVideoPlayer,
    listen: MenuListen,
    onPick: () => void,
    state: MenuRenderState,
): void {
    const scroll = pane.querySelector<HTMLDivElement>('.quality-scroll-container');
    if (!scroll) return;
    scroll.replaceChildren();
    const levels = (((player as any).qualityLevels?.() ?? []) as QualityLevelLite[]);
    const auto = state.qualityIdx === 'auto';
    appendChoice(scroll, 'quality-auto', 'Auto', auto, () => { (player as any).currentQuality?.('auto'); onPick(); }, listen, player);
    levels.forEach((q, i) => {
        const label = q.label ?? q.name ?? (q.height ? `${q.height}p` : `Level ${i + 1}`);
        // Use a per-index id so SDR/HDR siblings at the same height don't
        // collide. Suffix with a stable height/bitrate hash for parity
        // with v1's `quality-button-${height}-${bitrate}` convention.
        const id = `quality-${q.height ?? '?'}-${q.bitrate ?? i}`;
        appendChoice(
            scroll,
            id,
            label,
            !auto && state.qualityIdx === i,
            () => { (player as any).currentQuality?.(i); onPick(); },
            listen,
            player,
        );
    });
}

export function renderSubsPane(
    pane: HTMLDivElement,
    player: NMVideoPlayer,
    listen: MenuListen,
    onPick: () => void,
    state: MenuRenderState,
): void {
    const scroll = pane.querySelector<HTMLDivElement>('.subtitles-scroll-container');
    if (!scroll) return;
    scroll.replaceChildren();
    // The kit's `subtitles()` returns the union of HLS-managed and
    // sidecar VTT tracks, so the renderer just consumes one flat list.
    const subs = ((player.subtitles?.() ?? []) as SubtitleTrackLite[]);
    const off = state.subtitleIdx === null || state.subtitleIdx === -1;
    appendChoice(scroll, 'off-button-', 'Off', off, () => { (player as any).currentSubtitle?.(null); onPick(); }, listen, player);
    subs.forEach((s, i) => {
        const langSlug = (s.language ?? String(s.id ?? i)).replace(/\W+/g, '-').toLowerCase();
        const kind = (s.kind ?? 'full').replace(/\W+/g, '-').toLowerCase();
        appendChoice(
            scroll,
            `${kind}-button-${langSlug}`,
            s.label ?? s.language ?? `Track ${i + 1}`,
            !off && state.subtitleIdx === i,
            () => { (player as any).currentSubtitle?.(i); onPick(); },
            listen,
            player,
        );
    });
}

/**
 * Subtitle Settings sub-menu — mirrors v1's `createSubtitleSettingsMenu`.
 * Lists the configurable subtitle properties (Font, Text size, Text
 * color, Text opacity, Edge style, Area color, Area opacity, Background
 * color, Background opacity) plus a Reset row.
 *
 * Each row shows the current value and a chevron — clicking it swaps
 * the pane's body to a property-specific picker (rendered by
 * `renderSubtitlePropertyPane`). The back arrow returns to this list.
 *
 * v2's `NMVideoPlayer` doesn't expose a `subtitleStyle()` API, so we
 * keep the active style in module state and write through to the
 * player only when it does (older v1-style consumers).
 */
const SETTING_ROWS: Array<{ label: string; property: keyof SubtitleStyle | '' }> = [
    { label: 'Font', property: 'fontFamily' },
    { label: 'Text size', property: 'fontSize' },
    { label: 'Text color', property: 'textColor' },
    { label: 'Text opacity', property: 'textOpacity' },
    { label: 'Edge style', property: 'edgeStyle' },
    { label: 'Area color', property: 'backgroundColor' },
    { label: 'Area opacity', property: 'backgroundOpacity' },
    { label: 'Background color', property: 'areaColor' },
    { label: 'Background opacity', property: 'windowOpacity' },
    { label: 'Reset', property: '' },
];

/**
 * Read the active subtitle style straight from the kit. The kit
 * lazily seeds defaults on first read, so consumers never have to
 * worry about an uninitialized state.
 */
function readSubtitleStyle(player: NMVideoPlayer): SubtitleStyle {
    const live = (player as any).subtitleStyle?.();
    if (live && typeof live === 'object') return live as SubtitleStyle;
    return { ...defaultSubtitleStyles };
}

/**
 * Write a partial style patch through the kit; the kit merges it onto
 * the active state and emits `subtitleStyle` so the overlay plugin
 * picks it up.
 */
function writeSubtitleStyle(player: NMVideoPlayer, patch: Partial<SubtitleStyle>): void {
    (player as any).subtitleStyle?.(patch);
}

/**
 * Format a subtitle-style value the same way the v1 plugin does in
 * `createSubtitleSettingMenuButton`:
 *   - fontFamily / edgeStyle  → look up the human-readable `name` in
 *                                fontFamilies / edgeStyles
 *   - {textColor,
 *      backgroundColor,
 *      areaColor}             → look up the title-cased `label` in the
 *                                shared `colors` table (so 'white' →
 *                                'White', 'black' → 'Black', etc.)
 *   - any other number         → append '%' (covers fontSize, textOpacity,
 *                                backgroundOpacity, windowOpacity — all
 *                                percentage scales in v1)
 */
function formatSettingValue(prop: keyof SubtitleStyle, value: unknown): string {
    if (prop === 'fontFamily') return fontFamilies.find(f => f.value === value)?.name ?? String(value);
    if (prop === 'edgeStyle') return edgeStyles.find(e => e.value === value)?.name ?? String(value);
    if (prop === 'textColor' || prop === 'backgroundColor' || prop === 'areaColor') {
        return colors.find(c => c.value === value)?.label ?? toTitleCase(String(value));
    }
    if (typeof value === 'number') return `${value}%`;
    return toTitleCase(String(value));
}

function toTitleCase(s: string): string {
    return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

export function renderSubtitleSettingsPane(
    pane: HTMLDivElement,
    player: NMVideoPlayer,
    listen: MenuListen,
    onPick: () => void,
): void {
    const scroll = pane.querySelector<HTMLDivElement>('.subtitleSettings-scroll-container');
    if (!scroll) return;
    scroll.replaceChildren();

    const style = readSubtitleStyle(player);

    for (const row of SETTING_ROWS) {
        const id = `subtitleSetting-button-${row.label.replace(/\W+/g, '-').toLowerCase()}`;
        const btn = player.createButton(id, row.label, () => {});
        btn.classList.add('language-button');
        const valueText = row.property
            ? formatSettingValue(row.property, style[row.property as keyof SubtitleStyle])
            : '';
        const chevronOrEmpty = row.property
            ? `<span class="menu-button-chevron">${svgFromIcon(fluentIcons.chevronR, 18)}</span>`
            : '';
        btn.innerHTML = `
            <span class="menu-button-text">${escapeHtml(row.label)}</span>
            ${valueText ? `<span class="menu-button-subtext">${escapeHtml(valueText)}</span>` : ''}
            ${chevronOrEmpty}
        `;
        scroll.appendChild(btn);

        listen(btn, 'click', (e: Event) => {
            e.stopPropagation();
            if (row.property) {
                renderSubtitlePropertyPane(pane, player, listen, onPick, row.label, row.property);
            }
            else {
                // Reset writes back the defaults, then repaints the row list
                // so each value reflects the new state.
                writeSubtitleStyle(player, { ...defaultSubtitleStyles });
                renderSubtitleSettingsPane(pane, player, listen, onPick);
            }
        });
    }
}

/**
 * Property-specific picker (Font / Text size / etc.). Replaces the
 * pane's scroll-container content with the available actions for that
 * property; clicking back returns to the main settings list.
 */
function renderSubtitlePropertyPane(
    pane: HTMLDivElement,
    player: NMVideoPlayer,
    listen: MenuListen,
    onPick: () => void,
    label: string,
    property: keyof SubtitleStyle,
): void {
    const header = pane.querySelector<HTMLDivElement>('.menu-header');
    const titleEl = header?.querySelector<HTMLSpanElement>('.menu-button-text');
    if (titleEl) titleEl.textContent = label;
    const back = header?.querySelector<HTMLButtonElement>('.menu-header-back');
    if (back) {
        // Override the back-to-main behavior on this pane to return to
        // the settings rows. Clone-replace the listener so a fresh
        // closure runs even on subsequent clicks.
        const fresh = back.cloneNode(true) as HTMLButtonElement;
        back.replaceWith(fresh);
        listen(fresh, 'click', (e: Event) => {
            e.stopPropagation();
            if (titleEl) titleEl.textContent = 'Subtitle Settings';
            renderSubtitleSettingsPane(pane, player, listen, onPick);
            // Restore the default back-to-main behavior on the next
            // mount of the back button (handled by buildSubMenuPane on
            // next pane open).
        });
    }

    const scroll = pane.querySelector<HTMLDivElement>('.subtitleSettings-scroll-container');
    if (!scroll) return;
    scroll.replaceChildren();

    const actions = subtitleSettingActions(player as any).filter(a => a.property === property);
    const currentValue = readSubtitleStyle(player)[property];

    for (const action of actions) {
        const id = `subtitleSetting-action-${property}-${String(action.value).replace(/\W+/g, '-').toLowerCase()}`;
        const btn = player.createButton(id, action.label, () => {});
        btn.classList.add('language-button');
        const isActive = action.value === currentValue;
        if (isActive) btn.classList.add('is-active');
        btn.innerHTML = `
            <span class="menu-button-text">${escapeHtml(action.label)}</span>
            <span class="menu-button-check">${svgFromIcon(fluentIcons.checkmark, 18)}</span>
        `;
        scroll.appendChild(btn);
        listen(btn, 'click', (e: Event) => {
            e.stopPropagation();
            // Mirror v1's subtitleSettingActions: each action calls the
            // player API. We also update our local fallback state and
            // repaint the picker so the checkmark moves.
            try { (action.action as any)?.(); }
            catch { /* tolerate */ }
            writeSubtitleStyle(player, { [property]: action.value } as Partial<SubtitleStyle>);
            renderSubtitlePropertyPane(pane, player, listen, onPick, label, property);
        });
    }
}

interface PlaylistItemLite {
    id?: string | number;
    title?: string;
    description?: string;
    image?: string;
    duration?: number | string;
    season?: number;
    episode?: number;
}

/** Optional image base — pass via `imageBaseUrl` if your playlist items
 *  carry relative TMDB-style paths (e.g. `/w780/abc.jpg`). */
export interface PlaylistRenderOptions {
    imageBaseUrl?: string;
}

/**
 * Playlist sub-menu — mirrors v1's `createEpisodeMenu` rich-card layout.
 *
 * Adaptive layout:
 *   - Flat playlist (no `season` field on any item): the seasons rail is
 *     hidden, the episodes rail fills the full width.
 *   - Seasonal playlist (at least one item carries `season`): the left
 *     rail shows season buttons; clicking a season filters the right rail
 *     to that season's episodes.
 */
export function renderPlaylistPane(
    pane: HTMLDivElement,
    player: NMVideoPlayer,
    listen: MenuListen,
    onPick: () => void,
    opts: PlaylistRenderOptions = {},
): void {
    const queue = (((player as any).queue?.() ?? []) as PlaylistItemLite[]);
    const curIdx = (player as any).currentIndex?.() ?? 0;

    const hasSeason = queue.some(item => typeof item.season === 'number');

    const seasonPane = pane.querySelector<HTMLDivElement>('.seasons-pane');
    const episodePane = pane.querySelector<HTMLDivElement>('.episode-menu');
    const seasonScroll = pane.querySelector<HTMLDivElement>('.playlist-seasons-scroll-container');
    const scroll = pane.querySelector<HTMLDivElement>('.playlist-scroll-container');

    if (!scroll || !episodePane) return;

    if (!hasSeason) {
        if (seasonPane) seasonPane.style.display = 'none';
        episodePane.style.flex = '1';
        scroll.replaceChildren();
        queue.forEach((item, i) => {
            scroll.appendChild(buildPlaylistCard(player, item, i, i === curIdx, listen, onPick, opts));
        });
        return;
    }

    if (seasonPane) seasonPane.style.display = '';
    episodePane.style.flex = '';

    const seasons = Array.from(new Set(queue.map(it => it.season).filter((s): s is number => typeof s === 'number'))).sort((a, b) => a - b);
    const currentItem = queue[curIdx];
    const activeSeason = typeof currentItem?.season === 'number' ? currentItem.season : (seasons[0] ?? 1);

    if (seasonScroll) {
        seasonScroll.replaceChildren();
        for (const sNum of seasons) {
            const btn = player.createButton(`season-button-${sNum}`, `Season ${sNum}`, () => {});
            btn.classList.add('language-button');
            if (sNum === activeSeason) btn.classList.add('is-active');
            btn.innerHTML = `<span class="menu-button-text">Season ${sNum}</span>`;
            seasonScroll.appendChild(btn);
            listen(btn, 'click', () => {
                renderSeasonEpisodes(scroll, player, queue, sNum, curIdx, listen, onPick, opts);
                for (const b of Array.from(seasonScroll.querySelectorAll('.language-button'))) {
                    b.classList.remove('is-active');
                }
                btn.classList.add('is-active');
            });
        }
    }

    renderSeasonEpisodes(scroll, player, queue, activeSeason, curIdx, listen, onPick, opts);
}

function renderSeasonEpisodes(
    scroll: HTMLDivElement,
    player: NMVideoPlayer,
    queue: PlaylistItemLite[],
    season: number,
    curIdx: number,
    listen: MenuListen,
    onPick: () => void,
    opts: PlaylistRenderOptions,
): void {
    scroll.replaceChildren();
    queue.forEach((item, i) => {
        if (item.season !== season) return;
        scroll.appendChild(buildPlaylistCard(player, item, i, i === curIdx, listen, onPick, opts));
    });
}

function buildPlaylistCard(
    player: NMVideoPlayer,
    item: PlaylistItemLite,
    index: number,
    active: boolean,
    listen: MenuListen,
    onPick: () => void,
    opts: PlaylistRenderOptions,
): HTMLButtonElement {
    const safe = String(item.id ?? index).replace(/\W+/g, '-').toLowerCase();
    const btn = player.createButton(`playlist-${safe}`, item.title ?? `Item ${index + 1}`, () => {});
    btn.classList.add('playlist-menu-button');
    if (active) btn.classList.add('is-active');

    const left = document.createElement('div');
    left.className = 'episode-menu-button-left';
    btn.appendChild(left);

    if (item.image) {
        const img = document.createElement('img');
        img.className = 'episode-menu-button-image';
        img.loading = 'lazy';
        img.alt = '';
        const isAbs = /^https?:\/\//i.test(item.image);
        img.src = isAbs ? item.image : `${opts.imageBaseUrl ?? ''}${item.image}`;
        // Hide on load failure rather than showing a broken-image icon.
        img.addEventListener('error', () => { img.style.display = 'none'; });
        left.appendChild(img);
    }

    const shadow = document.createElement('div');
    shadow.className = 'episode-menu-button-shadow';
    left.appendChild(shadow);

    const progressContainer = document.createElement('div');
    progressContainer.className = 'episode-menu-progress-container';
    const progressBox = document.createElement('div');
    progressBox.className = 'episode-menu-progress-box';
    const epLabel = document.createElement('div');
    epLabel.className = 'progress-item-text';
    if (typeof item.season === 'number' && typeof item.episode === 'number') {
        epLabel.innerText = `S${item.season}: E${item.episode}`;
    }
    else if (typeof item.episode === 'number') {
        epLabel.innerText = `E${item.episode}`;
    }
    progressBox.appendChild(epLabel);
    const durLabel = document.createElement('div');
    durLabel.className = 'progress-duration';
    durLabel.innerText = formatDuration(item.duration);
    progressBox.appendChild(durLabel);
    progressContainer.appendChild(progressBox);

    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'slider-container';
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    sliderContainer.appendChild(progressBar);
    progressContainer.appendChild(sliderContainer);
    left.appendChild(progressContainer);

    const right = document.createElement('div');
    right.className = 'playlist-card-right';
    const title = document.createElement('span');
    title.className = 'playlist-menu-button-title';
    title.innerText = item.title ?? `Item ${index + 1}`;
    right.appendChild(title);
    if (item.description) {
        const overview = document.createElement('span');
        overview.className = 'playlist-menu-button-overview';
        overview.innerText = item.description;
        right.appendChild(overview);
    }
    btn.appendChild(right);

    listen(btn, 'click', () => {
        const target = item.id ?? index;
        (player as any).current?.(target);
        onPick();
    });

    return btn;
}

function formatDuration(d: number | string | undefined): string {
    if (d == null) return '';
    if (typeof d === 'string') return d.replace(/^00:/u, '');
    if (!Number.isFinite(d) || d <= 0) return '';
    const h = Math.floor(d / 3600);
    const m = Math.floor((d % 3600) / 60);
    const s = Math.floor(d % 60);
    return h > 0
        ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
        : `${m}:${s.toString().padStart(2, '0')}`;
}

export function renderAudioPane(
    pane: HTMLDivElement,
    player: NMVideoPlayer,
    listen: MenuListen,
    onPick: () => void,
    state: MenuRenderState,
): void {
    const scroll = pane.querySelector<HTMLDivElement>('.language-scroll-container');
    if (!scroll) return;
    scroll.replaceChildren();
    const tracks = ((player.audioTracks?.() ?? []) as AudioTrackLite[]);
    tracks.forEach((t, i) => {
        const langSlug = (t.language ?? String(t.id ?? i)).replace(/\W+/g, '-').toLowerCase();
        appendChoice(
            scroll,
            `audio-button-${langSlug}-${i}`,
            t.name ?? t.label ?? t.language ?? `Track ${i + 1}`,
            state.audioIdx === i,
            () => { (player as any).currentAudioTrack?.(i); onPick(); },
            listen,
            player,
        );
    });
}

function appendChoice(
    scroll: HTMLDivElement,
    id: string,
    label: string,
    active: boolean,
    onClick: () => void,
    listen: MenuListen,
    player: NMVideoPlayer,
): void {
    const btn = player.createButton(id, label, () => {});
    btn.classList.add('language-button');
    if (active) btn.classList.add('is-active');
    btn.innerHTML = `
        <span class="menu-button-text">${escapeHtml(label)}</span>
        <span class="menu-button-check">${svgFromIcon(fluentIcons.checkmark, 18)}</span>
    `;
    scroll.appendChild(btn);
    listen(btn, 'click', () => onClick());
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
