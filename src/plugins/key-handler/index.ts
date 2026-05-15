import { KeyHandlerPlugin as BaseKeyHandler } from '@nomercy-entertainment/nomercy-player-core/plugins/key-handler';
import type { NMVideoPlayer, VideoPlayerConfig } from '../../index';

const fmtTime = (s: number): string => {
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = Math.floor(s % 60);
	return h > 0
		? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
		: `${m}:${String(sec).padStart(2, '0')}`;
};

function hasDisplayMessage(p: NMVideoPlayer<any>): p is NMVideoPlayer<any> & { displayMessage: (text: string, ms?: number) => void } {
	return typeof (p as unknown as { displayMessage?: unknown }).displayMessage === 'function';
}

/**
 * Video key handler — full v1 binding parity, modifier-aware. Subclasses
 * the kit base for cooldown / scope / `when` / cleanup; adds video-specific
 * groups on top via `addDefaults()`.
 *
 * Group methods are protected so vendors can subclass and override one
 * group without rewriting the rest. Override `addDefaults()` to drop the
 * whole video set and start fresh.
 */
export class KeyHandlerPlugin extends BaseKeyHandler<NMVideoPlayer<any>> {
	static override readonly id: string = 'video-key-handler';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'Video keyboard shortcuts — playback, media keys, modifier-aware seeks, TV color buttons, chapters, subs/audio, fullscreen, speed, frame-advance, time, subtitle-size, aspect-ratio';

	private get cfg(): VideoPlayerConfig {
		return this.player.options as VideoPlayerConfig;
	}

	protected mediaControlsAllowed(): boolean {
		return !this.cfg.disableMediaControls;
	}

	/** Best-effort OSD message — calls `player.displayMessage(...)` if present, also emits `display-message`. */
	protected message(text: string): void {
		if (hasDisplayMessage(this.player)) {
			try { this.player.displayMessage(text); }
			catch { /* swallow */ }
		}
		try { this.player.emit('display-message', { text }); }
		catch { /* swallow */ }
	}

	protected override addDefaults(): void {
		if (this.cfg.disableControls) return;
		this.addPlaybackKeys();
		this.addNavigationKeys();
		this.addVolumeKeys();
		this.addMediaKeys();
		this.addModifierSeekKeys();
		this.addQuickSkipKeys();
		this.addNextPrevKeys();
		this.addChapterKeys();
		this.addFullscreenKeys();
		this.addSpeedKeys();
		this.addFrameAdvanceKey();
		this.addShowTimeKey();
		this.addSubtitleSizeKeys();
		this.addAspectRatioKeys();
		this.addStopKey();
		this.addHelpKey();
	}

	protected override defaultBindings(): void {
		this.addDefaults();
	}

	protected override addPlaybackKeys(): void {
		this.bind(' ', () => { void this.player.togglePlayback?.(); });
		this.bind('MediaPlay', () => { if (this.mediaControlsAllowed()) void this.player.play?.(); });
		this.bind('MediaPause', () => { if (this.mediaControlsAllowed()) void this.player.pause?.(); });
		this.bind('MediaPlayPause', () => { if (this.mediaControlsAllowed()) void this.player.togglePlayback?.(); });
		this.bind('MediaStop', () => { if (this.mediaControlsAllowed()) void this.player.stop?.(); });
		this.bind('MediaRewind', () => { if (this.mediaControlsAllowed()) void this.player.rewind?.(); });
		this.bind('MediaFastForward', () => { if (this.mediaControlsAllowed()) void this.player.forward?.(); });
	}

	protected override addNavigationKeys(): void {
		this.bind('ArrowLeft', () => { if (!this.player.isTv?.()) void this.player.rewind?.(); });
		this.bind('ArrowRight', () => { if (!this.player.isTv?.()) void this.player.forward?.(); });
	}

	protected override addVolumeKeys(): void {
		this.bind('ArrowUp', () => {
			if (!this.player.isTv?.() && !this.player.isMobile?.()) void this.player.volumeUp?.();
		});
		this.bind('ArrowDown', () => {
			if (!this.player.isTv?.() && !this.player.isMobile?.()) void this.player.volumeDown?.();
		});
		this.bind('m', () => { void this.player.toggleMute?.(); });
	}

	protected override addMediaKeys(): void {
		this.bind('Subtitle', () => { void this.player.cycleSubtitles?.(); });
		this.bind('5', () => { void this.player.cycleSubtitles?.(); });
		this.bind('v', () => { void this.player.cycleSubtitles?.(); });
		this.bind('Audio', () => { void this.player.cycleAudioTracks?.(); });
		this.bind('2', () => { void this.player.cycleAudioTracks?.(); });
		this.bind('b', () => { void this.player.cycleAudioTracks?.(); });
	}

	/** VLC-style modifier seeks: shift = ±3s, alt = ±10s, ctrl = ±60s. */
	protected addModifierSeekKeys(): void {
		const seek = (delta: number): void => {
			if (delta > 0) void this.player.forward?.(delta);
			else void this.player.rewind?.(Math.abs(delta));
		};
		this.bind('shift+ArrowLeft', () => seek(-3));
		this.bind('shift+ArrowRight', () => seek(3));
		this.bind('alt+ArrowLeft', () => seek(-10));
		this.bind('alt+ArrowRight', () => seek(10));
		this.bind('ctrl+ArrowLeft', () => seek(-60));
		this.bind('ctrl+ArrowRight', () => seek(60));
	}

	/** Numeric quick-skip + TV remote color buttons (v1 parity). */
	protected addQuickSkipKeys(): void {
		this.bind('1', () => { void this.player.forward?.(120); });
		this.bind('3', () => { void this.player.forward?.(30); });
		this.bind('6', () => { void this.player.forward?.(60); });
		this.bind('9', () => { void this.player.forward?.(90); });
		this.bind('ColorF0Red', () => { void this.player.forward?.(30); });
		this.bind('ColorF1Green', () => { void this.player.forward?.(60); });
		this.bind('ColorF2Yellow', () => { void this.player.forward?.(90); });
		this.bind('ColorF3Blue', () => { void this.player.forward?.(120); });
	}

	protected addNextPrevKeys(): void {
		this.bind('MediaTrackNext', () => { if (this.mediaControlsAllowed()) void this.player.next?.(); });
		this.bind('MediaTrackPrevious', () => { if (this.mediaControlsAllowed()) void this.player.previous?.(); });
		this.bind('n', () => { void this.player.next?.(); });
		this.bind('p', () => { void this.player.previous?.(); });
	}

	/** Chapter cycling — Shift+N forward, Shift+P backward (matches v1). */
	protected addChapterKeys(): void {
		this.bind('shift+n', () => { void this.player.nextChapter?.(); });
		this.bind('shift+p', () => { void this.player.previousChapter?.(); });
	}

	protected addFullscreenKeys(): void {
		this.bind('f', () => { void this.player.toggleFullscreen?.(); });
		this.bind('F11', () => { void this.player.toggleFullscreen?.(); });
		this.bind('Escape', () => {
			const inFs = this.player.fullscreenState?.() === 'on';
			if (inFs) this.player.fullscreenState?.(false);
		});
	}

	/** VLC-style speed: `]` faster, `[` slower, `=` reset to 1x. */
	protected addSpeedKeys(): void {
		const setRate = (rate: number): void => {
			this.player.playbackRate?.(rate);
			this.message(`${rate}x`);
		};
		const currentRate = (): number => this.player.playbackRate?.() ?? 1;

		this.bind(']', () => {
			const rates = this.player.playbackRates?.() ?? [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
			const cur = currentRate();
			const idx = rates.indexOf(cur);
			if (idx >= 0 && idx < rates.length - 1) setRate(rates[idx + 1]!);
		});
		this.bind('[', () => {
			const rates = this.player.playbackRates?.() ?? [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
			const cur = currentRate();
			const idx = rates.indexOf(cur);
			if (idx > 0) setRate(rates[idx - 1]!);
		});
		this.bind('=', () => setRate(1));
	}

	/** Frame-advance ('e') — only when paused, advance ~1 frame at 30fps (v1 parity). */
	protected addFrameAdvanceKey(): void {
		this.bind('e', () => {
			const ps = this.player.playState?.();
			if (ps === 'playing' || ps === 'loading') return;
			const t = this.player.currentTime?.() ?? 0;
			void this.player.currentTime?.(t + (1 / 30));
		});
	}

	/** Show current time / remaining time as an OSD message. */
	protected addShowTimeKey(): void {
		this.bind('t', () => {
			const cur = this.player.currentTime?.() ?? 0;
			const dur = this.player.duration?.() ?? 0;
			const remaining = Math.max(0, dur - cur);
			this.message(`${fmtTime(cur)} / -${fmtTime(remaining)}`);
		});
	}

	/** Subtitle font-size events — UI plugins listen on `subtitle-size-up/down`. */
	protected addSubtitleSizeKeys(): void {
		const emit = (name: 'subtitle-size-up' | 'subtitle-size-down'): void => {
			try { this.player.emit(name, undefined); }
			catch { /* swallow */ }
		};
		this.bind('+', () => emit('subtitle-size-up'));
		this.bind('shift++', () => emit('subtitle-size-up'));
		this.bind('-', () => emit('subtitle-size-down'));
	}

	protected addAspectRatioKeys(): void {
		this.bind('a', () => { void this.player.cycleAspectRatio?.(); });
		this.bind('BrowserFavorites', () => { void this.player.cycleAspectRatio?.(); });
	}

	protected addStopKey(): void {
		this.bind('s', () => { void this.player.stop?.(); });
	}

	/** `?` — fires `plugin:desktop-ui:shortcuts-toggle` so the desktop UI overlay can open/close. */
	protected addHelpKey(): void {
		this.bind('?', () => {
			try {
				this.player.emit('plugin:desktop-ui:shortcuts-toggle', undefined);
			} catch { /* desktop-ui not mounted — no-op */ }
		});
	}
}

export const keyHandlerPlugin = KeyHandlerPlugin;
