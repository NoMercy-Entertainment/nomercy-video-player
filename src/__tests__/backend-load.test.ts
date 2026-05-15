/**
 * Regression tests for Html5VideoBackend.load() error handling.
 *
 * Covers the case where a fatal HLS-level error (e.g. MANIFEST_INCOMPATIBLE_CODECS
 * from an HEVC-only manifest on a browser without HEVC support) fires on the
 * backend's EventEmitter but NOT on the DOM element's error event. Before the
 * fix, waitForLoadedMetadata() hung indefinitely because it only listened to
 * the DOM element — the load() Promise never settled and the error was invisible.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Html5VideoBackend } from '../adapters/video-backend/html5';

// Stub hls.js so the dynamic import in html5.ts resolves in the Vitest environment.
// The stub reports isSupported()=true but the HLS instance never fires events,
// so tests control the load lifecycle manually via backend EventEmitter / DOM events.
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
		static isSupported = (): boolean => true;
		static Events: Record<string, string> = {
			MANIFEST_PARSED: 'hlsManifestParsed',
			ERROR: 'hlsError',
			FRAG_LOADED: 'hlsFragLoaded',
			LEVEL_SWITCHED: 'hlsLevelSwitched',
			FRAG_CHANGED: 'hlsFragChanged',
		};
		static ErrorTypes: Record<string, string> = {
			NETWORK_ERROR: 'networkError',
			MEDIA_ERROR: 'mediaError',
		};
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		on(_event: string, _fn: (...args: any[]) => void): void { /* stub */ }
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

/** Flush all pending microtasks so async imports and promise chains settle. */
async function flushMicrotasks(iterations = 10): Promise<void> {
	for (let i = 0; i < iterations; i++) {
		await new Promise<void>(resolve => setTimeout(resolve, 0));
	}
}

describe('Html5VideoBackend — load() error propagation', () => {
	let container: HTMLDivElement;
	let backend: Html5VideoBackend;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		backend = new Html5VideoBackend(container);
	});

	afterEach(() => {
		try { backend.dispose(); }
		catch { /* defensive */ }
		document.body.innerHTML = '';
	});

	it('rejects load() when a fatal stream:error fires before loadedmetadata', async () => {
		// Simulate what happens when HLS.js reports MANIFEST_INCOMPATIBLE_CODECS:
		// The backend emits 'stream:error' with fatal:true but the DOM element
		// never fires its 'error' event (because no media data reached it yet).
		// load() must reject so callers can surface the failure.
		const loadPromise = backend.load('https://example.invalid/test.m3u8');

		// Wait long enough for the dynamic `import('hls.js')` to resolve AND for
		// waitForLoadedMetadata to register its 'stream:error' listener.
		await flushMicrotasks();

		// Emit the fatal HLS error (simulates _escalateHlsError path).
		backend.emit('stream:error', {
			details: 'manifestIncompatibleCodecsError',
			fatal: true,
			message: 'no level with compatible codecs found in manifest',
		});

		await expect(loadPromise).rejects.toThrow();
	}, 10_000);

	it('does NOT reject load() for non-fatal stream:error', async () => {
		const settled: Array<'resolved' | 'rejected'> = [];

		const loadPromise = backend
			.load('https://example.invalid/test.m3u8')
			.then(() => settled.push('resolved'))
			.catch(() => settled.push('rejected'));

		await flushMicrotasks();

		// Non-fatal codec warning — must not reject load().
		backend.emit('stream:error', {
			details: 'bufferIncompatibleCodecsError',
			fatal: false,
			message: 'codec warning',
			rawCodec: 'hvc1.2.4.L120.B0',
		});

		// loadedmetadata fires (simulates successful parse after codec warning).
		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));

		await loadPromise;
		expect(settled).toEqual(['resolved']);
	});

	it('opts parameter is optional — load(url) without opts resolves on loadedmetadata', async () => {
		// The IVideoBackend interface previously declared opts as required.
		// The kit calls backend.load(url) without opts. This test documents
		// that the implementation accepts opts=undefined without throwing.
		const loadPromise = backend.load('https://example.invalid/test.m3u8');

		await flushMicrotasks();

		const videoEl = container.querySelector('video') as HTMLVideoElement;
		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));

		await expect(loadPromise).resolves.toBeUndefined();
	});

	it('opts.preload is applied to the element when provided', async () => {
		const loadPromise = backend.load('https://example.invalid/test.m3u8', {
			preload: 'metadata',
		});

		await flushMicrotasks();

		const videoEl = container.querySelector('video') as HTMLVideoElement;
		expect(videoEl.preload).toBe('metadata');

		Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
		videoEl.dispatchEvent(new Event('loadedmetadata'));

		await expect(loadPromise).resolves.toBeUndefined();
	});

	it('rejects load() when the DOM element fires error before loadedmetadata', async () => {
		const loadPromise = backend.load('https://example.invalid/test.mp4');

		await flushMicrotasks();

		const videoEl = container.querySelector('video') as HTMLVideoElement;
		videoEl.dispatchEvent(new Event('error'));

		await expect(loadPromise).rejects.toBeDefined();
	});
});
