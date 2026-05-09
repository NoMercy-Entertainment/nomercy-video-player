/**
 * Smoke tests for video-specific plugins:
 *   - SkipperPlugin (registers, no-throw use(), empty list when item lacks data)
 *   - KeyHandlerPlugin (subclass extends parent + adds video keys)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NMVideoPlayer } from '../../index';
import { SkipperPlugin, skipperPlugin } from '../../plugins/skipper';
import { KeyHandlerPlugin } from '../../plugins/key-handler';

describe('video-plugins', () => {
	beforeEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	const setup = () => new NMVideoPlayer('test').setup({});

	describe('SkipperPlugin', () => {
		it('registers without throwing and use() succeeds', async () => {
			const p = setup();
			expect(() => p.addPlugin(skipperPlugin)).not.toThrow();
			await p.ready();
			const inst = p.getPlugin(SkipperPlugin);
			expect(inst).toBeDefined();
		});

		it('skippers() returns [] when current item has no skipper data', async () => {
			const p = setup();
			p.addPlugin(skipperPlugin);
			await p.ready();
			const inst = p.getPlugin(SkipperPlugin)!;
			expect(inst.skippers()).toEqual([]);
		});
	});

	describe('KeyHandlerPlugin (video)', () => {
		it('registers full v1-parity binding set', async () => {
			const p = setup();
			p.addPlugin(KeyHandlerPlugin);
			await p.ready();
			const inst = p.getPlugin(KeyHandlerPlugin)!;
			const bindings = inst.bindings();
			// Playback
			expect(bindings.has(' ')).toBe(true);
			expect(bindings.has('s')).toBe(true);
			expect(bindings.has('MediaPlay')).toBe(true);
			expect(bindings.has('MediaPause')).toBe(true);
			expect(bindings.has('MediaPlayPause')).toBe(true);
			expect(bindings.has('MediaStop')).toBe(true);
			// Navigation — plain arrows preserved (multi-char keys not lower-cased)
			expect(bindings.has('ArrowLeft')).toBe(true);
			expect(bindings.has('ArrowRight')).toBe(true);
			expect(bindings.has('ArrowUp')).toBe(true);
			expect(bindings.has('ArrowDown')).toBe(true);
			expect(bindings.has('arrowleft')).toBe(false);
			// Modifier-aware seeks (VLC-style)
			expect(bindings.has('shift+ArrowLeft')).toBe(true);
			expect(bindings.has('shift+ArrowRight')).toBe(true);
			expect(bindings.has('alt+ArrowLeft')).toBe(true);
			expect(bindings.has('alt+ArrowRight')).toBe(true);
			expect(bindings.has('ctrl+ArrowLeft')).toBe(true);
			expect(bindings.has('ctrl+ArrowRight')).toBe(true);
			// Quick-skip + TV color buttons
			expect(bindings.has('1')).toBe(true);
			expect(bindings.has('3')).toBe(true);
			expect(bindings.has('6')).toBe(true);
			expect(bindings.has('9')).toBe(true);
			expect(bindings.has('ColorF0Red')).toBe(true);
			expect(bindings.has('ColorF1Green')).toBe(true);
			expect(bindings.has('ColorF2Yellow')).toBe(true);
			expect(bindings.has('ColorF3Blue')).toBe(true);
			// Subs / audio cycling
			expect(bindings.has('Subtitle')).toBe(true);
			expect(bindings.has('Audio')).toBe(true);
			expect(bindings.has('5')).toBe(true);
			expect(bindings.has('2')).toBe(true);
			expect(bindings.has('v')).toBe(true);
			expect(bindings.has('b')).toBe(true);
			// Next / previous + chapter (Shift+N/P matches v1)
			expect(bindings.has('n')).toBe(true);
			expect(bindings.has('p')).toBe(true);
			expect(bindings.has('MediaTrackNext')).toBe(true);
			expect(bindings.has('MediaTrackPrevious')).toBe(true);
			expect(bindings.has('shift+n')).toBe(true);
			expect(bindings.has('shift+p')).toBe(true);
			// Fullscreen
			expect(bindings.has('f')).toBe(true);
			expect(bindings.has('F11')).toBe(true);
			expect(bindings.has('Escape')).toBe(true);
			// VLC speed
			expect(bindings.has(']')).toBe(true);
			expect(bindings.has('[')).toBe(true);
			expect(bindings.has('=')).toBe(true);
			// Frame advance + show time
			expect(bindings.has('e')).toBe(true);
			expect(bindings.has('t')).toBe(true);
			// Subtitle font size
			expect(bindings.has('+')).toBe(true);
			expect(bindings.has('-')).toBe(true);
			// Aspect ratio
			expect(bindings.has('a')).toBe(true);
			expect(bindings.has('BrowserFavorites')).toBe(true);
			// Volume + mute
			expect(bindings.has('m')).toBe(true);
		});

		it('fires the right method when keys dispatch — covers modifiers, media keys, TV color buttons', async () => {
			const p = setup();
			p.addPlugin(KeyHandlerPlugin);
			await p.ready();

			// Stub player methods we want to assert against.
			const stubs = {
				togglePlayback: vi.fn(),
				stop: vi.fn(),
				forward: vi.fn(),
				rewind: vi.fn(),
				next: vi.fn(),
				previous: vi.fn(),
				cycleSubtitles: vi.fn(),
				cycleAudioTracks: vi.fn(),
				cycleAspectRatio: vi.fn(),
				toggleFullscreen: vi.fn(),
				toggleMute: vi.fn(),
				nextChapter: vi.fn(),
				previousChapter: vi.fn(),
			};
			Object.assign(p as object, stubs);
			// Force isTv/isMobile false so plain arrows route through.
			Object.assign(p as object, { isTv: () => false, isMobile: () => false });

			// Use `unknown` to break the strict NMVideoPlayer typing for stubs.
			const fire = (init: KeyboardEventInit): void => {
				document.dispatchEvent(new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true }));
				// Cooldown is 300ms — push past it for the next dispatch.
				vi.advanceTimersByTime?.(310);
			};

			vi.useFakeTimers();
			try {
				fire({ key: ' ' });
				expect(stubs.togglePlayback).toHaveBeenCalledTimes(1);

				fire({ key: 's' });
				expect(stubs.stop).toHaveBeenCalledTimes(1);

				fire({ key: 'ArrowRight' });
				expect(stubs.forward).toHaveBeenCalledTimes(1);
				expect(stubs.forward).toHaveBeenLastCalledWith();

				fire({ key: 'ArrowRight', shiftKey: true });
				expect(stubs.forward).toHaveBeenLastCalledWith(3);

				fire({ key: 'ArrowLeft', altKey: true });
				expect(stubs.rewind).toHaveBeenLastCalledWith(10);

				fire({ key: 'ArrowRight', ctrlKey: true });
				expect(stubs.forward).toHaveBeenLastCalledWith(60);

				fire({ key: '3' });
				expect(stubs.forward).toHaveBeenLastCalledWith(30);

				fire({ key: 'ColorF3Blue' });
				expect(stubs.forward).toHaveBeenLastCalledWith(120);

				fire({ key: 'MediaPlayPause' });
				expect(stubs.togglePlayback).toHaveBeenCalledTimes(2);

				fire({ key: 'v' });
				expect(stubs.cycleSubtitles).toHaveBeenCalledTimes(1);

				fire({ key: 'a' });
				expect(stubs.cycleAspectRatio).toHaveBeenCalledTimes(1);

				fire({ key: 'f' });
				expect(stubs.toggleFullscreen).toHaveBeenCalledTimes(1);

				fire({ key: 'm' });
				expect(stubs.toggleMute).toHaveBeenCalledTimes(1);

				fire({ key: 'n' });
				expect(stubs.next).toHaveBeenCalledTimes(1);

				fire({ key: 'P', shiftKey: true });
				expect(stubs.previousChapter).toHaveBeenCalledTimes(1);
				expect(stubs.previous).not.toHaveBeenCalled();
			}
			finally {
				vi.useRealTimers();
			}
		});

		it('plain arrow keys are gated on isTv() — TV uses arrows for focus nav', async () => {
			const p = setup();
			Object.assign(p as object, { isTv: () => true, rewind: vi.fn(), forward: vi.fn() });
			p.addPlugin(KeyHandlerPlugin);
			await p.ready();

			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
			expect((p as unknown as { rewind: ReturnType<typeof vi.fn> }).rewind).not.toHaveBeenCalled();
			expect((p as unknown as { forward: ReturnType<typeof vi.fn> }).forward).not.toHaveBeenCalled();
		});

		it('disableControls option skips entire registration', async () => {
			const p = new NMVideoPlayer('test').setup({ disableControls: true } as unknown as Parameters<NMVideoPlayer['setup']>[0]);
			p.addPlugin(KeyHandlerPlugin);
			await p.ready();
			const inst = p.getPlugin(KeyHandlerPlugin)!;
			expect(inst.bindings().size).toBe(0);
		});

		it('frame-advance does NOT fire while playing', async () => {
			const p = setup();
			const seek = vi.fn();
			Object.assign(p as object, {
				playState: () => 'playing',
				currentTime: Object.assign(seek, { call: seek }),
			});
			// Replace currentTime with an overloaded stub.
			(p as unknown as { currentTime: unknown }).currentTime = ((t?: number): number | void => {
				if (typeof t === 'number') seek(t);
				return 0;
			}) as unknown;
			p.addPlugin(KeyHandlerPlugin);
			await p.ready();
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
			expect(seek).not.toHaveBeenCalled();
		});
	});
});
