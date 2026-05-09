import { KeyHandlerPlugin as BaseKeyHandler } from '@nomercy-entertainment/nomercy-player-core/plugins/key-handler';
import type { NMVideoPlayer } from '../index';

interface VideoSurface {
	play?: () => unknown;
	pause?: () => unknown;
	stop?: () => unknown;
	togglePlayback?: () => unknown;
	next?: () => unknown;
	previous?: () => unknown;
	rewind?: (seconds?: number) => unknown;
	forward?: (seconds?: number) => unknown;
	volumeUp?: (step?: number) => unknown;
	volumeDown?: (step?: number) => unknown;
	toggleMute?: () => unknown;
	toggleFullscreen?: () => unknown;
	cycleSubtitles?: () => unknown;
	cycleAudioTracks?: () => unknown;
	cycleAspectRatio?: () => unknown;
	nextChapter?: (opts?: unknown) => unknown;
	previousChapter?: (opts?: unknown) => unknown;
	playbackRate?: { (): number; (rate: number): void };
	playbackRates?: () => number[];
	currentTime?: { (): number; (t: number, opts?: unknown): Promise<void> };
	duration?: () => number;
	playState?: () => string;
	fullscreenState?: { (): unknown; (s: boolean): void };
	isTv?: () => boolean;
	isMobile?: () => boolean;
	displayMessage?: (text: string, ms?: number) => void;
	emit?: (event: string, payload?: unknown) => void;
	options?: { disableMediaControls?: boolean; disableControls?: boolean };
}

const fmtTime = (s: number): string => {
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = Math.floor(s % 60);
	return h > 0
		? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
		: `${m}:${String(sec).padStart(2, '0')}`;
};

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

	protected get surface(): VideoSurface {
		return this.player as unknown as VideoSurface;
	}

	protected mediaControlsAllowed(): boolean {
		return !this.surface.options?.disableMediaControls;
	}

	/** Best-effort OSD message — calls `player.displayMessage(...)` if present, also emits `display-message`. */
	protected message(text: string): void {
		try { this.surface.displayMessage?.(text); }
		catch { /* swallow */ }
		try { this.surface.emit?.('display-message', { text }); }
		catch { /* swallow */ }
	}

	protected override addDefaults(): void {
		// `disableControls` skips the entire registration (matches v1).
		if (this.surface.options?.disableControls) return;
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
	}

	protected override defaultBindings(): void {
		this.addDefaults();
	}

	protected override addPlaybackKeys(): void {
		const s = (): VideoSurface => this.surface;
		this.bind(' ', () => { void s().togglePlayback?.(); });
		// Hardware media keys — gated by disableMediaControls per v1.
		this.bind('MediaPlay', () => { if (this.mediaControlsAllowed()) void s().play?.(); });
		this.bind('MediaPause', () => { if (this.mediaControlsAllowed()) void s().pause?.(); });
		this.bind('MediaPlayPause', () => { if (this.mediaControlsAllowed()) void s().togglePlayback?.(); });
		this.bind('MediaStop', () => { if (this.mediaControlsAllowed()) void s().stop?.(); });
		this.bind('MediaRewind', () => { if (this.mediaControlsAllowed()) void s().rewind?.(); });
		this.bind('MediaFastForward', () => { if (this.mediaControlsAllowed()) void s().forward?.(); });
	}

	protected override addNavigationKeys(): void {
		const s = (): VideoSurface => this.surface;
		// Plain arrow seek — only off-TV (TV reserves arrows for focus nav).
		this.bind('ArrowLeft', () => { if (!s().isTv?.()) void s().rewind?.(); });
		this.bind('ArrowRight', () => { if (!s().isTv?.()) void s().forward?.(); });
	}

	protected override addVolumeKeys(): void {
		const s = (): VideoSurface => this.surface;
		// Volume — only on desktop (TV + mobile have hardware controls).
		this.bind('ArrowUp', () => {
			if (!s().isTv?.() && !s().isMobile?.()) void s().volumeUp?.();
		});
		this.bind('ArrowDown', () => {
			if (!s().isTv?.() && !s().isMobile?.()) void s().volumeDown?.();
		});
		this.bind('m', () => { void s().toggleMute?.(); });
	}

	protected override addMediaKeys(): void {
		const s = (): VideoSurface => this.surface;
		// Subtitle / Audio media keys + numeric and letter aliases.
		this.bind('Subtitle', () => { void s().cycleSubtitles?.(); });
		this.bind('5', () => { void s().cycleSubtitles?.(); });
		this.bind('v', () => { void s().cycleSubtitles?.(); });
		this.bind('Audio', () => { void s().cycleAudioTracks?.(); });
		this.bind('2', () => { void s().cycleAudioTracks?.(); });
		this.bind('b', () => { void s().cycleAudioTracks?.(); });
	}

	/** VLC-style modifier seeks: shift = ±3s, alt = ±10s, ctrl = ±60s. */
	protected addModifierSeekKeys(): void {
		const s = (): VideoSurface => this.surface;
		const seek = (delta: number): void => {
			if (delta > 0) void s().forward?.(delta);
			else void s().rewind?.(Math.abs(delta));
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
		const s = (): VideoSurface => this.surface;
		this.bind('1', () => { void s().forward?.(120); });
		this.bind('3', () => { void s().forward?.(30); });
		this.bind('6', () => { void s().forward?.(60); });
		this.bind('9', () => { void s().forward?.(90); });
		this.bind('ColorF0Red', () => { void s().forward?.(30); });
		this.bind('ColorF1Green', () => { void s().forward?.(60); });
		this.bind('ColorF2Yellow', () => { void s().forward?.(90); });
		this.bind('ColorF3Blue', () => { void s().forward?.(120); });
	}

	protected addNextPrevKeys(): void {
		const s = (): VideoSurface => this.surface;
		this.bind('MediaTrackNext', () => { if (this.mediaControlsAllowed()) void s().next?.(); });
		this.bind('MediaTrackPrevious', () => { if (this.mediaControlsAllowed()) void s().previous?.(); });
		this.bind('n', () => { void s().next?.(); });
		this.bind('p', () => { void s().previous?.(); });
	}

	/** Chapter cycling — Shift+N forward, Shift+P backward (matches v1). */
	protected addChapterKeys(): void {
		const s = (): VideoSurface => this.surface;
		this.bind('shift+n', () => { void s().nextChapter?.(); });
		this.bind('shift+p', () => { void s().previousChapter?.(); });
	}

	protected addFullscreenKeys(): void {
		const s = (): VideoSurface => this.surface;
		this.bind('f', () => { void s().toggleFullscreen?.(); });
		this.bind('F11', () => { void s().toggleFullscreen?.(); });
		this.bind('Escape', () => {
			const surface = s();
			// Only exit fullscreen if currently in it — don't swallow Escape unconditionally.
			const state = surface.fullscreenState?.();
			const inFs = state === 'on' || state === true;
			if (inFs) surface.fullscreenState?.(false);
		});
	}

	/** VLC-style speed: `]` faster, `[` slower, `=` reset to 1x. */
	protected addSpeedKeys(): void {
		const s = (): VideoSurface => this.surface;
		const setRate = (rate: number): void => {
			const surface = s();
			if (typeof surface.playbackRate === 'function') (surface.playbackRate as (r: number) => void)(rate);
			this.message(`${rate}x`);
		};
		const currentRate = (): number => {
			const surface = s();
			return typeof surface.playbackRate === 'function' ? (surface.playbackRate as () => number)() ?? 1 : 1;
		};
		this.bind(']', () => {
			const surface = s();
			const rates = surface.playbackRates?.() ?? [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
			const cur = currentRate();
			const idx = rates.indexOf(cur);
			if (idx >= 0 && idx < rates.length - 1) setRate(rates[idx + 1]!);
		});
		this.bind('[', () => {
			const surface = s();
			const rates = surface.playbackRates?.() ?? [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
			const cur = currentRate();
			const idx = rates.indexOf(cur);
			if (idx > 0) setRate(rates[idx - 1]!);
		});
		this.bind('=', () => setRate(1));
	}

	/** Frame-advance ('e') — only when paused, advance ~1 frame at 30fps (v1 parity). */
	protected addFrameAdvanceKey(): void {
		const s = (): VideoSurface => this.surface;
		this.bind('e', () => {
			const surface = s();
			if (typeof surface.currentTime !== 'function') return;
			// v1 only advanced when paused — don't seek forward during active playback.
			const ps = surface.playState?.();
			if (ps === 'playing' || ps === 'loading') return;
			const t = (surface.currentTime as () => number)();
			void (surface.currentTime as (t: number) => Promise<void>)(t + (1 / 30));
		});
	}

	/** Show current time / remaining time as an OSD message. */
	protected addShowTimeKey(): void {
		const s = (): VideoSurface => this.surface;
		this.bind('t', () => {
			const surface = s();
			if (typeof surface.currentTime !== 'function' || typeof surface.duration !== 'function') return;
			const cur = (surface.currentTime as () => number)();
			const dur = surface.duration();
			const remaining = Math.max(0, dur - cur);
			this.message(`${fmtTime(cur)} / -${fmtTime(remaining)}`);
		});
	}

	/** Subtitle font-size events — UI plugins listen on `subtitle-size-up/down`. */
	protected addSubtitleSizeKeys(): void {
		const s = (): VideoSurface => this.surface;
		const emit = (name: 'subtitle-size-up' | 'subtitle-size-down'): void => {
			try { s().emit?.(name); }
			catch { /* swallow */ }
		};
		this.bind('+', () => emit('subtitle-size-up'));
		this.bind('shift++', () => emit('subtitle-size-up'));
		this.bind('-', () => emit('subtitle-size-down'));
	}

	protected addAspectRatioKeys(): void {
		const s = (): VideoSurface => this.surface;
		this.bind('a', () => { void s().cycleAspectRatio?.(); });
		this.bind('BrowserFavorites', () => { void s().cycleAspectRatio?.(); });
	}

	protected addStopKey(): void {
		const s = (): VideoSurface => this.surface;
		this.bind('s', () => { void s().stop?.(); });
	}
}

export const keyHandlerPlugin = KeyHandlerPlugin;
