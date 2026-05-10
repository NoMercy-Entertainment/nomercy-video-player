/**
 * Top-bar concern — title bar DOM construction, title/show-info update,
 * and back-button refresh logic.
 *
 * Integration: `buildTitleBar()` is called from `DesktopUiPlugin.buildDom()`.
 * It returns `TopBarRefs` which the plugin stores for later updates via
 * `updateTitleBar()` and `refreshBackButton()`.
 */

import type { NMVideoPlayer, VideoPlaylistItem } from '@nomercy-entertainment/nomercy-video-player';

import { fluentIcons, svgFromIcon } from './icons';


// ── Refs ───────────────────────────────────────────────────────────────────────

export interface TopBarRefs {
    bar: HTMLDivElement;
    titleText: HTMLSpanElement;
    showInfoText: HTMLSpanElement;
    backBtn: HTMLButtonElement;
}


// ── DOM construction ───────────────────────────────────────────────────────────

/** Build the top bar (back button + show info + title) and return named refs. */
export function buildTitleBar(player: NMVideoPlayer<any>, parent: HTMLElement): TopBarRefs {
    const bar = player.createElement('div', 'nmplayer-top-bar')
        .addClasses(['nm-top-bar'])
        .appendTo(parent).get() as HTMLDivElement;

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

    const right = player.createElement('div', 'nmplayer-top-bar-right')
        .addClasses(['nm-top-bar-right'])
        .appendTo(bar).get();

    const showInfoText = player.createElement('span', 'nmplayer-show-info')
        .addClasses(['nm-show-info'])
        .appendTo(right).get() as HTMLSpanElement;

    const titleText = player.createElement('span', 'nmplayer-title')
        .addClasses(['nm-title'])
        .appendTo(right).get() as HTMLSpanElement;

    return { bar, titleText, showInfoText, backBtn };
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
}

/** Show or hide the back button based on whether the player has 'back' listeners. */
export function refreshBackButton(refs: TopBarRefs, player: NMVideoPlayer<any>): void {
    if (!refs.backBtn) return;
    refs.backBtn.hidden = !player.hasListeners('back');
}
