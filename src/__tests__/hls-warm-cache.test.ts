import type { Loader, LoaderCallbacks, LoaderConfiguration, LoaderContext, LoaderStats } from 'hls.js';
import Hls from 'hls.js';
import { describe, expect, it, vi } from 'vitest';
import { createWarmLoader, HlsWarmCache, warmKey } from '../adapters/video-backend/hls-warm-cache';

const DEFAULT_CONFIG = Hls.DefaultConfig;

const BASE = 'https://media.example.test/ep2';

const MASTER = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Japanese",DEFAULT=YES,URI="audio_ja/index.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",DEFAULT=NO,URI="audio_en/index.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=320x180,AUDIO="aud"
v0/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=640x360,AUDIO="aud"
v1/index.m3u8
`;

function levelPlaylist(count: number): string {
	let body = '#EXTM3U\n#EXT-X-TARGETDURATION:4\n';
	for (let index = 0; index < count; index++)
		body += `#EXTINF:4.0,\nseg_${String(index).padStart(3, '0')}.ts\n`;
	return `${body}#EXT-X-ENDLIST\n`;
}

function fakeFetch(segmentBytes = 1000) {
	const calls: string[] = [];
	const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url = String(input);
		calls.push(url);
		if (init?.signal?.aborted)
			throw new DOMException('aborted', 'AbortError');
		if (url.endsWith('master.m3u8'))
			return new Response(MASTER);
		if (url.endsWith('index.m3u8'))
			return new Response(levelPlaylist(10));
		return new Response(new Uint8Array(segmentBytes));
	});
	return { calls, impl };
}

function options(fetchImpl: typeof fetch, extra: Partial<Parameters<HlsWarmCache['warm']>[1]> = {}): Parameters<HlsWarmCache['warm']>[1] {
	return {
		segments: 3,
		maxBytes: 1_000_000,
		fetch: fetchImpl,
		...extra,
	};
}

describe('HlsWarmCache', () => {
	it('fetches the master, the matching level playlist, its first N segments and the default audio rendition', async () => {
		const { calls, impl } = fakeFetch();
		const cache = new HlsWarmCache();
		await cache.warm(`${BASE}/master.m3u8`, options(impl, { preferredHeight: 360 }));

		expect(calls).toContain(`${BASE}/master.m3u8`);
		expect(calls).toContain(`${BASE}/v1/index.m3u8`);
		expect(calls).not.toContain(`${BASE}/v0/index.m3u8`);
		expect(calls.filter(url => url.startsWith(`${BASE}/v1/seg_`))).toHaveLength(3);
		expect(calls).toContain(`${BASE}/audio_ja/index.m3u8`);
		expect(calls).not.toContain(`${BASE}/audio_en/index.m3u8`);
		expect(calls.filter(url => url.startsWith(`${BASE}/audio_ja/seg_`))).toHaveLength(3);
	});

	it('keeps children root-relative when the master URL is root-relative, as hls.js does', async () => {
		const { calls, impl } = fakeFetch();
		await new HlsWarmCache().warm('/ep2/master.m3u8', options(impl));
		expect(calls).toContain('/ep2/v0/index.m3u8');
		expect(calls).toContain('/ep2/v0/seg_000.ts');
	});

	it('keys a request without a byte range the same way hls.js sends it (0..0)', () => {
		expect(warmKey(`${BASE}/v0/seg_000.ts`, 0, 0)).toBe(warmKey(`${BASE}/v0/seg_000.ts`));
		expect(warmKey(`${BASE}/v0/seg_000.ts`, 0, 99)).not.toBe(warmKey(`${BASE}/v0/seg_000.ts`));
	});

	it('picks the lowest level when no height is known, matching a cold hls.js start', async () => {
		const { calls, impl } = fakeFetch();
		await new HlsWarmCache().warm(`${BASE}/master.m3u8`, options(impl));
		expect(calls).toContain(`${BASE}/v0/index.m3u8`);
	});

	it('warms the same master only once', async () => {
		const { calls, impl } = fakeFetch();
		const cache = new HlsWarmCache();
		await cache.warm(`${BASE}/master.m3u8`, options(impl));
		const first = calls.length;
		await cache.warm(`${BASE}/master.m3u8`, options(impl));
		expect(calls).toHaveLength(first);
	});

	it('stops starting segment fetches once the byte cap is reached', async () => {
		const { calls, impl } = fakeFetch(600);
		await new HlsWarmCache().warm(`${BASE}/master.m3u8`, options(impl, { maxBytes: 1000, segments: 8 }));
		expect(calls.filter(url => url.includes('/v0/seg_')).length).toBeLessThan(8);
	});

	it('hands the warmed bodies to take() once and then forgets them', async () => {
		const { impl } = fakeFetch();
		const cache = new HlsWarmCache();
		await cache.warm(`${BASE}/master.m3u8`, options(impl));
		expect(cache.take(`${BASE}/other.m3u8`)).toBeUndefined();
		const source = cache.take(`${BASE}/master.m3u8`);
		expect(source?.entries.has(warmKey(`${BASE}/master.m3u8`))).toBe(true);
		expect(source?.levelUrl).toBe(`${BASE}/v0/index.m3u8`);
		expect(cache.take(`${BASE}/master.m3u8`)).toBeUndefined();
	});

	it('cancel() aborts in-flight fetches and drops the entries', async () => {
		const signals: AbortSignal[] = [];
		const impl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			signals.push(init!.signal!);
			return new Promise<Response>(() => {});
		});
		const cache = new HlsWarmCache();
		void cache.warm(`${BASE}/master.m3u8`, options(impl));
		cache.cancel();
		expect(signals[0]?.aborted).toBe(true);
		expect(cache.url).toBeUndefined();
		expect(cache.take(`${BASE}/master.m3u8`)).toBeUndefined();
	});

	it('sends the Authorization header the provider returns', async () => {
		const { impl } = fakeFetch();
		await new HlsWarmCache().warm(`${BASE}/master.m3u8`, options(impl, { authHeader: () => 'Bearer test-token' }));
		const init = impl.mock.calls[0]![1];
		expect(init?.headers).toEqual({ Authorization: 'Bearer test-token' });
	});
});

describe('createWarmLoader', () => {
	const timing = { start: 0, first: 0, end: 0 };
	const configuration: LoaderConfiguration = {
		loadPolicy: { maxTimeToFirstByteMs: 1000, maxLoadTimeMs: 1000, timeoutRetry: null, errorRetry: null },
		maxRetry: 0,
		timeout: 1000,
		retryDelay: 0,
		maxRetryDelay: 0,
	};

	function baseLoader() {
		const networkLoads: string[] = [];
		class Base implements Loader<LoaderContext> {
			stats: LoaderStats = { aborted: false, loaded: 0, retry: 0, total: 0, chunkCount: 0, bwEstimate: 0, loading: { ...timing }, parsing: { start: 0, end: 0 }, buffering: { ...timing } };
			context: LoaderContext | null = null;
			load(context: LoaderContext): void {
				networkLoads.push(context.url);
			}

			abort(): void {}
			destroy(): void {}
		}
		return { Base, networkLoads };
	}

	// The enum is type-only in hls.js's public typings; parse keeps the literal assignable.
	const request = (url: string, responseType: string): LoaderContext => JSON.parse(JSON.stringify({ url, responseType, type: 'level' }));
	const callbacks = (onSuccess = vi.fn()): LoaderCallbacks<LoaderContext> => ({ onSuccess, onError: vi.fn(), onTimeout: vi.fn() });
	const settle = async (): Promise<void> => {
		await Promise.resolve();
		await Promise.resolve();
	};

	it('answers a held URL from memory without touching the network', async () => {
		const { Base, networkLoads } = baseLoader();
		const body = new TextEncoder().encode(levelPlaylist(2));
		const entries = new Map([[warmKey(`${BASE}/v0/index.m3u8`), Promise.resolve({ data: body.buffer, fetchMs: 90 })]]);
		const WarmLoader = createWarmLoader(Base, entries);
		const onSuccess = vi.fn();

		new WarmLoader(DEFAULT_CONFIG).load(request(`${BASE}/v0/index.m3u8`, 'text'), configuration, callbacks(onSuccess));
		await settle();

		expect(networkLoads).toHaveLength(0);
		expect(onSuccess).toHaveBeenCalledTimes(1);
		expect(typeof onSuccess.mock.calls[0]![0].data).toBe('string');
		const stats: LoaderStats = onSuccess.mock.calls[0]![1];
		expect(stats.loading.end - stats.loading.first).toBeCloseTo(90, 0);
	});

	it('falls through to the network for a URL it does not hold', () => {
		const { Base, networkLoads } = baseLoader();
		const WarmLoader = createWarmLoader(Base, new Map());
		new WarmLoader(DEFAULT_CONFIG).load(request(`${BASE}/v1/index.m3u8`, 'text'), configuration, callbacks());
		expect(networkLoads).toEqual([`${BASE}/v1/index.m3u8`]);
	});

	it('falls through to the network when the warm fetch failed', async () => {
		const { Base, networkLoads } = baseLoader();
		const entries = new Map([[warmKey(`${BASE}/v0/seg_000.ts`), Promise.resolve(undefined)]]);
		const WarmLoader = createWarmLoader(Base, entries);
		new WarmLoader(DEFAULT_CONFIG).load(request(`${BASE}/v0/seg_000.ts`, 'arraybuffer'), configuration, callbacks());
		await settle();
		expect(networkLoads).toEqual([`${BASE}/v0/seg_000.ts`]);
	});
});
