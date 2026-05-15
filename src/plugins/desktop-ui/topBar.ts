/**
 * Top-bar concern — title bar DOM construction, title/show-info update,
 * and back-button / close-button refresh logic. Also owns the TV current-item
 * info block (show title, episode, episode title) in the top-right corner.
 *
 * Integration: `buildTitleBar()` is called from `DesktopUiPlugin.buildDom()`.
 * It returns `TopBarRefs` which the plugin stores for later updates via
 * `updateTitleBar()`, `refreshBackButton()`, and `refreshCloseButton()`.
 */

import type { NMVideoPlayer, VideoPlaylistItem } from '@nomercy-entertainment/nomercy-video-player';

import { fluentIcons, svgFromIcon } from './icons';


// ── Refs ───────────────────────────────────────────────────────────────────────

export interface TopBarRefs {
    bar: HTMLDivElement;
    titleText: HTMLSpanElement;
    showInfoText: HTMLSpanElement;
    backBtn: HTMLButtonElement;
    closeBtn: HTMLButtonElement;
}


// ── DOM construction ───────────────────────────────────────────────────────────

/** Build the top bar (back/close buttons + show info + title + TV current item) and return named refs. */
export function buildTitleBar(player: NMVideoPlayer<any>, parent: HTMLElement): TopBarRefs {
    const bar = player.createElement('div', 'top-bar')
        .addClasses(['top-bar'])
        .appendTo(parent).get();

    const left = player.createElement('div', 'top-bar-left')
        .addClasses(['top-bar-left'])
        .appendTo(bar).get();

    const backBtn = player.createButton('back-btn', 'Back', () => {
        player.emit('back', undefined);
    });
    player.addClasses(backBtn, ['back-btn']);
    backBtn.innerHTML = svgFromIcon(fluentIcons.back);
    backBtn.hidden = true;
    left.appendChild(backBtn);

    const closeBtn = player.createButton('close-btn', 'Close', () => {
        player.emit('close', undefined);
    });
    player.addClasses(closeBtn, ['close-btn']);
    closeBtn.innerHTML = svgFromIcon(fluentIcons.close);
    closeBtn.hidden = true;
    left.appendChild(closeBtn);

    const right = player.createElement('div', 'top-bar-right')
        .addClasses(['top-bar-right'])
        .appendTo(bar).get();

    // Mirrors the Android MobileTopBar two-line layout: primary `title`
    // (show name or movie title) on top, secondary `show-info` (season +
    // episode + episode title) below — only rendered when non-empty.
    const titleText = player.createElement('span', 'title')
        .addClasses(['title'])
        .appendTo(right).get();

    const showInfoText = player.createElement('span', 'show-info')
        .addClasses(['show-info'])
        .appendTo(right).get();

    return {
        bar,
        titleText,
        showInfoText,
        backBtn,
        closeBtn,
    };
}


// ── Update helpers ─────────────────────────────────────────────────────────────

/** Sync the title bar text content to the current playlist item.
 *  Mirrors `MobileTopBar.kt` (Android): primary line is the show name when the
 *  item belongs to a series, otherwise the movie title; secondary line is
 *  `S{n}E{n} • {episodeTitle}` for TV, `Extras E{n} • {episodeTitle}` for
 *  season-0 specials, blank for movies. */
export function updateTitleBar(refs: TopBarRefs, item: VideoPlaylistItem | undefined | null): void {
    if (!refs.titleText) return;

    const show = item?.show?.trim() ?? '';
    const rawTitle = item?.title?.trim() ?? '';
    const hasShow = show.length > 0;
    const hasEpisode = typeof item?.episode === 'number';
    const seasonNum = typeof item?.season === 'number' ? item.season : null;
    const episodeNum = typeof item?.episode === 'number' ? item.episode : null;

    // Primary: show name for series, otherwise the movie/standalone title.
    refs.titleText.textContent = hasShow ? show : rawTitle;

    // Secondary: episode label + episode title (when applicable).
    let secondary = '';
    if (hasShow && hasEpisode) {
        const epTitle = rawTitle && rawTitle !== show ? rawTitle : '';
        if (seasonNum !== null && seasonNum > 0) {
            const label = `S${seasonNum}E${episodeNum}`;
            secondary = epTitle ? `${label} • ${epTitle}` : label;
        }
        else if (seasonNum === 0) {
            const label = `Extras E${episodeNum}`;
            secondary = epTitle ? `${label} • ${epTitle}` : label;
        }
        else {
            const label = `A${episodeNum}`;
            secondary = epTitle ? `${label} • ${epTitle}` : label;
        }
    }

    refs.showInfoText.textContent = secondary;
    refs.showInfoText.hidden = secondary.length === 0;
}

/** Show or hide the back button based on whether the player has 'back' listeners. */
export function refreshBackButton(refs: TopBarRefs, player: NMVideoPlayer<any>): void {
    if (!refs.backBtn) return;
    refs.backBtn.hidden = !player.hasListeners('back');
}

/** Show or hide the close button based on whether the player has 'close' listeners. */
export function refreshCloseButton(refs: TopBarRefs, player: NMVideoPlayer<any>): void {
    if (!refs.closeBtn) return;
    refs.closeBtn.hidden = !player.hasListeners('close');
}
