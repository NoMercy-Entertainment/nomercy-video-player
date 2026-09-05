// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * DOM-construction and event-wiring mixin — builds the overlay DOM tree,
 * wires all button click/input/keyboard/pointer listeners, and applies the
 * initial player state to the freshly built UI.
 *
 * Owns: buildDom, wireTooltips, applyInitialState, wireKeybindHint,
 *       wireSliderBar, wireEvents.
 */

import type { VideoPlayerConfig } from '../../../types';
import type { BottomBarRefs, BottomRowRefs, CenterRefs } from '../helpers/dom';
import type { MenuControlRefs } from '../helpers/menuControl';
import type { TooltipButtonRefs } from '../helpers/tooltips';
import type { DesktopUiOptions } from '../index';

import type { DesktopUiInternals } from '../internals';

import { addClasses } from '@nomercy-entertainment/nomercy-player-core';
import { TheaterState, VolumeState } from '../../../types';

import { setActivity } from '../helpers/activity';
import { buildBottomBar, buildCenter, buildShortcutsOverlay } from '../helpers/dom';
import { makeMenuControlState } from '../helpers/menuControl';
import { buildMenuFrame, renderMainMenuActions } from '../helpers/menus';
import { formatSeconds } from '../helpers/progressBar';
import { wireVolumeSlider } from '../helpers/responsive';
import { wireTooltips } from '../helpers/tooltips';
import { buildTitleBar } from '../helpers/topBar';

export const domMethods = {
	buildDom(this: DesktopUiInternals): void {
		const root = this.mount('overlay');
		this.overlayRoot = root;
		addClasses(root, ['overlay']);

		this.topBarRefs = buildTitleBar(this.player, root, this.opts);
		this.topBarRefs.right.hidden = !!this.opts?.hideTitle;

		const centerRefs: CenterRefs = buildCenter(this.player, root);
		this.centerWrap = centerRefs.centerWrap;
		this.centerBtn = centerRefs.centerBtn;

		const bottomRefs: BottomBarRefs & BottomRowRefs = buildBottomBar(
			this.player,
			root,
			this.opts,
			this.listen.bind(this),
			this.t.bind(this),
		);
		this.bottomBar = bottomRefs.bottomBar;
		this.sliderRefs = bottomRefs.sliderRefs;
		this.playBtn = bottomRefs.playBtn;
		this.prevBtn = bottomRefs.prevBtn;
		this.nextBtn = bottomRefs.nextBtn;
		this.rewindBtn = bottomRefs.rewindBtn;
		this.forwardBtn = bottomRefs.forwardBtn;
		this.chapBackBtn = bottomRefs.chapBackBtn;
		this.chapFwdBtn = bottomRefs.chapFwdBtn;
		this.volBtn = bottomRefs.volBtn;
		this.volSlider = bottomRefs.volSlider;
		this.volSliderVertical = bottomRefs.volSliderVertical;
		this.volPopupMuteBtn = bottomRefs.volPopupMuteBtn;
		this.currentTimeEl = bottomRefs.currentTimeEl;
		this.remainingTimeEl = bottomRefs.remainingTimeEl;
		this.aspectRatioBtn = bottomRefs.aspectRatioBtn;
		this.theaterBtn = bottomRefs.theaterBtn;
		this.theaterConfigHidden = bottomRefs.theaterConfigHidden;
		this.pipBtn = bottomRefs.pipBtn;
		this.speedBtn = bottomRefs.speedBtn;
		this.subsBtn = bottomRefs.subsBtn;
		this.audioBtn = bottomRefs.audioBtn;
		this.qualityBtn = bottomRefs.qualityBtn;
		this.playlistBtn = bottomRefs.playlistBtn;
		this.settingsBtn = bottomRefs.settingsBtn;
		this.fsBtn = bottomRefs.fsBtn;

		wireVolumeSlider(
			this._responsiveState,
			this.opts,
			this.player.container,
			bottomRefs.volContainer,
			bottomRefs.volSliderVertical,
			bottomRefs.volVertInput,
			this.volBtn,
			this.volPopupMuteBtn,
			this.listen.bind(this),
			() => this.player.volume?.() ?? 100,
			(level: number) => { this.player.volume?.(level); },
			() => { this.player.toggleMute?.(); },
			fn => this.lifecycle.addCleanup(fn),
		);

		this.menus = buildMenuFrame(this.player, root, this.listen.bind(this), {
			closeMenu: () => this.closeAllMenus(),
			openSubMenu: id => this.openSubMenu(id),
			backToMain: () => this.openMainMenu(),
		}, this.opts?.settingsItems, this.opts?.settingsMenuActions);

		this._menuControlState = makeMenuControlState();
		this._menuControlRefs = {
			settingsBtn: this.settingsBtn,
			speedBtn: this.speedBtn,
			qualityBtn: this.qualityBtn,
			subsBtn: this.subsBtn,
			audioBtn: this.audioBtn,
			playlistBtn: this.playlistBtn,
			aspectRatioBtn: this.aspectRatioBtn,
		} satisfies MenuControlRefs;

		this.shortcutsOverlay = buildShortcutsOverlay(
			root,
			this.listen.bind(this),
			this.t.bind(this),
			() => this.hideShortcuts(),
		);
	},

	wireTooltips(this: DesktopUiInternals): void {
		const refs: TooltipButtonRefs = {
			playBtn: this.playBtn,
			rewindBtn: this.rewindBtn,
			forwardBtn: this.forwardBtn,
			volBtn: this.volBtn,
			aspectRatioBtn: this.aspectRatioBtn,
			theaterBtn: this.theaterBtn,
			pipBtn: this.pipBtn,
			speedBtn: this.speedBtn,
			subsBtn: this.subsBtn,
			audioBtn: this.audioBtn,
			qualityBtn: this.qualityBtn,
			playlistBtn: this.playlistBtn,
			settingsBtn: this.settingsBtn,
			fsBtn: this.fsBtn,
			prevBtn: this.prevBtn,
			nextBtn: this.nextBtn,
			chapBackBtn: this.chapBackBtn,
			chapFwdBtn: this.chapFwdBtn,
		};
		wireTooltips(
			this.player,
			refs,
			this.sliderRefs,
			this.listen.bind(this),
			() => this._tooltipHoverToken,
			(token) => { this._tooltipHoverToken = token; },
			(fn, ms) => this.timeout(() => fn(), ms),
			this.t.bind(this),
			() => this.safeCurrentIndex(),
		);
	},

	applyInitialState(this: DesktopUiInternals): void {
		this.applyVolume(this.player.volume?.() ?? 100);
		this.applyMuted(this.player.volumeState() === VolumeState.MUTED);
		this.applyRate();
		this.applySubsIcon();
		this.applyAudioIcon();
		this.applyQualityIcon();
		this.applyAspectRatioIcon();
		this.applyPipIcon(Boolean(document.pictureInPictureElement));
		const theaterActive = this.player.theater() === TheaterState.ON;
		this.applyTheaterIcon(theaterActive);
		const cur = this.player.item?.();
		if (cur)
			this.handleCurrentChange(cur);
		const dur = this.player.duration?.();
		if (dur)
			this.applyDuration(dur);
		this.refreshCapabilityVisibility();
		this.applyStateVisibility();
	},

	wireKeybindHint(this: DesktopUiInternals): void {
		if (typeof sessionStorage === 'undefined')
			return;
		if (sessionStorage.getItem('nmplayer-keybinds-hint-shown'))
			return;

		this.once('play', () => {
			this.player.emit('display-message', { text: this.t('shortcuts.hintToast'), ms: 12000 });
			sessionStorage.setItem('nmplayer-keybinds-hint-shown', '1');
		});
	},

	wireSliderBar(this: DesktopUiInternals): void {
		this.sliderRefs.sliderBar.style.touchAction = 'none';

		const startScrub = (): void => {
			if (this.isMouseDown)
				return;
			this.isMouseDown = true;
			this.isScrubbing = true;
			this._activityState.isScrubbing = true;
			this.sliderRefs.sliderBar.classList.add('slider-scrubbing');
		};
		this.listen(this.sliderRefs.sliderBar, 'mousedown', startScrub);
		this.listen(this.sliderRefs.sliderBar, 'touchstart', startScrub);

		const finalizeScrub = (event: Event): void => {
			if (!this.isMouseDown)
				return;
			this.isMouseDown = false;
			this.isScrubbing = false;
			this._activityState.isScrubbing = false;
			this.sliderRefs.sliderBar.classList.remove('slider-scrubbing');
			this.sliderRefs.sliderPop.style.setProperty('--visibility', '0');
			const scrub = this.getScrubTime(event);
			this.sliderRefs.sliderNipple.style.left = `${scrub.scrubTime}%`;
			void this.player.time?.(scrub.scrubTimePlayer);
			this.bumpActivity();
		};

		this.listen(document, 'mouseup', finalizeScrub);
		this.listen(this.bottomBar, 'click', finalizeScrub);
		this.listen(this.sliderRefs.sliderBar, 'touchend', finalizeScrub);

		const onMove = (event: Event): void => {
			const scrub = this.getScrubTime(event);
			this.sliderRefs.sliderPopText.textContent = formatSeconds(scrub.scrubTimePlayer);
			this.paintSpriteAt(scrub.scrubTimePlayer);

			const popOffsetPct = this.clampPopOffset(scrub.scrubTime);
			this.sliderRefs.sliderPop.style.left = `${popOffsetPct}%`;

			this.sliderRefs.sliderPop.style.setProperty('--visibility', '1');

			const chapters = this.player.chapters();
			if (chapters.length === 0) {
				this.sliderRefs.sliderHover.style.width = `${scrub.scrubTime}%`;
			}
			else {
				this.updateChapterHover(scrub.scrubTime);
			}
			this.sliderRefs.chapterText.textContent = this.findChapterTitle(scrub.scrubTimePlayer) ?? '';

			if (!this.isMouseDown)
				return;
			this.sliderRefs.sliderNipple.style.left = `${scrub.scrubTime}%`;
		};
		this.listen(this.sliderRefs.sliderBar, 'mousemove', onMove);
		this.listen(this.sliderRefs.sliderBar, 'touchmove', onMove);

		this.listen(this.sliderRefs.sliderBar, 'mouseover', (event: Event) => {
			const scrub = this.getScrubTime(event);
			this.sliderRefs.sliderPopText.textContent = formatSeconds(scrub.scrubTimePlayer);
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
	},

	wireEvents(this: DesktopUiInternals): void {
		if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
			// Comma-joined so one listener catches a change in either signal —
			// the CSS media-query-list comma is OR. `renderQualityPane` re-asks
			// `detectDisplayHdr` for the actual value on repaint; this listener
			// only needs to know THAT something changed.
			const hdrMql = window.matchMedia('(video-dynamic-range: high), (dynamic-range: high)');
			this.listen(hdrMql, 'change', () => this.repaintQualityIfOpen());
		}

		const container = this.player.container;
		if (container) {
			this.listen(container, 'mousemove', (event: Event) => {
				const me = event as MouseEvent;
				const dx = me.clientX - this._lastMouseX;
				const dy = me.clientY - this._lastMouseY;
				if (Math.abs(dx) < 2 && Math.abs(dy) < 2)
					return;
				this._lastMouseX = me.clientX;
				this._lastMouseY = me.clientY;
				this.bumpActivity();
			});
			this.listen(container, 'mousedown', () => this.bumpActivity());
			this.listen(container, 'pointerdown', () => this.bumpActivity());
			this.listen(container, 'touchstart', () => {
				if (!this.player.container.classList.contains('active'))
					this.bumpActivity();
			});
			this.listen(container, 'keydown', (event: Event) => {
				this.bumpActivity();
				const ke = event as KeyboardEvent;
				// This listener sits on the container; KeyHandlerPlugin listens on
				// document by default. A real press starts inside the container and
				// bubbles, so both saw it: `?` toggled the overlay open here and
				// closed it again there, and the overlay never appeared. Stop the
				// event once this handler has consumed it. Every previous test
				// dispatched straight at document, which skipped this listener.
				if (ke.key === '?' && !ke.ctrlKey && !ke.metaKey && !ke.altKey) {
					ke.preventDefault();
					ke.stopPropagation();
					this.toggleShortcuts();
				}
				else if (ke.key === 'Escape' && this._menuControlState.menuOpen) {
					ke.preventDefault();
					ke.stopPropagation();
					this.closeAllMenus();
				}
				else if (ke.key === 'Escape' && this._shortcutsVisible) {
					ke.preventDefault();
					ke.stopPropagation();
					this.hideShortcuts();
				}
			});
			this.listen(container, 'mouseleave', () => this.maybeHide());
			this.listen(container, 'click', (event: Event) => {
				this.bumpActivity();
				const target = event.target as HTMLElement;
				if (target.tagName === 'VIDEO' && !this.opts?.disableClickToPause && !(this.player as { options?: VideoPlayerConfig }).options?.disableClickToPause) {
					void this.player.togglePlayback();
				}
			});

			this.listen(this.overlayRoot, 'click', (event: Event) => {
				if ((event.target as Node) === this.overlayRoot) {
					this.dismissOverlay();
				}
			});
		}

		for (const zone of [this.bottomBar, this.menus.frame]) {
			this.listen(zone, 'pointerenter', (event: Event) => {
				if ((event as PointerEvent).pointerType === 'mouse') {
					this._activityState.isControlsHovered = true;
				}
			});
			this.listen(zone, 'pointerleave', (event: Event) => {
				if ((event as PointerEvent).pointerType === 'mouse') {
					this._activityState.isControlsHovered = false;
				}
			});
		}

		this.on('plugin:desktop-ui:shortcuts-toggle', () => this.toggleShortcuts());

		this.on('play', () => {
			this.centerWrap.classList.add('dismissed');
			this.setPlayingState(true);
			this.bumpActivity();
		});
		this.on('pause', () => {
			this.setPlayingState(false);
			if (this._activityState.inactivityToken !== null) {
				clearTimeout(this._activityState.inactivityToken);
				this._activityState.inactivityToken = null;
			}
			setActivity(this._activityState, this.player, true);
		});
		this.on('ended', () => this.setPlayingState(false));

		this.on('seek', (payload) => {
			if (payload?.source)
				this.bumpActivity();
		});

		this.on('item', payload => this.handleCurrentChange(payload.item));

		this.on('listeners-changed', (payload) => {
			if ((payload.name === 'back' || payload.name === 'close') && this.topBarRefs)
				this.applyStateVisibility();
		});

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

		this.on('duration', payload => this.applyDuration(payload.duration));
		this.on('time', payload => this.applyTime(payload.time));

		this.on('volume', (payload) => {
			const level = typeof payload?.level === 'number' ? payload.level : this.player.volume?.() ?? 100;
			this.applyVolume(level);
			this.showMessage(this.t('message.volume', { level: String(Math.round(level)) }), 1200);
		});
		this.on('mute', (payload) => {
			const muted = payload?.muted ?? this.player.volumeState?.() === 'muted';
			this.applyMuted(muted);
			this.showMessage(this.t(muted ? 'message.muted' : 'message.unmuted'), 1200);
		});

		this.on('backend:ratechange', () => {
			this.applyRate();
			this.repaintSpeedIfOpen();
		});

		this.on('subtitle', (payload) => {
			const idx = payload.track;
			this._menuControlState.activeSubtitleIdx = (typeof idx === 'number' && idx >= 0) ? idx : -1;
			this.applySubsIcon();
			this.repaintSubsIfOpen();
		});

		// Fired by `addSubtitleTrack()` / `removeSubtitleTrack()` — the track
		// list changed without a reload. Button visibility is content-gated
		// (hidden when `subtitles()` was empty at mediaReady), so a newly
		// injected track needs the same visibility recheck `levels` /
		// `audioTracks` already get, plus a repaint if the pane is open.
		this.on('subtitles', () => {
			this.refreshCapabilityVisibility();
			this.repaintSubsIfOpen();
		});

		this.on('audioTrack', (payload) => {
			this._menuControlState.activeAudioIdx = typeof payload.id === 'number' ? payload.id : -1;
			this.applyAudioIcon();
			this.repaintAudioIfOpen();
		});

		this.on('quality:requested', (payload) => {
			this._menuControlState.activeQualityIdx = payload.level;
			this._menuControlState.userPickedQuality = payload.level !== 'auto';
			this.applyQualityIcon();
			this.repaintQualityIfOpen();
		});

		this.on('level-switched', (payload) => {
			if (typeof payload.level === 'number') {
				this._menuControlState.playingQualityIdx = payload.level;
			}
			if (!this._menuControlState.userPickedQuality) {
				this._menuControlState.activeQualityIdx = 'auto';
			}
			else {
				this._menuControlState.activeQualityIdx = typeof payload.level === 'number'
					? payload.level
					: this._menuControlState.activeQualityIdx;
			}
			this.applyQualityIcon();
			this.repaintQualityIfOpen();
		});

		this.on('levels', () => { this.refreshCapabilityVisibility(); });
		this.on('audioTracks', () => { this.refreshCapabilityVisibility(); });

		this.on('fullscreen', () => {
			this.applyFullscreen();
			this.fsActive = Boolean(document.fullscreenElement);
			this.applyStateVisibility();
		});
		this.on('pip', () => {
			this.pipActive = Boolean(document.pictureInPictureElement);
			this.applyPipIcon(this.pipActive);
			this.applyStateVisibility();
		});
		this.on('theater', () => {
			this.applyTheaterIcon(this.player.theater() === TheaterState.ON);
		});

		this.on('aspectRatio', () => {
			this.applyAspectRatioIcon();
			this.repaintAspectRatioIfOpen();
		});

		this.on('language', () => {
			this.repaintPlaylistIfOpen();
		});

		this.listen(this.centerBtn, 'click', () => {
			this.centerWrap.classList.add('dismissed');
			void this.player.togglePlayback();
			this.bumpActivity();
		});
		this.listen(this.playBtn, 'click', () => { void this.player.togglePlayback(); this.bumpActivity(); });

		this.listen(this.prevBtn, 'click', () => { void this.player.previous?.(); });
		this.listen(this.nextBtn, 'click', () => { void this.player.next?.(); });
		this.listen(this.rewindBtn, 'click', () => { this.player.rewind?.(10); });
		this.listen(this.forwardBtn, 'click', () => { this.player.forward?.(10); });
		this.listen(this.chapBackBtn, 'click', () => this.previousChapter());
		this.listen(this.chapFwdBtn, 'click', () => this.nextChapter());

		this.listen(this.volBtn, 'click', () => {
			const volContainer = this.volBtn.closest('.volume-container');
			if (volContainer?.classList.contains('volume-container-vertical')) {
				return;
			}
			this.player.toggleMute?.();
		});
		this.listen(this.volSlider, 'input', () => {
			const volume = Number(this.volSlider.value);
			this.player.volume?.(volume);
		});

		this.listen(this.remainingTimeEl, 'click', () => {
			this._showRemaining = !this._showRemaining;
			void Promise.resolve(this.storage.setJSON('showRemaining', this._showRemaining));
			this.applyTime(this.player.time?.() ?? 0);
		});

		this.wireSliderBar();

		this.listen(this.speedBtn, 'click', (event: Event) => { event.stopPropagation(); this.openSubMenu('speed'); });
		this.listen(this.qualityBtn, 'click', (event: Event) => { event.stopPropagation(); this.openSubMenu('quality'); });
		this.listen(this.subsBtn, 'click', (event: Event) => { event.stopPropagation(); this.openSubMenu('subtitles'); });
		this.listen(this.audioBtn, 'click', (event: Event) => { event.stopPropagation(); this.openSubMenu('language'); });
		this.listen(this.playlistBtn, 'click', (event: Event) => { event.stopPropagation(); this.openSubMenu('playlist'); });
		this.listen(this.settingsBtn, 'click', (event: Event) => { event.stopPropagation(); this.openMainMenu(); });

		this.listen(this.aspectRatioBtn, 'click', (event: Event) => { event.stopPropagation(); this.openSubMenu('aspectRatio'); });
		this.listen(this.theaterBtn, 'click', () => { this.player.toggleTheater(); });
		this.listen(this.pipBtn, 'click', () => { this.player.togglePip(); });
		this.listen(this.fsBtn, 'click', () => { this.player.toggleFullscreen(); });

		const videoEl = this.player.videoElement;
		if (videoEl) {
			this.listen(videoEl, 'enterpictureinpicture', () => this.applyPipIcon(true));
			this.listen(videoEl, 'leavepictureinpicture', () => this.applyPipIcon(false));
		}

		this.listen(document, 'click', (event: Event) => {
			if (!this._menuControlState.menuOpen)
				return;
			const target = event.target as Node;
			if (this.menus.frame.contains(target))
				return;
			this.closeAllMenus();
		});

		if (!('pictureInPictureEnabled' in document))
			this.pipBtn.hidden = true;

		this.on('plugin:desktop-ui:opts:changed', (opts) => {
			this.topBarRefs.right.hidden = !!(opts as DesktopUiOptions).hideTitle;
			// A live subtitleMenuActions (or other content-gated field) change
			// needs the same recheck `levels` / `audioTracks` get off their events.
			this.refreshCapabilityVisibility();
			// settingsMenuActions rows are the one main-menu row kind built for
			// repaint (unlike the static category buttons and settingsItems
			// toggles) — a consumer enabling e.g. "Cast to device…" after mount
			// (Cast SDK finishing its async probe) must see the row appear live.
			renderMainMenuActions(
				this.menus.mainMenuActionsContainer,
				(opts as DesktopUiOptions).settingsMenuActions,
				this.listen.bind(this),
				() => this.closeAllMenus(),
				this.player,
			);
		});
	},
} as const;
