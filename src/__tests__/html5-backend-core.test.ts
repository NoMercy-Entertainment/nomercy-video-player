// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Html5VideoBackend — core behaviour tests.
 *
 * Covers: element event bridging, transport methods, volume, buffered(),
 * state(), audioTracks/setAudioTrack (HLS + native), subtitleTracks,
 * setSubtitleTrack (cuechange / detach / HLS path), qualityLevels,
 * setQuality, currentLevel, pauseLoader / resumeLoader, captureStream /
 * setSinkId / getSinkId / setMediaKeys / mediaKeys / outputProtectionState,
 * dispose (element removal + listener teardown), unload, HDR constraint
 * helpers, HLS error-recovery paths, _attachHlsLevelSwitchedHandler,
 * and the cue-normalisation helper (normaliseVttCue).
 *
 * The desktop-UI / DRM / subtitle-overlay / key-handler / tv-key-handler /
 * live-transcoding plugins are covered by the parallel desktop-ui cluster
 * agent — do NOT add those here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Html5VideoBackend } from '../adapters/video-backend/html5';
import { HTTP_STATUS_RETRY_LIMIT, SOURCE_OUTAGE_BACKOFF_MS } from '../adapters/video-backend/source-outage';

// ---------------------------------------------------------------------------
// hls.js mock — defined INSIDE vi.mock factory (hoisted to top of file).
// A module-level registry lets tests retrieve the last FakeHls instance.
// ---------------------------------------------------------------------------

/**
 * Registry exported so tests can call `getFakeHls()` after `vi.mock` runs.
 * Populated by each FakeHls constructor call.
 */
const _hlsRegistry: {
	lastInstance: FakeHlsInstance | undefined;
	lastConfig: Record<string, unknown> | undefined;
} = { lastInstance: undefined, lastConfig: undefined };

type HlsListener = (event: string, data: unknown) => void;

interface FakeHlsInstance {
	levels: unknown[];
	audioTracks: unknown[];
	subtitleTracks: unknown[];
	audioTrack: number;
	subtitleTrack: number;
	currentLevel: number;
	loadLevel: number;
	nextLevel: number;
	autoLevelCapping: number;
	bandwidthEstimate: number;
	on(event: string, fn: HlsListener): void;
	fire(event: string, data?: unknown): void;
	attachMedia(el: HTMLVideoElement): void;
	loadSource(url: string): void;
	detachMedia(): void;
	destroy(): void;
	startLoad(): void;
	stopLoad(): void;
	recoverMediaError(): void;
	_listeners: Map<string, HlsListener[]>;
}

vi.mock('hls.js', () => {
	class FakeHls {
		levels: unknown[] = [];
		audioTracks: unknown[] = [];
		subtitleTracks: unknown[] = [];
		audioTrack = 0;
		subtitleTrack = -1;
		currentLevel = -1;
		loadLevel = -1;
		nextLevel = -1;
		autoLevelCapping = -1;
		bandwidthEstimate = 0;
		_listeners = new Map<string, HlsListener[]>();

		static isSupported = (): boolean => true;
		static Events: Record<string, string> = {
			MANIFEST_PARSED: 'hlsManifestParsed',
			ERROR: 'hlsError',
			FRAG_LOADED: 'hlsFragLoaded',
			LEVEL_SWITCHED: 'hlsLevelSwitched',
			FRAG_CHANGED: 'hlsFragChanged',
			AUDIO_TRACKS_UPDATED: 'hlsAudioTracksUpdated',
		};

		static ErrorTypes: Record<string, string> = {
			NETWORK_ERROR: 'networkError',
			MEDIA_ERROR: 'mediaError',
		};

		constructor(config?: Record<string, unknown>) {
			_hlsRegistry.lastConfig = config;
			_hlsRegistry.lastInstance = this as unknown as FakeHlsInstance;
		}

		on(event: string, fn: HlsListener): void {
			if (!this._listeners.has(event))
				this._listeners.set(event, []);
			this._listeners.get(event)!.push(fn);
		}

		fire(event: string, data: unknown = {}): void {
			for (const fn of this._listeners.get(event) ?? []) {
				fn(event, data);
			}
		}

		attachMedia(_el: HTMLVideoElement): void { /* stub */ }
		loadSource(_url: string): void { /* stub */ }
		detachMedia(): void { /* stub */ }
		destroy(): void { /* stub */ }
		startLoad(): void { /* stub */ }
		stopLoad(): void { /* stub */ }
		recoverMediaError(): void { /* stub */ }
	}
	return { default: FakeHls };
});

// ---------------------------------------------------------------------------
// Helper — fire loadedmetadata on the <video> element inside `container`
// ---------------------------------------------------------------------------

async function flushMicrotasks(iterations = 10): Promise<void> {
	for (let i = 0; i < iterations; i++) {
		await new Promise<void>(resolve => setTimeout(resolve, 0));
	}
}

// ---------------------------------------------------------------------------
// Shared setup / teardown
// ---------------------------------------------------------------------------

let container: HTMLDivElement;
let backend: Html5VideoBackend;

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	backend = new Html5VideoBackend(container);
	_hlsRegistry.lastInstance = undefined;
	_hlsRegistry.lastConfig = undefined;
});

afterEach(() => {
	try { backend.dispose(); }
	catch { /* defensive */ }
	document.body.innerHTML = '';
	vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('constructor', () => {
	it('creates a <video> element inside the container', () => {
		expect(container.querySelector('video')).not.toBeNull();
	});

	it('reuses an existing <video> element found in the container', () => {
		const div = document.createElement('div');
		const existing = document.createElement('video');
		div.appendChild(existing);
		const backend2 = new Html5VideoBackend(div);
		expect(div.querySelectorAll('video')).toHaveLength(1);
		backend2.dispose();
	});

	it('kind is "html5"', () => {
		expect(backend.kind).toBe('html5');
	});

	it('dispose removes the owned <video> element from the DOM', () => {
		backend.dispose();
		expect(container.querySelector('video')).toBeNull();
		backend = new Html5VideoBackend(container);
	});

	it('dispose does NOT remove a pre-existing <video> element', () => {
		const div = document.createElement('div');
		const existing = document.createElement('video');
		div.appendChild(existing);
		document.body.appendChild(div);
		const backend2 = new Html5VideoBackend(div);
		backend2.dispose();
		expect(div.querySelector('video')).toBe(existing);
		div.remove();
	});
});

// ---------------------------------------------------------------------------
// mediaElement()
// ---------------------------------------------------------------------------

describe('mediaElement()', () => {
	it('returns the HTMLVideoElement', () => {
		const el = backend.mediaElement();
		expect(el).toBeInstanceOf(HTMLVideoElement);
		expect(el).toBe(container.querySelector('video'));
	});
});

// ---------------------------------------------------------------------------
// Element event bridging
// ---------------------------------------------------------------------------

describe('element event bridging', () => {
	it('bridges play event from element to backend emitter', () => {
		const received: unknown[] = [];
		backend.on('play', event => received.push(event));
		container.querySelector('video')!.dispatchEvent(new Event('play'));
		expect(received).toHaveLength(1);
	});

	it('bridges pause event', () => {
		const received: unknown[] = [];
		backend.on('pause', event => received.push(event));
		container.querySelector('video')!.dispatchEvent(new Event('pause'));
		expect(received).toHaveLength(1);
	});

	it('bridges timeupdate event', () => {
		const received: unknown[] = [];
		backend.on('timeupdate', event => received.push(event));
		container.querySelector('video')!.dispatchEvent(new Event('timeupdate'));
		expect(received).toHaveLength(1);
	});

	it('bridges ended event and sets _ended flag so state() returns correct value', () => {
		const received: unknown[] = [];
		backend.on('ended', event => received.push(event));
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		videoEl.dispatchEvent(new Event('ended'));
		expect(received).toHaveLength(1);
	});

	it('bridges waiting event', () => {
		const received: unknown[] = [];
		backend.on('waiting', event => received.push(event));
		container.querySelector('video')!.dispatchEvent(new Event('waiting'));
		expect(received).toHaveLength(1);
	});

	it('bridges canplay event', () => {
		const received: unknown[] = [];
		backend.on('canplay', event => received.push(event));
		container.querySelector('video')!.dispatchEvent(new Event('canplay'));
		expect(received).toHaveLength(1);
	});

	it('bridges stalled event', () => {
		const received: unknown[] = [];
		backend.on('stalled', event => received.push(event));
		container.querySelector('video')!.dispatchEvent(new Event('stalled'));
		expect(received).toHaveLength(1);
	});

	it('bridges ratechange event', () => {
		const received: unknown[] = [];
		backend.on('ratechange', event => received.push(event));
		container.querySelector('video')!.dispatchEvent(new Event('ratechange'));
		expect(received).toHaveLength(1);
	});

	it('bridges resize event', () => {
		const received: unknown[] = [];
		backend.on('resize', event => received.push(event));
		container.querySelector('video')!.dispatchEvent(new Event('resize'));
		expect(received).toHaveLength(1);
	});

	it('bridges loadeddata event', () => {
		const received: unknown[] = [];
		backend.on('loadeddata', event => received.push(event));
		container.querySelector('video')!.dispatchEvent(new Event('loadeddata'));
		expect(received).toHaveLength(1);
	});

	it('bridges emptied event', () => {
		const received: unknown[] = [];
		backend.on('emptied', event => received.push(event));
		container.querySelector('video')!.dispatchEvent(new Event('emptied'));
		expect(received).toHaveLength(1);
	});

	it('bridges playing event', () => {
		const received: unknown[] = [];
		backend.on('playing', event => received.push(event));
		container.querySelector('video')!.dispatchEvent(new Event('playing'));
		expect(received).toHaveLength(1);
	});

	it('bridges encrypted event', () => {
		const received: unknown[] = [];
		backend.on('encrypted', event => received.push(event));
		container.querySelector('video')!.dispatchEvent(new Event('encrypted'));
		expect(received).toHaveLength(1);
	});

	it('bridges error event and sets _hadError flag', () => {
		const received: unknown[] = [];
		backend.on('error', event => received.push(event));
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'error', {
			get: () => ({ code: 2, message: 'network error' }),
			configurable: true,
		});
		videoEl.dispatchEvent(new Event('error'));
		expect(received).toHaveLength(1);
		const ev = received[0] as Event & { v2ErrorCode?: string; mediaErrorCode?: number };
		expect(ev.mediaErrorCode).toBe(2);
		expect(ev.v2ErrorCode).toBe('media/network');
	});

	it('maps MediaError code 1 → media/aborted', () => {
		const received: Array<Event & { v2ErrorCode?: string }> = [];
		backend.on('error', event => received.push(event as Event & { v2ErrorCode?: string }));
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'error', {
			get: () => ({ code: 1 }),
			configurable: true,
		});
		videoEl.dispatchEvent(new Event('error'));
		expect(received[0]?.v2ErrorCode).toBe('media/aborted');
	});

	it('maps MediaError code 3 → media/decode-fatal-variant', () => {
		const received: Array<Event & { v2ErrorCode?: string }> = [];
		backend.on('error', event => received.push(event as Event & { v2ErrorCode?: string }));
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'error', {
			get: () => ({ code: 3 }),
			configurable: true,
		});
		videoEl.dispatchEvent(new Event('error'));
		expect(received[0]?.v2ErrorCode).toBe('media/decode-fatal-variant');
	});

	it('maps MediaError code 4 → media/decode-fatal-all (default branch)', () => {
		const received: Array<Event & { v2ErrorCode?: string }> = [];
		backend.on('error', event => received.push(event as Event & { v2ErrorCode?: string }));
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'error', {
			get: () => ({ code: 4 }),
			configurable: true,
		});
		videoEl.dispatchEvent(new Event('error'));
		expect(received[0]?.v2ErrorCode).toBe('media/decode-fatal-all');
	});

	it('error event without element.error does not throw', () => {
		backend.on('error', () => undefined);
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'error', { get: () => null, configurable: true });
		expect(() => videoEl.dispatchEvent(new Event('error'))).not.toThrow();
	});

	it('dispose removes element listeners — further element events do not reach backend', () => {
		const received: unknown[] = [];
		backend.on('play', event => received.push(event));
		backend.dispose();
		container.appendChild(document.createElement('div'));
		backend = new Html5VideoBackend(container);
	});
});

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

describe('transport', () => {
	it('play() calls element.play()', async () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		const spy = vi.spyOn(videoEl, 'play').mockResolvedValue(undefined);
		await backend.play();
		expect(spy).toHaveBeenCalledOnce();
	});

	it('pause() calls element.pause()', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		const spy = vi.spyOn(videoEl, 'pause');
		backend.pause();
		expect(spy).toHaveBeenCalledOnce();
	});

	it('stop() pauses and resets currentTime to 0', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		const pauseSpy = vi.spyOn(videoEl, 'pause');
		backend.stop();
		expect(pauseSpy).toHaveBeenCalledOnce();
		expect(videoEl.currentTime).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Time / position
// ---------------------------------------------------------------------------

describe('currentTime()', () => {
	it('getter returns element.currentTime', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'currentTime', { value: 45, configurable: true, writable: true });
		expect(backend.currentTime()).toBe(45);
	});

	it('setter sets element.currentTime', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		backend.currentTime(30);
		expect(videoEl.currentTime).toBe(30);
	});
});

describe('duration()', () => {
	it('returns element.duration when finite', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'duration', { value: 120, configurable: true });
		expect(backend.duration()).toBe(120);
	});

	it('returns 0 when duration is Infinity', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'duration', { value: Infinity, configurable: true });
		expect(backend.duration()).toBe(0);
	});

	it('returns 0 when duration is NaN', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'duration', { value: Number.NaN, configurable: true });
		expect(backend.duration()).toBe(0);
	});
});

describe('playbackRate()', () => {
	it('getter returns element.playbackRate', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'playbackRate', { value: 1.5, configurable: true, writable: true });
		expect(backend.playbackRate()).toBe(1.5);
	});

	it('setter sets element.playbackRate', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		backend.playbackRate(2);
		expect(videoEl.playbackRate).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// Buffered
// ---------------------------------------------------------------------------

describe('buffered()', () => {
	function makeTimeRanges(pairs: Array<[number, number]>): TimeRanges {
		return {
			length: pairs.length,
			start: (i: number) => pairs[i]![0],
			end: (i: number) => pairs[i]![1],
		} as unknown as TimeRanges;
	}

	it('returns the end of the range that contains currentTime', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'currentTime', { value: 30, configurable: true, writable: true });
		Object.defineProperty(videoEl, 'buffered', { value: makeTimeRanges([[0, 60]]), configurable: true });
		expect(backend.buffered()).toBe(60);
	});

	it('returns end of last range when currentTime is not inside any range', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'currentTime', { value: 90, configurable: true, writable: true });
		Object.defineProperty(videoEl, 'buffered', { value: makeTimeRanges([[0, 60]]), configurable: true });
		expect(backend.buffered()).toBe(60);
	});

	it('returns 0 when buffered is empty', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'currentTime', { value: 0, configurable: true, writable: true });
		Object.defineProperty(videoEl, 'buffered', { value: makeTimeRanges([]), configurable: true });
		expect(backend.buffered()).toBe(0);
	});

	it('returns the playhead (not a far range end) when currentTime is in a gap between ranges', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'currentTime', { value: 50, configurable: true, writable: true });
		Object.defineProperty(videoEl, 'buffered', { value: makeTimeRanges([[0, 10], [100, 110]]), configurable: true });
		expect(backend.buffered()).toBe(50);
	});

	it('bufferedRanges() returns element.buffered', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		const ranges = makeTimeRanges([[0, 60]]);
		Object.defineProperty(videoEl, 'buffered', { value: ranges, configurable: true });
		expect(backend.bufferedRanges()).toBe(ranges);
	});

	it('seekable() returns element.seekable', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		const ranges = makeTimeRanges([[0, 120]]);
		Object.defineProperty(videoEl, 'seekable', { value: ranges, configurable: true });
		expect(backend.seekable()).toBe(ranges);
	});
});

// ---------------------------------------------------------------------------
// Volume
// ---------------------------------------------------------------------------

describe('volume()', () => {
	it('getter returns element.volume', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'volume', { value: 0.8, configurable: true, writable: true });
		expect(backend.volume()).toBe(0.8);
	});

	it('setter clamps 0 and applies perceptualGain curve', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		backend.volume(0);
		expect(videoEl.volume).toBe(0);
	});

	it('setter clamps values above 1', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		backend.volume(2);
		expect(videoEl.volume).toBeGreaterThan(0);
		expect(videoEl.volume).toBeLessThanOrEqual(1);
	});

	it('mute() sets element.muted = true', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		backend.mute();
		expect(videoEl.muted).toBe(true);
	});

	it('unmute() sets element.muted = false', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		backend.mute();
		backend.unmute();
		expect(videoEl.muted).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Video dimensions
// ---------------------------------------------------------------------------

describe('videoWidth() / videoHeight()', () => {
	it('returns element.videoWidth', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'videoWidth', { value: 1920, configurable: true });
		expect(backend.videoWidth()).toBe(1920);
	});

	it('returns element.videoHeight', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'videoHeight', { value: 1080, configurable: true });
		expect(backend.videoHeight()).toBe(1080);
	});
});

// ---------------------------------------------------------------------------
// state()
// ---------------------------------------------------------------------------

describe('state()', () => {
	it('returns "idle" initially (no url loaded)', () => {
		expect(backend.state()).toBe('idle');
	});

	it('returns "error" after the error flag is set', async () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'error', { get: () => ({ code: 2 }), configurable: true });
		videoEl.dispatchEvent(new Event('error'));
		expect(backend.state()).toBe('error');
	});

	it('returns "playing" when not paused and not ended', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		Object.defineProperty(videoEl, 'paused', { value: false, configurable: true });
		Object.defineProperty(videoEl, 'ended', { value: false, configurable: true });
		expect(backend.state()).toBe('playing');
	});
});

// ---------------------------------------------------------------------------
// Loader controls
// ---------------------------------------------------------------------------

describe('loader controls', () => {
	it('loaderState() returns "running" by default', () => {
		expect(backend.loaderState()).toBe('running');
	});

	it('pauseLoader() sets loaderState to "paused" (no HLS)', () => {
		backend.pauseLoader();
		expect(backend.loaderState()).toBe('paused');
	});

	it('resumeLoader() sets loaderState to "running"', () => {
		backend.pauseLoader();
		backend.resumeLoader();
		expect(backend.loaderState()).toBe('running');
	});

	it('pauseLoader() calls hls.stopLoad() when HLS is active', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		const hlsInst = _hlsRegistry.lastInstance!;
		const stopSpy = vi.spyOn(hlsInst, 'stopLoad');
		backend.pauseLoader();
		expect(stopSpy).toHaveBeenCalledOnce();
	});

	it('resumeLoader() calls hls.startLoad() when HLS is active', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		const hlsInst = _hlsRegistry.lastInstance!;
		const startSpy = vi.spyOn(hlsInst, 'startLoad');
		backend.resumeLoader();
		expect(startSpy).toHaveBeenCalledOnce();
	});
});

// ---------------------------------------------------------------------------
// Capability surface
// ---------------------------------------------------------------------------

describe('captureStream()', () => {
	it('throws BrowserPolicyError when captureStream is not available', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'captureStream', { value: undefined, configurable: true });
		expect(() => backend.captureStream()).toThrow('captureStream');
	});

	it('calls captureStream on the element when available', () => {
		const fakeStream = {} as MediaStream;
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'captureStream', {
			value: () => fakeStream,
			configurable: true,
		});
		expect(backend.captureStream()).toBe(fakeStream);
	});
});

describe('setSinkId()', () => {
	it('throws BrowserPolicyError when setSinkId is not available', async () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'setSinkId', { value: undefined, configurable: true });
		await expect(backend.setSinkId('device-123')).rejects.toThrow('setSinkId');
	});

	it('calls setSinkId on the element when available', async () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		const spy = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(videoEl, 'setSinkId', { value: spy, configurable: true });
		await backend.setSinkId('device-456');
		expect(spy).toHaveBeenCalledWith('device-456');
	});
});

describe('getSinkId()', () => {
	it('returns empty string when sinkId is absent', () => {
		expect(backend.getSinkId()).toBe('');
	});

	it('returns sinkId from the element', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'sinkId', { value: 'abc', configurable: true });
		expect(backend.getSinkId()).toBe('abc');
	});
});

describe('mediaKeys() / setMediaKeys()', () => {
	it('mediaKeys() returns undefined when no keys are set', () => {
		expect(backend.mediaKeys()).toBeUndefined();
	});

	it('setMediaKeys() throws when not available', async () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'setMediaKeys', { value: undefined, configurable: true });
		await expect(backend.setMediaKeys({} as MediaKeys)).rejects.toThrow('setMediaKeys');
	});
});

describe('outputProtectionState()', () => {
	it('returns "unrestricted" by default', () => {
		expect(backend.outputProtectionState()).toBe('unrestricted');
	});
});

// ---------------------------------------------------------------------------
// Audio tracks
// ---------------------------------------------------------------------------

describe('audioTracks() — HLS path', () => {
	it('returns mapped audio tracks from hls.audioTracks', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		_hlsRegistry.lastInstance!.audioTracks = [
			{ lang: 'en', name: 'English', default: true },
			{ lang: 'fr', name: 'Français', default: false },
		];
		const tracks = backend.audioTracks();
		expect(tracks).toHaveLength(2);
		expect(tracks[0]!.id).toBe('audio-0');
		expect(tracks[0]!.language).toBe('en');
		expect(tracks[0]!.label).toBe('English');
		expect(tracks[0]!.default).toBe(true);
		expect(tracks[1]!.id).toBe('audio-1');
		expect(tracks[1]!.default).toBe(false);
	});

	it('returns empty array when hls.audioTracks is empty', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		_hlsRegistry.lastInstance!.audioTracks = [];
		expect(backend.audioTracks()).toEqual([]);
	});

	it('falls back to native audioTracks when HLS has none', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		const nativeTracks = {
			length: 1,
			0: { id: 'nat-0', language: 'en', label: 'English', enabled: true },
		};
		Object.defineProperty(videoEl, 'audioTracks', { value: nativeTracks, configurable: true });
		expect(backend.audioTracks()).toHaveLength(1);
		expect(backend.audioTracks()[0]!.id).toBe('nat-0');
	});

	it('returns empty array when neither HLS nor native tracks present', () => {
		expect(backend.audioTracks()).toEqual([]);
	});
});

describe('setAudioTrack()', () => {
	it('sets hls.audioTrack when HLS is active', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		backend.setAudioTrack(1);
		expect(_hlsRegistry.lastInstance!.audioTrack).toBe(1);
	});

	it('enables the matching native track and disables others', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		const track0 = { enabled: true };
		const track1 = { enabled: false };
		const nativeTracks = { length: 2, 0: track0, 1: track1 };
		Object.defineProperty(videoEl, 'audioTracks', { value: nativeTracks, configurable: true });
		backend.setAudioTrack(1);
		expect(track0.enabled).toBe(false);
		expect(track1.enabled).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Subtitle tracks
// ---------------------------------------------------------------------------

describe('subtitleTracks() — HLS path', () => {
	it('returns mapped subtitle tracks from hls.subtitleTracks', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		_hlsRegistry.lastInstance!.subtitleTracks = [
			{ name: 'English', lang: 'en', default: true, url: 'eng.vtt' },
		];
		const tracks = backend.subtitleTracks();
		expect(tracks).toHaveLength(1);
		expect(tracks[0]!.id).toBe('subtitle-0');
		expect(tracks[0]!.language).toBe('en');
		expect(tracks[0]!.label).toBe('English');
		expect(tracks[0]!.kind).toBe('subtitles');
	});

	it('falls back to element textTracks when HLS has none', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		const mockTextTrack = {
			kind: 'subtitles',
			id: 'sub-0',
			language: 'de',
			label: 'Deutsch',
			mode: 'showing',
		};
		Object.defineProperty(videoEl, 'textTracks', {
			value: { length: 1, 0: mockTextTrack },
			configurable: true,
		});
		const tracks = backend.subtitleTracks();
		expect(tracks).toHaveLength(1);
		expect(tracks[0]!.id).toBe('sub-0');
		expect(tracks[0]!.default).toBe(true);
	});

	it('skips textTracks that are not subtitles or captions', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		const mockTextTrack = { kind: 'metadata', id: 'meta', language: 'en', label: 'Metadata', mode: 'hidden' };
		Object.defineProperty(videoEl, 'textTracks', {
			value: { length: 1, 0: mockTextTrack },
			configurable: true,
		});
		expect(backend.subtitleTracks()).toHaveLength(0);
	});

	it('returns empty array when textTracks is empty', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'textTracks', { value: { length: 0 }, configurable: true });
		expect(backend.subtitleTracks()).toHaveLength(0);
	});
});

describe('setSubtitleTrack()', () => {
	it('sets hls.subtitleTrack to -1 when null is passed', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		_hlsRegistry.lastInstance!.subtitleTrack = 0;
		backend.setSubtitleTrack(null);
		expect(_hlsRegistry.lastInstance!.subtitleTrack).toBe(-1);
	});

	it('emits subtitleCue with empty cues when track is null', async () => {
		const cueEvents: unknown[] = [];
		backend.on('subtitleCue', data => cueEvents.push(data));
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		backend.setSubtitleTrack(null);
		const evt = cueEvents.at(-1) as { cues: unknown[]; language: unknown };
		expect(evt.cues).toEqual([]);
		expect(evt.language).toBeUndefined();
	});

	it('sets matching text track to hidden mode for cuechange', () => {
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		const listeners = new Map<string, EventListener>();
		const mockTrack: Record<string, unknown> = {
			kind: 'subtitles',
			language: 'en',
			label: 'English',
			mode: 'disabled',
			activeCues: null,
			addEventListener: (event: string, fn: EventListener) => listeners.set(event, fn),
			removeEventListener: (event: string) => listeners.delete(event),
		};
		Object.defineProperty(videoEl, 'textTracks', {
			value: { length: 1, 0: mockTrack },
			configurable: true,
		});
		backend.setSubtitleTrack(0);
		expect(mockTrack.mode).toBe('hidden');
	});

	it('emits active cues when setSubtitleTrack selects a track with pre-existing cues', () => {
		const cueEvents: unknown[] = [];
		backend.on('subtitleCue', data => cueEvents.push(data));

		const videoEl = container.querySelector('video') as HTMLVideoElement;
		const mockCue = { text: 'Hello', line: 'auto', size: 100, align: 'center', position: 'auto', snapToLines: true } as VTTCue;
		const listeners = new Map<string, EventListener>();
		const mockTrack: Record<string, unknown> = {
			kind: 'subtitles',
			language: 'en',
			label: 'English',
			mode: 'disabled',
			activeCues: { length: 1, 0: mockCue },
			addEventListener: (event: string, fn: EventListener) => listeners.set(event, fn),
			removeEventListener: (event: string) => listeners.delete(event),
		};
		Object.defineProperty(videoEl, 'textTracks', {
			value: { length: 1, 0: mockTrack },
			configurable: true,
		});
		backend.setSubtitleTrack(0);
		const evt = cueEvents.at(-1) as { cues: unknown[] };
		expect(evt.cues).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// Quality levels
// ---------------------------------------------------------------------------

describe('qualityLevels()', () => {
	it('returns empty array without HLS', () => {
		expect(backend.qualityLevels()).toEqual([]);
	});

	it('maps HLS levels to QualityLevel shape', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		_hlsRegistry.lastInstance!.levels = [
			{ bitrate: 2_000_000, height: 720, width: 1280, attrs: { 'CODECS': 'avc1.42001e', 'VIDEO-RANGE': 'SDR' } },
			{ bitrate: 4_000_000, height: 1080, width: 1920, attrs: { 'CODECS': 'hvc1.1.6.L120', 'VIDEO-RANGE': 'PQ' } },
		];
		const levels = backend.qualityLevels();
		expect(levels).toHaveLength(2);
		expect(levels[0]!.height).toBe(720);
		expect(levels[0]!.dynamicRange).toBe('sdr');
		expect(levels[1]!.height).toBe(1080);
		expect(levels[1]!.dynamicRange).toBe('hdr');
	});

	it('includeUnsupported option includes all levels', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		_hlsRegistry.lastInstance!.levels = [
			{ bitrate: 1_000_000, height: 480, attrs: { CODECS: 'av01.0.08M.08' } },
		];
		const all = backend.qualityLevels({ includeUnsupported: true });
		expect(all).toHaveLength(1);
	});

	it('HLG VIDEO-RANGE is classified as HDR', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		_hlsRegistry.lastInstance!.levels = [
			{ bitrate: 2_000_000, height: 720, attrs: { 'VIDEO-RANGE': 'HLG' } },
		];
		const levels = backend.qualityLevels();
		expect(levels[0]!.dynamicRange).toBe('hdr');
	});
});

describe('setQuality()', () => {
	it('sets hls.currentLevel when HLS active', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		backend.setQuality(2);
		expect(_hlsRegistry.lastInstance!.currentLevel).toBe(2);
	});

	it('sets hls.currentLevel to -1 for "auto"', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		_hlsRegistry.lastInstance!.currentLevel = 3;
		backend.setQuality('auto');
		expect(_hlsRegistry.lastInstance!.currentLevel).toBe(-1);
	});

	it('no-ops when HLS is not active', () => {
		expect(() => backend.setQuality(0)).not.toThrow();
	});
});

describe('currentLevel()', () => {
	it('returns -1 when no HLS instance', () => {
		expect(backend.currentLevel()).toBe(-1);
	});

	it('returns currentLevel when >= 0', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		_hlsRegistry.lastInstance!.currentLevel = 2;
		expect(backend.currentLevel()).toBe(2);
	});

	it('falls back to loadLevel when currentLevel is -1', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		_hlsRegistry.lastInstance!.currentLevel = -1;
		_hlsRegistry.lastInstance!.loadLevel = 1;
		expect(backend.currentLevel()).toBe(1);
	});
});

describe('bandwidthEstimate()', () => {
	it('returns 0 when no HLS instance', () => {
		expect(backend.bandwidthEstimate()).toBe(0);
	});

	it('returns hls.bandwidthEstimate (bits per second) once HLS is active', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		_hlsRegistry.lastInstance!.bandwidthEstimate = 2_500_000;
		expect(backend.bandwidthEstimate()).toBe(2_500_000);
	});
});

// ---------------------------------------------------------------------------
// Auth header provider
// ---------------------------------------------------------------------------

describe('setAuthHeaderProvider()', () => {
	it('injects Authorization header into xhrSetup when provider returns a value', async () => {
		backend.setAuthHeaderProvider(() => 'Bearer test-token');

		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		const config = _hlsRegistry.lastConfig!;
		const xhrSetup = config.xhrSetup as (xhr: XMLHttpRequest) => void;
		const mockXhr = { setRequestHeader: vi.fn() } as unknown as XMLHttpRequest;
		xhrSetup(mockXhr);
		expect(mockXhr.setRequestHeader).toHaveBeenCalledWith('Authorization', 'Bearer test-token');
	});

	it('does not call setRequestHeader when provider returns undefined', async () => {
		backend.setAuthHeaderProvider(() => undefined);

		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		const config = _hlsRegistry.lastConfig!;
		const xhrSetup = config.xhrSetup as (xhr: XMLHttpRequest) => void;
		const mockXhr = { setRequestHeader: vi.fn() } as unknown as XMLHttpRequest;
		xhrSetup(mockXhr);
		expect(mockXhr.setRequestHeader).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Unload
// ---------------------------------------------------------------------------

describe('unload()', () => {
	it('resets state to idle', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		backend.unload();
		expect(backend.state()).toBe('idle');
	});

	it('destroys the HLS instance on unload', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		const hlsInst = _hlsRegistry.lastInstance!;
		const destroySpy = vi.spyOn(hlsInst, 'destroy');
		backend.unload();
		expect(destroySpy).toHaveBeenCalledOnce();
	});

	it('emits subtitleCue with empty cues on unload', async () => {
		const cueEvents: unknown[] = [];
		backend.on('subtitleCue', data => cueEvents.push(data));

		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		backend.unload();
		const last = cueEvents.at(-1) as { cues: unknown[] };
		expect(last.cues).toEqual([]);
	});

	function attachCustomSource(): { destroy: ReturnType<typeof vi.fn> } {
		const source = { attach: vi.fn(async () => {}), destroy: vi.fn() };
		backend.setStreamResolver(() => source as never);
		return source;
	}

	it('destroys a custom stream source on unload', async () => {
		const source = attachCustomSource();
		await backend.load('https://example.invalid/custom.bin');

		backend.unload();
		expect(source.destroy).toHaveBeenCalledOnce();
	});

	it('destroys a custom stream source on dispose, once', async () => {
		const source = attachCustomSource();
		await backend.load('https://example.invalid/custom.bin');

		backend.dispose();
		expect(source.destroy).toHaveBeenCalledOnce();
	});
});

// ---------------------------------------------------------------------------
// HLS error recovery
// ---------------------------------------------------------------------------

describe('HLS error recovery', () => {
	async function loadHls(): Promise<FakeHlsInstance> {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;
		return _hlsRegistry.lastInstance!;
	}

	it('emits stream:error with fatal:false for non-fatal errors', async () => {
		const hls = await loadHls();
		const streamErrors: unknown[] = [];
		backend.on('stream:error', payload => streamErrors.push(payload));

		hls.fire('hlsError', { fatal: false, type: 'networkError', details: 'fragLoadError' });
		expect(streamErrors).toHaveLength(1);
		expect((streamErrors[0] as { fatal: boolean }).fatal).toBe(false);
	});

	it('emits stream:error with message for bufferIncompatibleCodecsError', async () => {
		const hls = await loadHls();
		const streamErrors: unknown[] = [];
		backend.on('stream:error', payload => streamErrors.push(payload));

		hls.fire('hlsError', {
			fatal: false,
			type: 'mediaError',
			details: 'bufferIncompatibleCodecsError',
			error: { message: 'codecs=avc1.42001e,mp4a.40.2' },
		});

		const evt = streamErrors[0] as { details: string; message: string; rawCodec: string };
		expect(evt.details).toBe('media/codec-not-supported');
		expect(evt.message).toContain('H.264');
	});

	it('schedules retry for fatal NETWORK_ERROR and emits stream:recovering', async () => {
		const hls = await loadHls();
		vi.useFakeTimers();
		const recovering: unknown[] = [];
		backend.on('stream:recovering', payload => recovering.push(payload));

		hls.fire('hlsError', {
			fatal: true,
			type: 'networkError',
			details: 'manifestLoadError',
		});

		expect(recovering).toHaveLength(1);
		expect((recovering[0] as { attempt: number }).attempt).toBe(1);

		vi.useRealTimers();
	});

	it('rides a refused connection out for the whole ladder before escalating', async () => {
		const hls = await loadHls();
		vi.useFakeTimers();
		const errors: unknown[] = [];
		backend.on('error', event => errors.push(event));

		// A failure carrying no response is a refused connection, which is a
		// server that is not there rather than a file that is not there.
		for (let attempt = 0; attempt < SOURCE_OUTAGE_BACKOFF_MS.length; attempt++) {
			hls.fire('hlsError', { fatal: true, type: 'networkError', details: 'manifestLoadError' });
			await vi.runAllTimersAsync();
			expect(errors).toHaveLength(0);
			expect(backend.isRecoveringFromOutage).toBe(true);
		}

		hls.fire('hlsError', { fatal: true, type: 'networkError', details: 'manifestLoadError' });
		await vi.runAllTimersAsync();

		expect(errors.length).toBeGreaterThan(0);
		expect(backend.state()).toBe('error');
		expect(backend.isRecoveringFromOutage).toBe(false);

		vi.useRealTimers();
	});

	it('gives cloudflared 530 the full ladder, and a cold 404 only five rungs', async () => {
		const hls = await loadHls();
		vi.useFakeTimers();
		const errors: unknown[] = [];
		backend.on('error', event => errors.push(event));

		// A tunnel whose origin is restarting never refuses the connection; the
		// edge answers 530. Five rungs in, that is still an outage to ride out.
		for (let attempt = 0; attempt < HTTP_STATUS_RETRY_LIMIT + 1; attempt++) {
			hls.fire('hlsError', {
				fatal: true,
				type: 'networkError',
				details: 'fragLoadError',
				response: { code: 530 },
			});
			await vi.runAllTimersAsync();
		}
		expect(errors).toHaveLength(0);

		hls.fire('hlsFragLoaded', {});
		vi.useRealTimers();
	});

	it('leaves the error state once fragments load again after the device is back online', async () => {
		const hls = await loadHls();
		vi.useFakeTimers();
		try {
			for (let attempt = 0; attempt <= SOURCE_OUTAGE_BACKOFF_MS.length; attempt++) {
				hls.fire('hlsError', { fatal: true, type: 'networkError', details: 'manifestLoadError' });
				await vi.runAllTimersAsync();
			}
			expect(backend.state()).toBe('error');

			globalThis.dispatchEvent(new Event('online'));
			expect(backend.state()).toBe('error');

			hls.fire('hlsFragLoaded', {});
			expect(backend.state()).not.toBe('error');
		}
		finally {
			vi.useRealTimers();
		}
	});

	it('keeps the error state when a fragment loads after a media element error', async () => {
		const hls = await loadHls();
		const videoEl = container.querySelector('video') as HTMLVideoElement;

		videoEl.dispatchEvent(new Event('error'));
		hls.fire('hlsFragLoaded', {});

		expect(backend.state()).toBe('error');
	});

	it('fails fast on a 404 that no connection failure preceded', async () => {
		const hls = await loadHls();
		vi.useFakeTimers();
		const errors: unknown[] = [];
		backend.on('error', event => errors.push(event));

		for (let attempt = 0; attempt < HTTP_STATUS_RETRY_LIMIT + 1; attempt++) {
			hls.fire('hlsError', {
				fatal: true,
				type: 'networkError',
				details: 'fragLoadError',
				response: { code: 404 },
			});
			await vi.runAllTimersAsync();
		}

		// A URL that is genuinely gone answers the same way every time, and a
		// viewer should be told so rather than shown a spinner for 105 seconds.
		expect(errors.length).toBeGreaterThan(0);
		expect(backend.state()).toBe('error');

		vi.useRealTimers();
	});

	it('resets net retry count on FRAG_LOADED', async () => {
		const hls = await loadHls();
		vi.useFakeTimers();

		hls.fire('hlsError', { fatal: true, type: 'networkError', details: 'fragLoadError' });
		await vi.runAllTimersAsync();
		hls.fire('hlsFragLoaded', {});

		const errors: unknown[] = [];
		backend.on('stream:error', payload => errors.push(payload));
		hls.fire('hlsError', { fatal: false, type: 'networkError', details: 'fragLoadError' });
		expect((errors[0] as { details: string }).details).toBe('fragLoadError');

		vi.useRealTimers();
	});

	it('attempts recoverMediaError for fatal MEDIA_ERROR', async () => {
		const hls = await loadHls();
		const recoverSpy = vi.spyOn(hls, 'recoverMediaError');

		hls.fire('hlsError', {
			fatal: true,
			type: 'mediaError',
			details: 'bufferAddCodecError',
		});

		expect(recoverSpy).toHaveBeenCalledOnce();
	});

	it('escalates on second MEDIA_ERROR within 5s', async () => {
		const hls = await loadHls();
		vi.useFakeTimers();
		const errors: unknown[] = [];
		backend.on('error', event => errors.push(event));

		const mediaErrPayload = { fatal: true, type: 'mediaError', details: 'bufferAddCodecError' };
		hls.fire('hlsError', mediaErrPayload);
		hls.fire('hlsError', mediaErrPayload);

		expect(errors.length).toBeGreaterThan(0);
		expect(backend.state()).toBe('error');

		vi.useRealTimers();
	});

	it('destroys and reloads for fatal MUX_ERROR', async () => {
		const hls = await loadHls();
		const destroySpy = vi.spyOn(hls, 'destroy');

		hls.fire('hlsError', {
			fatal: true,
			type: 'muxError',
			details: 'remuxingError',
		});

		expect(destroySpy).toHaveBeenCalledOnce();
	});
});

// ---------------------------------------------------------------------------
// _attachHlsLevelSwitchedHandler — level-switched event deduplication
// ---------------------------------------------------------------------------

describe('HLS level-switched handler', () => {
	it('emits level-switched on LEVEL_SWITCHED', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		const levelEvents: unknown[] = [];
		backend.on('level-switched', payload => levelEvents.push(payload));

		_hlsRegistry.lastInstance!.fire('hlsLevelSwitched', { level: 2 });
		expect(levelEvents).toHaveLength(1);
		expect((levelEvents[0] as { level: number }).level).toBe(2);
	});

	it('deduplicates consecutive identical level values', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		const levelEvents: unknown[] = [];
		backend.on('level-switched', payload => levelEvents.push(payload));

		_hlsRegistry.lastInstance!.fire('hlsLevelSwitched', { level: 2 });
		_hlsRegistry.lastInstance!.fire('hlsLevelSwitched', { level: 2 });
		expect(levelEvents).toHaveLength(1);
	});

	it('emits level-switched on FRAG_CHANGED when level differs', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		const levelEvents: unknown[] = [];
		backend.on('level-switched', payload => levelEvents.push(payload));

		_hlsRegistry.lastInstance!.fire('hlsFragChanged', { frag: { level: 3 } });
		expect(levelEvents).toHaveLength(1);
		expect((levelEvents[0] as { level: number }).level).toBe(3);
	});

	it('ignores FRAG_CHANGED without frag.level', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		const levelEvents: unknown[] = [];
		backend.on('level-switched', payload => levelEvents.push(payload));

		_hlsRegistry.lastInstance!.fire('hlsFragChanged', {});
		expect(levelEvents).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// MANIFEST_PARSED → _emitHlsTrackLists
// ---------------------------------------------------------------------------

describe('MANIFEST_PARSED event handling', () => {
	it('emits audioTracks event when hls has audio tracks after manifest parse', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		const hls = _hlsRegistry.lastInstance!;
		hls.audioTracks = [{ lang: 'en', name: 'English', default: true }];

		const audioTrackEvents: unknown[] = [];
		backend.on('audioTracks', payload => audioTrackEvents.push(payload));

		hls.fire('hlsManifestParsed', {});
		await flushMicrotasks();

		expect(audioTrackEvents.length).toBeGreaterThan(0);
	});

	it('emits audioTracks when hls.js publishes its audio list after the manifest parse', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		const hls = _hlsRegistry.lastInstance!;
		const audioTrackEvents: Array<{ tracks: unknown[] }> = [];
		backend.on('audioTracks', payload => audioTrackEvents.push(payload as { tracks: unknown[] }));

		hls.fire('hlsManifestParsed', {});
		await flushMicrotasks();
		expect(audioTrackEvents).toHaveLength(0);

		hls.audioTracks = [{ lang: 'en', name: 'English aac', default: true }];
		hls.fire('hlsAudioTracksUpdated', {});
		expect(audioTrackEvents).toHaveLength(1);
		expect(audioTrackEvents[0]!.tracks).toHaveLength(1);

		hls.audioTracks = [{ lang: 'en', name: 'English aac', default: true }, { lang: 'nl', name: 'Dutch', default: false }];
		hls.fire('hlsAudioTracksUpdated', {});
		expect(audioTrackEvents).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// dispose — listener teardown
// ---------------------------------------------------------------------------

describe('dispose()', () => {
	it('clears the retry timer without throwing', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8');
		await flushMicrotasks();
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		vi.useFakeTimers();
		const hls = _hlsRegistry.lastInstance!;
		hls.fire('hlsError', { fatal: true, type: 'networkError', details: 'fragLoadError' });

		expect(() => backend.dispose()).not.toThrow();
		vi.useRealTimers();
		backend = new Html5VideoBackend(container);
	});
});
