// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Transport-state mixin — time display, duration, playing state, capability
 * gating, and transport-button enable/disable logic.
 *
 * Owns: setPlayingState, handleCurrentChange, applyTime, applyDuration,
 *       _formatRemaining, applyStateVisibility, setContentHidden,
 *       refreshCapabilityVisibility, refreshTransportEnablement, setDisabled,
 *       safeCurrentIndex, safeQueueLength.
 */

import type { VideoPlaylistItem } from '@nomercy-entertainment/nomercy-video-player';

import type { DesktopUiInternals } from '../internals';

import { fluentIcons, svgFromIcon } from '../data/icons';
import { formatSeconds } from '../helpers/progressBar';
import { applyAllVisibilityRules } from '../helpers/responsive';
import { updateTitleBar } from '../helpers/topBar';

export const transportStateMethods = {
	setPlayingState(this: DesktopUiInternals, playing: boolean): void {
		this.centerWrap.classList.toggle('playing', playing);
		const icon = playing ? fluentIcons.pause : fluentIcons.play;
		const playIconHolder = this.playBtn.querySelector('.btn-icon') ?? this.playBtn;
		playIconHolder.innerHTML = svgFromIcon(icon);
		const centerIconHolder = this.centerBtn.querySelector('.btn-icon') ?? this.centerBtn;
		centerIconHolder.innerHTML = svgFromIcon(playing ? fluentIcons.pause : fluentIcons.bigPlay, 32);
		this.playBtn.setAttribute('aria-label', this.t('tooltip.play'));
	},

	handleCurrentChange(this: DesktopUiInternals, item: VideoPlaylistItem | undefined | null): void {
		if (this.topBarRefs)
			updateTitleBar(this.player, this.topBarRefs, item);

		this.cachedDuration = 0;
		this._menuControlState.playingQualityIdx = null;

		this.refreshChaptersAndDuration();
		this.refreshCapabilityVisibility();

		this.repaintPlaylistIfOpen();
		this.repaintSubsIfOpen();
		this.repaintAudioIfOpen();
		this.repaintQualityIfOpen();

		void this.loadSpritesForItem(item);
	},

	applyTime(this: DesktopUiInternals, seconds: number): void {
		const dur = this.resolveDuration();
		const pct = dur > 0 ? (seconds / dur) * 100 : 0;

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

		this.currentTimeEl.textContent = formatSeconds(seconds);
		this.remainingTimeEl.textContent = this._formatRemaining(seconds, dur);
		this.refreshTransportEnablement();
	},

	applyDuration(this: DesktopUiInternals, dur: number): void {
		this.cachedDuration = dur;
		const cur = this.player.time?.() ?? 0;
		this.currentTimeEl.textContent = formatSeconds(cur);
		this.remainingTimeEl.textContent = this._formatRemaining(cur, dur);
		this.renderChapterMarkers();
	},

	_formatRemaining(this: DesktopUiInternals, cur: number, dur: number): string {
		if (dur === Number.POSITIVE_INFINITY)
			return this.t('time.live');
		if (dur <= 0)
			return formatSeconds(0);
		if (this._showRemaining)
			return `-${formatSeconds(Math.max(0, dur - cur))}`;
		return formatSeconds(dur);
	},

	/**
	 * Display-state visibility: theater is meaningless inside fullscreen or
	 * PiP, and PiP chrome floats over another window — navigation buttons
	 * there act on the wrong surface. Config opt-outs always win.
	 */
	applyStateVisibility(this: DesktopUiInternals): void {
		this.theaterBtn.hidden = this.theaterConfigHidden || this.fsActive || this.pipActive;
		if (this.topBarRefs) {
			this.topBarRefs.backBtn.hidden = this.pipActive || !this.player.hasListeners('back');
			this.topBarRefs.closeBtn.hidden = this.pipActive || !this.player.hasListeners('close');
			// Opt-in gate (`buttons.cast`), not listener presence — unlike
			// back/close, the button can ship before its listener is wired. PiP
			// still hides it: same floating-chrome-wrong-surface reasoning.
			this.topBarRefs.castBtn.hidden = this.pipActive || !this.opts?.buttons?.cast;
		}
	},

	/**
	 * Mark a button as content-gated (no relevant tracks/items) so the fit
	 * algorithm can skip it without counting its width.
	 * Setting `data-content-hidden="true"` causes `applyAllVisibilityRules`
	 * to treat the button as absent from the layout.
	 */
	setContentHidden(this: DesktopUiInternals, btn: HTMLButtonElement, hidden: boolean): void {
		if (hidden) {
			btn.setAttribute('data-content-hidden', 'true');
			btn.hidden = true;
		}
		else {
			btn.removeAttribute('data-content-hidden');
		}
	},

	refreshCapabilityVisibility(this: DesktopUiInternals): void {
		const subs = this.player.subtitles?.() ?? [];
		const subsCount = subs.length;
		// A consumer-supplied subtitle-menu action (e.g. "Search subtitles
		// online…") is most useful with zero tracks, so it keeps the subtitles
		// button/category reachable on its own — same standing as a real track.
		const hasSubtitleMenuActions = (this.opts?.subtitleMenuActions?.length ?? 0) > 0;

		const audios = this.player.audioTracks?.() ?? [];
		const levels = this.player.qualityLevels?.() ?? [];

		this.setContentHidden(this.subsBtn, subsCount === 0 && !hasSubtitleMenuActions);
		this.setContentHidden(this.audioBtn, audios.length <= 1);
		this.setContentHidden(this.qualityBtn, levels.length < 2);

		const chapters = this.player.chapters();
		this.setContentHidden(this.chapBackBtn, chapters.length === 0);
		this.setContentHidden(this.chapFwdBtn, chapters.length === 0);

		const queueLen = this.safeQueueLength();
		this.setContentHidden(this.playlistBtn, queueLen < 2);

		this.menus.mainButtons.subtitles.style.display = (subsCount === 0 && !hasSubtitleMenuActions) ? 'none' : 'flex';
		this.menus.mainButtons.language.style.display = audios.length <= 1 ? 'none' : 'flex';
		this.menus.mainButtons.quality.style.display = levels.length < 2 ? 'none' : 'flex';
		this.menus.mainButtons.playlist.style.display = queueLen < 2 ? 'none' : 'flex';

		const speeds = this.player.playbackRates?.() ?? [];
		const settingsEmpty = speeds.length <= 1
			&& audios.length <= 1
			&& subsCount === 0
			&& !hasSubtitleMenuActions
			&& (this.opts?.settingsItems?.length ?? 0) === 0;
		this.setContentHidden(this.settingsBtn, settingsEmpty);

		if (this._responsiveState.lastContainerWidth > 0) {
			applyAllVisibilityRules(
				this._responsiveState,
				this.opts,
				this._responsiveState.lastContainerWidth,
				payload => this.emit('layout:breakpoint', payload),
				this.player.container,
			);
		}

		this.refreshTransportEnablement();
	},

	refreshTransportEnablement(this: DesktopUiInternals): void {
		const idx = this.safeCurrentIndex();
		const len = this.safeQueueLength();

		const onFirst = idx <= 0 || len <= 1;
		const onLast = idx >= len - 1 || len <= 1;
		this.setDisabled(this.prevBtn, onFirst);
		this.setDisabled(this.nextBtn, onLast);

		const currentTime = this.player.time?.() ?? 0;
		const dur = this.resolveDuration();
		this.setDisabled(this.rewindBtn, currentTime <= 0);
		this.setDisabled(this.forwardBtn, dur > 0 && currentTime >= dur - 0.25);

		const chapters = this.player.chapters();
		const hasPrevChap = chapters.some(chapter => chapter.start < currentTime - 1);
		const hasNextChap = chapters.some(chapter => chapter.start > currentTime + 1);
		this.setDisabled(this.chapBackBtn, !hasPrevChap);
		this.setDisabled(this.chapFwdBtn, !hasNextChap);
	},

	setDisabled(this: DesktopUiInternals, btn: HTMLButtonElement, disabled: boolean): void {
		if (disabled) {
			btn.setAttribute('disabled', 'true');
			btn.setAttribute('aria-disabled', 'true');
		}
		else {
			btn.removeAttribute('disabled');
			btn.removeAttribute('aria-disabled');
		}
	},

	safeCurrentIndex(this: DesktopUiInternals): number {
		try {
			return this.player.index();
		}
		catch { /* not implemented */ }
		return 0;
	},

	safeQueueLength(this: DesktopUiInternals): number {
		try {
			return this.player.queueLength();
		}
		catch { /* not implemented */ }
		return this.player.queue().length;
	},
} as const;
