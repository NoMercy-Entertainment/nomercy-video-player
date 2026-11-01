// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { HlsConfig, Loader, LoaderCallbacks, LoaderConfiguration, LoaderContext, LoaderStats } from 'hls.js';

export type HlsLoaderConstructor = new (config: HlsConfig) => Loader<LoaderContext>;

export interface WarmEntry {
	data: ArrayBuffer;
	/** Wall time the original fetch took; replayed into hls.js's bandwidth estimate. */
	fetchMs: number;
}

export type WarmEntries = Map<string, Promise<WarmEntry | undefined>>;

export interface WarmOptions {
	/** Media segments to fetch per stream after its playlist. */
	segments: number;
	/** Height of the level the viewer is on now; the warmed level is the nearest one. */
	preferredHeight?: number;
	/** Stop starting new segment fetches once this many bytes are held. */
	maxBytes: number;
	authHeader?: (url: string) => string | undefined;
	fetch?: typeof fetch;
}

export interface WarmedSource {
	entries: WarmEntries;
	/** Absolute URL of the level playlist that was warmed, for the start-level pick. */
	levelUrl: string | undefined;
}

interface MasterVariant {
	uri: string;
	height: number;
	bandwidth: number;
	audioGroup: string | undefined;
}

export function warmKey(url: string, rangeStart?: number, rangeEnd?: number): string {
	// hls.js sends 0..0 for a request without a byte range.
	const ranged = (rangeStart ?? 0) !== 0 || (rangeEnd ?? 0) !== 0;
	return ranged ? `${url}#${rangeStart}-${rangeEnd}` : url;
}

/** Resolve like hls.js: an absolute master gives absolute children, a root-relative master gives root-relative ones. */
function resolveChild(child: string, masterUrl: string): string {
	const resolved = new URL(child, new URL(masterUrl, 'http://warm.invalid'));
	return /^[a-z][a-z0-9+.-]*:/i.test(masterUrl) ? resolved.href : `${resolved.pathname}${resolved.search}`;
}

function parseAttributes(line: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	const body = line.slice(line.indexOf(':') + 1);
	for (const match of body.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)) {
		attrs[match[1]!] = match[2]!.replace(/^"|"$/g, '');
	}
	return attrs;
}

function pickVariant(master: string, preferredHeight: number | undefined): MasterVariant | undefined {
	const lines = master.split(/\r?\n/);
	const variants: MasterVariant[] = [];
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]!;
		if (!line.startsWith('#EXT-X-STREAM-INF'))
			continue;
		const uri = lines.slice(index + 1).find(next => next.trim() !== '' && !next.startsWith('#'));
		if (!uri)
			continue;
		const attrs = parseAttributes(line);
		const height = Number(attrs.RESOLUTION?.split('x')[1] ?? 0);
		variants.push({ uri: uri.trim(), height, bandwidth: Number(attrs.BANDWIDTH ?? 0), audioGroup: attrs.AUDIO });
	}
	if (variants.length === 0)
		return undefined;
	if (preferredHeight === undefined || preferredHeight <= 0)
		return variants.reduce((low, next) => (next.bandwidth < low.bandwidth ? next : low));
	return variants.reduce((best, next) => (Math.abs(next.height - preferredHeight) < Math.abs(best.height - preferredHeight) ? next : best));
}

function pickAudioUri(master: string, group: string | undefined): string | undefined {
	if (group === undefined)
		return undefined;
	const candidates = master.split(/\r?\n/)
		.filter(line => line.startsWith('#EXT-X-MEDIA') && line.includes('TYPE=AUDIO'))
		.map(parseAttributes)
		.filter(attrs => attrs['GROUP-ID'] === group && attrs.URI);
	const chosen = candidates.find(attrs => attrs.DEFAULT === 'YES') ?? candidates[0];
	return chosen?.URI;
}

/** Init segment first, then the first `count` media segments. Empty when byte ranges make the keys unpredictable. */
function leadingResources(playlist: string, count: number): string[] {
	if (playlist.includes('#EXT-X-BYTERANGE'))
		return [];
	const resources: string[] = [];
	const lines = playlist.split(/\r?\n/);
	const mapLine = lines.find(line => line.startsWith('#EXT-X-MAP'));
	const mapUri = mapLine ? parseAttributes(mapLine).URI : undefined;
	if (mapUri)
		resources.push(mapUri);
	for (const line of lines) {
		if (resources.length >= count + (mapUri ? 1 : 0))
			break;
		if (line.trim() !== '' && !line.startsWith('#'))
			resources.push(line.trim());
	}
	return resources;
}

/**
 * Fetches the opening of an HLS stream ahead of the `load()` that will need it
 * and holds the bodies in memory, keyed by URL. hls.js is pointed at them
 * through `createWarmLoader`, so the swap needs no HTTP cache headers.
 */
export class HlsWarmCache {
	private _url: string | undefined;
	private _source: WarmedSource | undefined;
	private _abort: AbortController | undefined;
	private _bytes = 0;

	/** The master URL warmed or being warmed; `undefined` when idle. */
	get url(): string | undefined {
		return this._url;
	}

	/** Start warming `masterUrl`. A second call for the same URL is a no-op. */
	async warm(masterUrl: string, opts: WarmOptions): Promise<void> {
		if (this._url === masterUrl)
			return;
		this.cancel();

		const abort = new AbortController();
		this._abort = abort;
		this._url = masterUrl;
		this._bytes = 0;
		const entries: WarmEntries = new Map();
		const source: WarmedSource = { entries, levelUrl: undefined };
		this._source = source;

		const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
		const grab = (url: string): Promise<WarmEntry | undefined> => {
			const startedAt = performance.now();
			const authorization = opts.authHeader?.(url);
			return doFetch(url, {
				signal: abort.signal,
				headers: authorization ? { Authorization: authorization } : undefined,
				priority: 'low',
			}).then(async (response) => {
				if (!response.ok)
					return undefined;
				const data = await response.arrayBuffer();
				this._bytes += data.byteLength;
				return { data, fetchMs: performance.now() - startedAt };
			}).catch(() => undefined);
		};
		const register = (url: string): Promise<WarmEntry | undefined> => {
			const pending = grab(url);
			entries.set(warmKey(url), pending);
			return pending;
		};
		const text = async (entry: Promise<WarmEntry | undefined>): Promise<string | undefined> => {
			const resolved = await entry;
			return resolved ? new TextDecoder().decode(resolved.data) : undefined;
		};

		const master = await text(register(masterUrl));
		if (master === undefined || abort.signal.aborted)
			return;

		const variant = pickVariant(master, opts.preferredHeight);
		if (variant === undefined)
			return;
		const levelUrl = resolveChild(variant.uri, masterUrl);
		source.levelUrl = levelUrl;
		const audioUri = pickAudioUri(master, variant.audioGroup);
		const streams = [levelUrl, ...(audioUri ? [resolveChild(audioUri, masterUrl)] : [])];

		await Promise.all(streams.map(async (playlistUrl) => {
			const playlist = await text(register(playlistUrl));
			if (playlist === undefined)
				return;
			for (const resource of leadingResources(playlist, opts.segments)) {
				if (abort.signal.aborted || this._bytes >= opts.maxBytes)
					return;
				await register(resolveChild(resource, playlistUrl));
			}
		}));
	}

	/** Hand the warmed bodies to the `load()` that needs them and forget them here. */
	take(masterUrl: string): WarmedSource | undefined {
		if (this._url !== masterUrl || this._source === undefined)
			return undefined;
		const source = this._source;
		this._url = undefined;
		this._source = undefined;
		this._abort = undefined;
		return source;
	}

	/** Abort in-flight fetches and drop everything held. Idempotent. */
	cancel(): void {
		this._abort?.abort();
		this._abort = undefined;
		this._source = undefined;
		this._url = undefined;
		this._bytes = 0;
	}
}

/**
 * Wraps hls.js's own loader: a URL held in `entries` is answered from memory,
 * anything else goes to the network exactly as before.
 */
export function createWarmLoader(Base: HlsLoaderConstructor, entries: WarmEntries): HlsLoaderConstructor {
	return class WarmLoader implements Loader<LoaderContext> {
		private readonly _inner: Loader<LoaderContext>;
		private _aborted = false;

		constructor(config: HlsConfig) {
			this._inner = new Base(config);
		}

		get stats(): LoaderStats {
			return this._inner.stats;
		}

		get context(): LoaderContext | null {
			return this._inner.context;
		}

		load(context: LoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>): void {
			const key = warmKey(context.url, context.rangeStart, context.rangeEnd);
			const held = entries.get(key);
			if (held === undefined) {
				this._inner.load(context, config, callbacks);
				return;
			}
			entries.delete(key);
			this._aborted = false;
			void held.then((entry) => {
				if (this._aborted)
					return;
				if (entry === undefined) {
					this._inner.load(context, config, callbacks);
					return;
				}
				const stats = this._inner.stats;
				const now = performance.now();
				stats.loaded = entry.data.byteLength;
				stats.total = entry.data.byteLength;
				stats.loading.start = now - entry.fetchMs;
				stats.loading.first = now - entry.fetchMs;
				stats.loading.end = now;
				const data = context.responseType === 'arraybuffer' ? entry.data : new TextDecoder().decode(entry.data);
				callbacks.onSuccess({ url: context.url, data }, stats, context, null);
			});
		}

		abort(): void {
			this._aborted = true;
			this._inner.abort();
		}

		destroy(): void {
			this._aborted = true;
			this._inner.destroy();
		}
	};
}
