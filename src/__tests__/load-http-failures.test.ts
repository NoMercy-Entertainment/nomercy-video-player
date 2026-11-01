/**
 * A load that fails on an HTTP status rejects with that status attached, and no
 * fixed timer ends a load that is still working.
 */

import { PlayerError } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Html5VideoBackend } from '../adapters/video-backend/html5';

type HlsListener = (event: string, data: unknown) => void;

interface FakeHlsInstance {
	fire: (event: string, data?: unknown) => void;
}

const registry: { last: FakeHlsInstance | undefined } = { last: undefined };

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
		_listeners = new Map<string, HlsListener[]>();

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

		constructor() {
			registry.last = this as unknown as FakeHlsInstance;
		}

		on(event: string, fn: HlsListener): void {
			if (!this._listeners.has(event))
				this._listeners.set(event, []);
			this._listeners.get(event)!.push(fn);
		}

		fire(event: string, data: unknown = {}): void {
			for (const fn of this._listeners.get(event) ?? [])
				fn(event, data);
		}

		attachMedia(): void { /* stub */ }
		loadSource(): void { /* stub */ }
		detachMedia(): void { /* stub */ }
		destroy(): void { /* stub */ }
		startLoad(): void { /* stub */ }
		stopLoad(): void { /* stub */ }
		recoverMediaError(): void { /* stub */ }
	}
	return { default: FakeHls };
});

async function flush(iterations = 10): Promise<void> {
	for (let i = 0; i < iterations; i++)
		await new Promise<void>(resolve => setTimeout(resolve, 0));
}

function networkFailure(status: number): Record<string, unknown> {
	return { fatal: true, type: 'networkError', details: 'manifestLoadError', response: { code: status } };
}

describe('Html5VideoBackend.load() on an HTTP failure', () => {
	let container: HTMLDivElement;
	let backend: Html5VideoBackend;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		backend = new Html5VideoBackend(container);
		registry.last = undefined;
	});

	afterEach(() => {
		vi.useRealTimers();
		try { backend.dispose(); }
		catch { /* defensive */ }
		document.body.innerHTML = '';
	});

	async function failWith(status: number): Promise<{ error: unknown; recovering: unknown[] }> {
		const recovering: unknown[] = [];
		backend.on('stream:recovering', data => recovering.push(data));
		const settled = backend.load('https://example.invalid/test.m3u8').then(() => undefined, (err: unknown) => err);
		await flush();
		registry.last!.fire('hlsError', networkFailure(status));
		return { error: await settled, recovering };
	}

	it.each([404, 410, 401, 500])('rejects with HTTP %i attached to the error', async (status) => {
		const { error } = await failWith(status);

		expect(error).toBeInstanceOf(PlayerError);
		expect((error as PlayerError).context).toMatchObject({ httpStatus: status });
	});

	it.each([401, 500])('does not retry an HTTP %i while loading', async (status) => {
		const { recovering } = await failWith(status);

		expect(recovering).toHaveLength(0);
	});

	it('keeps riding out a server that is down (503) instead of failing the load', async () => {
		vi.useFakeTimers();
		const outcome: unknown[] = [];
		void backend.load('https://example.invalid/test.m3u8').then(() => outcome.push('ok'), () => outcome.push('rejected'));
		await vi.advanceTimersByTimeAsync(50);
		registry.last!.fire('hlsError', networkFailure(503));
		await vi.advanceTimersByTimeAsync(3_000);

		expect(outcome).toEqual([]);
	});

	it('does not reject a load that is still waiting after 10 seconds', async () => {
		vi.useFakeTimers();
		const outcome: unknown[] = [];
		void backend.load('https://example.invalid/test.m3u8').then(() => outcome.push('ok'), () => outcome.push('rejected'));
		await vi.advanceTimersByTimeAsync(60_000);

		expect(outcome).toEqual([]);
	});
});
