/**
 * TV-UI plugin — keyboard-binding layer for TV remote controls.
 *
 * Subclasses the video-v2 KeyHandlerPlugin to inherit the full default binding
 * set (Color F0-F3, BrowserFavorites, all universal media keys, modifier seeks,
 * chapter nav, speed, frame-advance, subs/audio/aspect-ratio, fullscreen, stop)
 * and overrides the groups that behave differently on a TV:
 *
 *  - Arrow keys: on desktop they are gated behind `!isTv()`. Here they seek
 *    directly because the host page is expected to remove focus from interactive
 *    elements before mounting this plugin (TV UX convention).
 *
 *  - Volume arrows: desktop-ui disables them on TV; this plugin enables them so
 *    a web-based TV shell that owns volume can forward events correctly.
 *
 *  - Info key: wired to an OSD overlay showing title / chapter / time instead of
 *    the commented-out stub in the base handler.
 *
 *  - MediaRecord: emits `plugin:tv-ui:bookmark` with the current time so the
 *    consumer can decide what to persist; the player itself does not store bookmarks.
 *
 *  - Help key: emits `plugin:tv-ui:shortcuts-toggle` (not `plugin:desktop-ui:…`)
 *    so a TV shortcuts overlay can be registered independently.
 *
 * NoMercy Connect routing
 * ───────────────────────
 * All bindings call local player methods directly. A consumer-side NoMercy
 * Connect plugin can call `keyHandler.replace(combo, fn)` to route commands
 * through the socket instead.
 */

import { translationsFromGlob } from '@nomercy-entertainment/nomercy-player-core';
import type { Chapter, Translations } from '@nomercy-entertainment/nomercy-player-core';

import { KeyHandlerPlugin } from '../key-handler';
import type { NMVideoPlayer, VideoPlaylistItem } from '../../index';

export interface TvUiOptions {
	/**
	 * Seconds to seek when ArrowLeft / ArrowRight are pressed on TV. Default 5.
	 * (Color-button seeks are fixed at 30/60/90/120 s — not affected by this.)
	 */
	arrowSeekSeconds?: number;
	/**
	 * Milliseconds to display the Info OSD before it auto-dismisses. Default 5000.
	 */
	infoDisplayMs?: number;
}

interface TvUiPlayer extends NMVideoPlayer<any> {
	displayMessage?: (text: string, ms?: number) => void;
}


function fmtTime(totalSeconds: number): string {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = Math.floor(totalSeconds % 60);

	return hours > 0
		? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
		: `${minutes}:${String(seconds).padStart(2, '0')}`;
}


export class TvUiPlugin extends KeyHandlerPlugin {
	static override readonly id: string = 'tv-ui';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'TV remote control bindings — Color buttons, Info OSD, MediaRecord bookmark, TV-aware Arrow seek and volume';
	static override readonly translations: Translations = translationsFromGlob('./i18n/*.ts');

	private get tvOpts(): TvUiOptions {
		return (this.opts as TvUiOptions | undefined) ?? {};
	}

	private get tvPlayer(): TvUiPlayer {
		return this.player as TvUiPlayer;
	}

	/**
	 * Extends the base default groups with TV-specific bindings.
	 * All Color-button, BrowserFavorites, universal media-key, modifier-seek,
	 * chapter, speed, frame-advance, subtitle-size, and stop bindings are
	 * inherited from super.addDefaults().
	 */
	protected override addDefaults(): void {
		super.addDefaults();
		this.addInfoKey();
		this.addMediaRecordKey();
	}

	/**
	 * On TV, Arrow keys seek directly — they are NOT used for focus navigation
	 * inside the player element while the player is active.
	 */
	protected override addNavigationKeys(): void {
		const seekSeconds = this.tvOpts.arrowSeekSeconds ?? 5;

		this.bind('ArrowLeft', () => { void this.player.rewind?.(seekSeconds); });
		this.bind('ArrowRight', () => { void this.player.forward?.(seekSeconds); });
	}

	/**
	 * On TV, volume arrows are enabled — the web-based TV shell routes these to
	 * the system mixer or handles them within the player as appropriate.
	 */
	protected override addVolumeKeys(): void {
		this.bind('ArrowUp', () => { void this.player.volumeUp?.(); });
		this.bind('ArrowDown', () => { void this.player.volumeDown?.(); });
		this.bind('m', () => { void this.player.toggleMute?.(); });
	}

	/**
	 * Aspect-ratio cycle via BrowserFavorites and 'a' — shows an OSD message
	 * confirming the change on TV where there is no visible control bar.
	 */
	protected override addAspectRatioKeys(): void {
		const cycle = (): void => {
			void this.player.cycleAspectRatio?.();
			this.osdMessage(this.t('aspectRatio.cycled'));
		};

		this.bind('a', cycle);
		this.bind('BrowserFavorites', cycle);
	}

	/**
	 * Info key — shows a brief OSD with title, chapter, current time and
	 * time remaining. Also emits `plugin:tv-ui:info` so a TV shell can render
	 * its own overlay. The OSD message fires unconditionally as a fallback.
	 */
	protected addInfoKey(): void {
		this.bind('Info', () => { this.showInfoOsd(); });
	}

	/**
	 * MediaRecord — emits `plugin:tv-ui:bookmark` with the current time so the
	 * consumer can persist the bookmark. No-ops silently when no listener is
	 * registered.
	 */
	protected addMediaRecordKey(): void {
		this.bind('MediaRecord', () => {
			const currentTime = this.player.currentTime?.() ?? 0;

			try {
				this.player.emit('plugin:tv-ui:bookmark', { time: currentTime });
			}
			catch { /* consumer may not listen — safe no-op */ }
		});
	}

	/**
	 * Help key — emits `plugin:tv-ui:shortcuts-toggle` so a TV shortcuts overlay
	 * can be registered independently from the desktop-ui overlay.
	 */
	protected override addHelpKey(): void {
		this.bind('?', () => {
			try {
				this.player.emit('plugin:tv-ui:shortcuts-toggle', undefined);
			}
			catch { /* tv-ui shortcuts overlay not mounted — no-op */ }
		});
	}

	/**
	 * Builds and displays the Info OSD. Fires `plugin:tv-ui:info` for an external
	 * TV shell overlay, then also calls `osdMessage` as the built-in fallback.
	 */
	private showInfoOsd(): void {
		const currentTime = this.player.currentTime?.() ?? 0;
		const duration = this.player.duration?.() ?? 0;
		const remaining = Math.max(0, duration - currentTime);
		const title = this.resolveTitle();
		const chapterLabel = this.resolveChapterLabel(currentTime);
		const displayMs = this.tvOpts.infoDisplayMs ?? 5000;

		try {
			this.player.emit('plugin:tv-ui:info', {
				title,
				currentTime,
				duration,
				remaining,
				chapterLabel,
			});
		}
		catch { /* no external listener — fall through to OSD message */ }

		const parts: string[] = [];

		if (title) parts.push(title);
		if (chapterLabel) parts.push(chapterLabel);
		parts.push(`${fmtTime(currentTime)} / -${fmtTime(remaining)}`);

		this.osdMessage(parts.join('  ·  '), displayMs);
	}

	private resolveTitle(): string {
		const item = this.player.current?.() as VideoPlaylistItem | undefined;

		if (typeof item?.title === 'string' && item.title.length > 0) return item.title;

		return this.t('info.noTitle');
	}

	private resolveChapterLabel(currentTime: number): string {
		const chapters = this.player.chapters?.() ?? [];
		if (chapters.length === 0) return '';

		const active = [...chapters]
			.reverse()
			.find((chapter: Chapter) => currentTime >= chapter.start);

		if (!active) return '';

		const chapterNumber = active.index + 1;

		return active.title.length > 0
			? `${this.t('info.chapter')} ${chapterNumber}: ${active.title}`
			: `${this.t('info.chapter')} ${chapterNumber}`;
	}

	/**
	 * Sends a message to the OSD. Calls `player.displayMessage` when the message
	 * plugin is mounted, then also emits `display-message` for listeners that
	 * prefer the event surface.
	 */
	private osdMessage(text: string, durationMs?: number): void {
		try {
			this.tvPlayer.displayMessage?.(text, durationMs);
		}
		catch { /* displayMessage not mounted */ }

		try {
			this.player.emit('display-message', { text });
		}
		catch { /* swallow */ }
	}
}


export const tvUiPlugin = TvUiPlugin;
