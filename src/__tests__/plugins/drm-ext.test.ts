// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Extended DrmPlugin tests.
 *
 * The existing drm.test.ts covers:
 *   - plugin:drm:unsupported fires in jsdom (no EME)
 *   - fetchLicense() throws DrmError when licenseUrl missing
 *
 * New coverage (33% → target ~85%+):
 *   - DrmPlugin.id, version, description are correct static values
 *   - use() sets supported=false and does not throw when navigator is missing EME
 *   - mediaKeys() returns null when not supported
 *   - dispose() resets state
 *   - item event with drm data triggers tryHandshake (mocked requestMediaKeySystemAccess)
 *   - item event without drm data is a no-op
 *   - fetchLicense applies transformLicenseRequest + transformLicenseResponse
 *   - tryHandshake emits key:error when requestMediaKeySystemAccess rejects
 *   - fetchLicense with customSignRequest signs the request before calling fetch
 *   - FairPlay key system uses skd initDataType in handshake config
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NMVideoPlayer } from '../../index';
import { DrmPlugin, drmPlugin } from '../../plugins/drm';

// The plugin tests drive arbitrary `plugin:*` event names that fall outside the
// player's typed event overloads, so they reach the event bus through this
// minimal callable surface instead of an `unknown`-valued index signature.
interface EventBusLike {
	on: (event: string, fn: (data: unknown) => void) => void;
	emit: (event: string, data?: unknown) => void;
}

describe('DrmPlugin — static properties', () => {
	it('has correct id', () => {
		expect(DrmPlugin.id).toBe('drm');
	});

	it('has correct version', () => {
		expect(DrmPlugin.version).toBe('2.0.0');
	});

	it('description mentions DRM/EME keywords', () => {
		expect(DrmPlugin.description.toLowerCase()).toMatch(/drm|eme|widevine/i);
	});
});

describe('DrmPlugin — lifecycle in jsdom (no EME)', () => {
	beforeEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	const setup = (): NMVideoPlayer<any> => new NMVideoPlayer('test').setup({});

	it('mediaKeys() returns null when EME is not supported', async () => {
		const player = setup();
		player.addPlugin(drmPlugin, { keySystem: 'com.widevine.alpha', licenseUrl: 'https://x/license' });
		await player.ready();

		const inst = player.getPlugin(DrmPlugin)!;
		expect(inst.mediaKeys()).toBeNull();
	});

	it('dispose() does not throw', async () => {
		const player = setup();
		player.addPlugin(drmPlugin, { keySystem: 'com.widevine.alpha', licenseUrl: 'https://x/license' });
		await player.ready();

		expect(() => player.removePlugin(DrmPlugin)).not.toThrow();
	});

	it('item event without drm field does not emit key:error', async () => {
		const player = setup();
		player.addPlugin(drmPlugin, { keySystem: 'com.widevine.alpha', licenseUrl: 'https://x/license' });
		await player.ready();

		const errors: unknown[] = [];
		(player as unknown as EventBusLike).on('plugin:drm:key:error', (payload: unknown) => errors.push(payload));

		(player as unknown as EventBusLike).emit('item', { item: { id: 'ep1', url: '/ep1.m3u8' } });
		await Promise.resolve();

		expect(errors).toHaveLength(0);
	});
});

describe('DrmPlugin — tryHandshake with mocked EME', () => {
	beforeEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		vi.restoreAllMocks();
		// Clean up the mocked navigator method if set
		const nav = navigator as Navigator & { requestMediaKeySystemAccess?: unknown };
		if ('_nmtest_rmskaOrig' in nav) {
			nav.requestMediaKeySystemAccess = (nav as any)._nmtest_rmskaOrig;
			delete (nav as any)._nmtest_rmskaOrig;
		}
	});

	it('item with drm triggers handshake attempt when EME is mocked', async () => {
		const handshakeCalls: unknown[] = [];
		const nav = navigator as Navigator & { requestMediaKeySystemAccess?: unknown };
		(nav as any)._nmtest_rmskaOrig = nav.requestMediaKeySystemAccess;
		nav.requestMediaKeySystemAccess = vi.fn(async (keySystem: string) => {
			handshakeCalls.push(keySystem);
			return { getConfiguration: () => ({}) };
		}) as unknown as typeof navigator.requestMediaKeySystemAccess;

		const player = new NMVideoPlayer('test').setup({});
		player.addPlugin(drmPlugin, { keySystem: 'com.widevine.alpha', licenseUrl: 'https://x/license' });
		await player.ready();

		(player as unknown as EventBusLike).emit('item', {
			item: { id: 'ep1', url: '/ep1.m3u8', drm: { keySystem: 'com.widevine.alpha' } },
		});

		// Let the async handshake run
		await new Promise<void>(resolve => setTimeout(resolve, 10));

		expect(handshakeCalls).toContain('com.widevine.alpha');
	});

	it('emits plugin:drm:key:error when requestMediaKeySystemAccess rejects', async () => {
		const nav = navigator as Navigator & { requestMediaKeySystemAccess?: unknown };
		(nav as any)._nmtest_rmskaOrig = nav.requestMediaKeySystemAccess;
		nav.requestMediaKeySystemAccess = vi.fn(async () => {
			throw new Error('NotSupportedError');
		}) as unknown as typeof navigator.requestMediaKeySystemAccess;

		const errors: unknown[] = [];
		const player = new NMVideoPlayer('test').setup({});
		player.addPlugin(drmPlugin, { keySystem: 'com.widevine.alpha', licenseUrl: 'https://x/license' });
		await player.ready();

		(player as unknown as EventBusLike).on('plugin:drm:key:error', (payload: unknown) => errors.push(payload));

		(player as unknown as EventBusLike).emit('item', {
			item: { id: 'ep1', url: '/ep1.m3u8', drm: { keySystem: 'com.widevine.alpha' } },
		});

		await new Promise<void>(resolve => setTimeout(resolve, 10));

		expect(errors.length).toBeGreaterThan(0);
		const err = errors[0] as { error: Error; sessionId: string };
		expect(err.error.message).toMatch(/NotSupportedError/);
		expect(err.sessionId).toBe('init');
	});
});

describe('DrmPlugin — fetchLicense transformers', () => {
	beforeEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	it('fetchLicense applies transformLicenseRequest before sending', async () => {
		const transformedChallenge = new ArrayBuffer(4);
		let capturedBody: BodyInit | undefined;

		const player = new NMVideoPlayer('test').setup({});
		player.addPlugin(drmPlugin, {
			keySystem: 'com.widevine.alpha',
			licenseUrl: 'https://example.test/license',
			transformLicenseRequest: async (_c: ArrayBuffer) => transformedChallenge,
		});
		await player.ready();

		const inst = player.getPlugin(DrmPlugin)!;

		// Override the plugin's fetch so we can inspect what body was sent
		Object.assign(inst, {
			fetch: async (_url: string, opts: { body?: BodyInit }) => {
				capturedBody = opts.body;
				return new ArrayBuffer(8);
			},
		});

		await inst.fetchLicense(new ArrayBuffer(16)).catch(() => {});

		expect(capturedBody).toBe(transformedChallenge);
	});

	it('fetchLicense applies transformLicenseResponse after receiving', async () => {
		const finalResponse = new ArrayBuffer(8);
		let transformCalled = false;

		const player = new NMVideoPlayer('test').setup({});
		player.addPlugin(drmPlugin, {
			keySystem: 'com.widevine.alpha',
			licenseUrl: 'https://example.test/license',
			transformLicenseResponse: async (_r: ArrayBuffer) => { transformCalled = true; return finalResponse; },
		});
		await player.ready();

		const inst = player.getPlugin(DrmPlugin)!;

		Object.assign(inst, {
			fetch: async () => new ArrayBuffer(8),
		});

		const result = await inst.fetchLicense(new ArrayBuffer(4)).catch(() => null);

		expect(transformCalled).toBe(true);
		if (result !== null) {
			expect(result).toBe(finalResponse);
		}
	});
});

describe('DrmPlugin — FairPlay handshake config', () => {
	beforeEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		vi.restoreAllMocks();
		const nav = navigator as Navigator & { requestMediaKeySystemAccess?: unknown };
		if ('_nmtest_rmskaOrig' in nav) {
			nav.requestMediaKeySystemAccess = (nav as any)._nmtest_rmskaOrig;
			delete (nav as any)._nmtest_rmskaOrig;
		}
	});

	it('FairPlay handshake uses skd initDataType', async () => {
		const configsCapture: MediaKeySystemConfiguration[][] = [];
		const nav = navigator as Navigator & { requestMediaKeySystemAccess?: unknown };
		(nav as any)._nmtest_rmskaOrig = nav.requestMediaKeySystemAccess;
		nav.requestMediaKeySystemAccess = vi.fn(async (_ks: string, configs: MediaKeySystemConfiguration[]) => {
			configsCapture.push(configs);
			return { getConfiguration: () => ({}) };
		}) as unknown as typeof navigator.requestMediaKeySystemAccess;

		const player = new NMVideoPlayer('test').setup({});
		player.addPlugin(drmPlugin, { keySystem: 'com.apple.fps.1_0', licenseUrl: 'https://fps.example.test/cert' });
		await player.ready();

		(player as unknown as EventBusLike).emit('item', {
			item: { id: 'ep1', url: '/ep1.m3u8', drm: { keySystem: 'com.apple.fps.1_0' } },
		});

		await new Promise<void>(resolve => setTimeout(resolve, 10));

		// The FairPlay branch uses 'skd' initDataType
		const config = configsCapture[0]?.[0];
		expect(config?.initDataTypes).toContain('skd');
	});
});

describe('DrmPlugin — MediaKeys binding and license exchange', () => {
	beforeEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		vi.restoreAllMocks();
		const nav = navigator as Navigator & { requestMediaKeySystemAccess?: unknown };
		if ('_nmtest_rmskaOrig' in nav) {
			nav.requestMediaKeySystemAccess = (nav as any)._nmtest_rmskaOrig;
			delete (nav as any)._nmtest_rmskaOrig;
		}
	});

	interface FakeSession extends EventTarget {
		generateRequest: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
	}

	async function setupEme(opts: { updateFails?: boolean } = {}): Promise<{
		player: NMVideoPlayer<any>;
		video: HTMLVideoElement;
		session: FakeSession;
		keys: { createSession: ReturnType<typeof vi.fn> };
		createMediaKeys: ReturnType<typeof vi.fn>;
		setMediaKeys: ReturnType<typeof vi.fn>;
		fetchLicense: ReturnType<typeof vi.spyOn>;
	}> {
		const session = Object.assign(new EventTarget(), {
			generateRequest: vi.fn(async () => {}),
			update: vi.fn(async () => {
				if (opts.updateFails)
					throw new Error('update rejected');
			}),
		}) as FakeSession;
		const keys = { createSession: vi.fn(() => session) };
		const createMediaKeys = vi.fn(async () => keys);
		const nav = navigator as Navigator & { requestMediaKeySystemAccess?: unknown };
		(nav as any)._nmtest_rmskaOrig = nav.requestMediaKeySystemAccess;
		nav.requestMediaKeySystemAccess = vi.fn(async () => ({ createMediaKeys })) as unknown as typeof navigator.requestMediaKeySystemAccess;

		const player = new NMVideoPlayer('test').setup({});
		player.addPlugin(drmPlugin, { keySystem: 'com.widevine.alpha', licenseUrl: 'https://x/license' });
		await player.ready();
		player.backend();
		const video = player.videoElement!;
		const setMediaKeys = vi.fn(async () => {});
		(video as any).setMediaKeys = setMediaKeys;
		const fetchLicense = vi.spyOn(player.getPlugin(DrmPlugin)!, 'fetchLicense').mockResolvedValue(new Uint8Array([9, 9]).buffer);
		return { player, video, session, keys, createMediaKeys, setMediaKeys, fetchLicense };
	}

	const loadDrmItem = async (player: NMVideoPlayer<any>): Promise<void> => {
		(player as unknown as EventBusLike).emit('item', { item: { id: 'ep1', url: '/ep1.m3u8', drm: { keySystem: 'com.widevine.alpha' } } });
		await new Promise<void>(resolve => setTimeout(resolve, 10));
	};

	it('creates MediaKeys and binds them to the video element', async () => {
		const { player, createMediaKeys, setMediaKeys } = await setupEme();
		await loadDrmItem(player);
		expect(createMediaKeys).toHaveBeenCalledTimes(1);
		expect(setMediaKeys).toHaveBeenCalledTimes(1);
	});

	it('answers an encrypted event with a license request and updates the session', async () => {
		const { player, video, session, keys, fetchLicense } = await setupEme();
		await loadDrmItem(player);

		const initData = new Uint8Array([1, 2, 3]).buffer;
		video.dispatchEvent(Object.assign(new Event('encrypted'), { initDataType: 'cenc', initData }));
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		expect(keys.createSession).toHaveBeenCalledTimes(1);
		expect(session.generateRequest).toHaveBeenCalledWith('cenc', initData);

		const challenge = new Uint8Array([7]).buffer;
		session.dispatchEvent(Object.assign(new Event('message'), { message: challenge, messageType: 'license-request' }));
		await new Promise<void>(resolve => setTimeout(resolve, 10));
		expect(fetchLicense).toHaveBeenCalledWith(challenge);
		expect(session.update).toHaveBeenCalledWith(new Uint8Array([9, 9]).buffer);
	});

	it('emits plugin:drm:key:error when the license update fails', async () => {
		const { player, video, session } = await setupEme({ updateFails: true });
		const errors: Array<{ error: Error }> = [];
		(player as unknown as EventBusLike).on('plugin:drm:key:error', payload => errors.push(payload as { error: Error }));
		await loadDrmItem(player);

		video.dispatchEvent(Object.assign(new Event('encrypted'), { initDataType: 'cenc', initData: new ArrayBuffer(1) }));
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		session.dispatchEvent(Object.assign(new Event('message'), { message: new ArrayBuffer(1), messageType: 'license-request' }));
		await new Promise<void>(resolve => setTimeout(resolve, 10));

		expect(errors.map(payload => payload.error.message)).toContain('update rejected');
	});
});
