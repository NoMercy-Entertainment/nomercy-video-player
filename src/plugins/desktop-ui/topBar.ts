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
    tvCurrentItemShow: HTMLDivElement;
    tvCurrentItemEpisode: HTMLDivElement;
    tvCurrentItemTitle: HTMLDivElement;
}


// ── DOM construction ───────────────────────────────────────────────────────────

/** Build the top bar (back/close buttons + show info + title + TV current item) and return named refs. */
export function buildTitleBar(player: NMVideoPlayer<any>, parent: HTMLElement): TopBarRefs {
    const bar = player.createElement('div', 'nmplayer-top-bar')
        .addClasses(['nm-top-bar'])
        .appendTo(parent).get();

    const left = player.createElement('div', 'nmplayer-top-bar-left')
        .addClasses(['nm-top-bar-left'])
        .appendTo(bar).get();

    const backBtn = player.createButton('nmplayer-back-btn', 'Back', () => {
        player.emit('back', undefined);
    });
    player.addClasses(backBtn, ['nm-back-btn']);
    backBtn.innerHTML = svgFromIcon(fluentIcons.back);
    backBtn.hidden = true;
    left.appendChild(backBtn);

    const closeBtn = player.createButton('nmplayer-close-btn', 'Close', () => {
        player.emit('close', undefined);
    });
    player.addClasses(closeBtn, ['nm-close-btn']);
    closeBtn.innerHTML = svgFromIcon(fluentIcons.close);
    closeBtn.hidden = true;
    left.appendChild(closeBtn);

    const right = player.createElement('div', 'nmplayer-top-bar-right')
        .addClasses(['nm-top-bar-right'])
        .appendTo(bar).get();

    const showInfoText = player.createElement('span', 'nmplayer-show-info')
        .addClasses(['nm-show-info'])
        .appendTo(right).get();

    const titleText = player.createElement('span', 'nmplayer-title')
        .addClasses(['nm-title'])
        .appendTo(right).get();

    const tvCurrentItemContainer = player.createElement('div', 'nm-tv-current-item')
        .addClasses(['nm-tv-current-item'])
        .appendTo(right).get();

    const tvCurrentItemShow = player.createElement('div', 'nm-tv-current-item-show')
        .addClasses(['nm-tv-current-item-show'])
        .appendTo(tvCurrentItemContainer).get();

    const tvCurrentItemTitleRow = player.createElement('div', 'nm-tv-current-item-title-row')
        .addClasses(['nm-tv-current-item-title-row'])
        .appendTo(tvCurrentItemContainer).get();

    const tvCurrentItemEpisode = player.createElement('div', 'nm-tv-current-item-episode')
        .addClasses(['nm-tv-current-item-episode'])
        .appendTo(tvCurrentItemTitleRow).get();

    const tvCurrentItemTitle = player.createElement('div', 'nm-tv-current-item-title')
        .addClasses(['nm-tv-current-item-title'])
        .appendTo(tvCurrentItemTitleRow).get();

    return {
        bar,
        titleText,
        showInfoText,
        backBtn,
        closeBtn,
        tvCurrentItemShow,
        tvCurrentItemEpisode,
        tvCurrentItemTitle,
    };
}


// ── Update helpers ─────────────────────────────────────────────────────────────

/** Sync the title bar text content to the current playlist item. */
export function updateTitleBar(refs: TopBarRefs, item: VideoPlaylistItem | undefined | null): void {
    if (!refs.titleText) return;

    refs.titleText.textContent = item?.title ?? '';

    const hasSeries = Boolean(item?.show);
    const hasEpisode = item?.season !== undefined && item?.episode !== undefined;

    if (hasSeries && hasEpisode) {
        const s = String(item!.season).padStart(2, '0');
        const e = String(item!.episode).padStart(2, '0');
        refs.showInfoText.textContent = `${item!.show}  ·  S${s}E${e}`;
    }
    else if (hasSeries) {
        refs.showInfoText.textContent = item!.show!;
    }
    else if (hasEpisode) {
        const s = String(item!.season ?? 0).padStart(2, '0');
        const e = String(item!.episode).padStart(2, '0');
        refs.showInfoText.textContent = `S${s}E${e}`;
    }
    else {
        refs.showInfoText.textContent = '';
    }

    refs.showInfoText.hidden = !refs.showInfoText.textContent;

    updateTvCurrentItem(refs, item);
}

/** Sync the TV corner current-item block to the active playlist item. */
export function updateTvCurrentItem(refs: TopBarRefs, item: VideoPlaylistItem | undefined | null): void {
    refs.tvCurrentItemShow.textContent = item?.show ?? '';

    let episodeLabel = '';
    if (item?.season) episodeLabel += `S${item.season}`;
    if (item?.season && item?.episode) episodeLabel += `:E${item.episode}`;
    refs.tvCurrentItemEpisode.textContent = episodeLabel;

    const rawTitle = item?.title ?? '';
    const showName = item?.show ?? '';
    const strippedTitle = rawTitle.replace(showName, '').trim();
    refs.tvCurrentItemTitle.textContent = strippedTitle ? `"${strippedTitle}"` : '';
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
