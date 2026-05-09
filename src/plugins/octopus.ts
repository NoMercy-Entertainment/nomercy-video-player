import { Plugin } from '@nomercy-entertainment/nomercy-player-core';
import type { ResolvedUrl } from '@nomercy-entertainment/nomercy-player-core';
import { NMSubtitleOctopus } from '@nomercy-entertainment/nomercy-subtitle-octopus';
import type { OctopusOptions as NMOctopusOptions } from '@nomercy-entertainment/nomercy-subtitle-octopus';
import type { NMVideoPlayer } from '../index';

/** Options for {@link OctopusPlugin}. */
export interface OctopusOptions {
	/** Worker URL (modern). Defaults to the bundled `public/` URL inside the fork. */
	workerUrl?: string;
	/** Legacy worker URL for browsers without WebAssembly. Optional — modern path only is fine. */
	legacyWorkerUrl?: string;
	/** Fallback font URL used when the subtitle requests a font not in `fonts`. */
	fallbackFont?: string;
	/** Optional list of font file URLs to preload. */
	fonts?: string[];
	/** Renderer target FPS. */
	targetFps?: number;
	/** Render mode — `wasm-blend` (default), `js-blend`, or `lossy`. */
	renderMode?: NMOctopusOptions['renderMode'];
	/** Lazy-load subtitle file chunks — useful for huge ASS files. */
	lazyFileLoading?: boolean;
	/** Internal scaler ratio. */
	prescaleFactor?: number;
	/**
	 * Frames the renderer pre-computes ahead of `currentTime`. Higher values
	 * smooth playback through heavy ASS effects at the cost of memory.
	 * Default `10`.
	 */
	renderAhead?: number;
	/** Toggle debug logging in the upstream worker. */
	debug?: boolean;
}

/**
 * libass-based ASS/SSA subtitle renderer. Thin bridge over
 * `@nomercy-entertainment/nomercy-subtitle-octopus` — the fork carries the
 * five v1 patches (auth pre-fetch, cross-origin worker, canvas geometry,
 * lifecycle race-guard, URL resolution) clean-room reimplemented.
 *
 * Activation flow:
 *  - Listens to the player's `subtitle` event. When a track is selected,
 *    resolves its URL from `current().subtitles[idx]` and loads it.
 *  - Non-ASS / non-SSA URLs tear down the renderer (native textTracks handle them).
 *  - The package internally handles ResizeObserver against the player container.
 *
 * Consumers can also call `subtitle(url)` directly for ASS files that
 * aren't part of the playlist item's `subtitles` array.
 */
export class OctopusPlugin extends Plugin<NMVideoPlayer<any>, OctopusOptions> {
	static override readonly id: string = 'octopus';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'libass / SubtitleOctopus integration for ASS/SSA subtitle rendering';

	private instance: NMSubtitleOctopus | null = null;
	private currentLoadedUrl: string | null = null;
	/** Memoised font URL list for the active playlist item. Null = not yet fetched. */
	private _fontsForCurrent: string[] | null = null;

	/** Wires `subtitle` and `current` listeners to load ASS/SSA tracks into the libass renderer. */
	override use(): void {
		this.on('subtitle', (data) => {
			void this.applyActive(data?.track);
		});

		// New playlist item — clear the cached URL + fonts list so the next
		// `subtitle` event re-resolves against the new item's track list.
		this.on('current', () => {
			this.destroy();
			this._fontsForCurrent = null;
		});

		this.lifecycle.addCleanup(() => this.destroy());
	}

	/** Disposes the libass renderer instance and clears internal URL and font caches. */
	override dispose(): void {
		this.destroy();
	}

	/**
	 * Read or write the active subtitle URL.
	 *
	 * `subtitle()` — currently-loaded URL, or `null` when off.
	 * `subtitle(url)` — swap the active URL at runtime, or `null` to clear.
	 * Bypasses the kit's track list — use this for ASS files the consumer
	 * supplies directly.
	 */
	subtitle(): string | null;
	subtitle(url: string | null): Promise<void>;
	subtitle(url?: string | null): string | null | Promise<void> {
		if (url === undefined)
			return this.currentLoadedUrl;
		if (!url) {
			this.destroy();
			return Promise.resolve();
		}
		return this.load(url);
	}

	/**
	 * Read or write the font list.
	 *
	 * `fonts()` — currently-resolved font URL list. Reflects per-item
	 * `fonts.json` once it's been fetched, plus any plugin-level statics.
	 * `fonts(urls)` — replace the plugin-level static font list and re-load
	 * the active subtitle so new fonts apply.
	 */
	fonts(): readonly string[];
	fonts(urls: string[]): Promise<void>;
	fonts(urls?: string[]): readonly string[] | Promise<void> {
		if (urls === undefined)
			return this._fontsForCurrent ?? this.opts?.fonts ?? [];
		this.opts = { ...(this.opts ?? {}), fonts: urls } as OctopusOptions;
		this._fontsForCurrent = null;
		const url = this.currentLoadedUrl;
		if (url) {
			this.destroy();
			return this.load(url);
		}
		return Promise.resolve();
	}

	/** Raw renderer handle for advanced consumers. Plugin retains lifecycle ownership. */
	renderer(): NMSubtitleOctopus | null {
		return this.instance;
	}

	private async applyActive(track: string | number | null): Promise<void> {
		if (track == null) {
			this.destroy();
			return;
		}

		const url = this.resolveTrackUrl(track);
		if (!url) {
			this.destroy();
			return;
		}

		// Resolver gives us a parsed URL with `.ext` already stripped of
		// query/fragment — no string fiddling needed to gate on file type.
		const resolved = await this.resolveUrl(url, 'subtitle');
		if (resolved.ext !== 'ass' && resolved.ext !== 'ssa') {
			// Native textTracks handle SRT/VTT; tear down libass and let the
			// browser take over.
			this.destroy();
			return;
		}

		await this.load(url, resolved);
	}

	private resolveTrackUrl(track: string | number): string | null {
		// Use the player's merged subtitles() list — backend HLS-managed +
		// sidecar .ass / .vtt tracks. `current().subtitles` doesn't exist;
		// the kit derives the list from the item's `tracks[]` array.
		const subtitlesFn = (this.player as unknown as { subtitles?: () => Array<{ id?: string; url?: string }> }).subtitles;
		const list = typeof subtitlesFn === 'function' ? (subtitlesFn.call(this.player) ?? []) : [];

		if (typeof track === 'number') {
			return list[track]?.url ?? null;
		}

		const match = list.find(t => t.id === track);
		return match?.url ?? null;
	}

	/**
	 * Resolve the active playlist item's font URL list.
	 *
	 * Mirrors v1's behaviour: the item carries a `fonts` track whose `file`
	 * points at a JSON manifest of `[{ file, mimeType }]`; each `file` is
	 * resolved relative to the manifest's directory. Memoised per item — the
	 * `current` event resets the cache.
	 */
	private async resolveFontsForCurrent(): Promise<string[]> {
		if (this._fontsForCurrent) return this._fontsForCurrent;

		const cur = (this.player as unknown as { current?: () => { tracks?: Array<{ kind?: string; file?: string }> } | undefined }).current;
		const item = typeof cur === 'function' ? cur.call(this.player) : undefined;
		const tracks = Array.isArray(item?.tracks) ? item!.tracks! : [];
		const fontsTrack = tracks.find(t => t?.kind === 'fonts');
		const manifestUrl = fontsTrack?.file;

		// No fonts track on this item — fall back to the plugin-level static fonts.
		if (!manifestUrl) {
			const fallback = this.opts?.fonts ?? [];
			this._fontsForCurrent = [...fallback];
			return this._fontsForCurrent;
		}

		try {
			const resolved = await this.resolveUrl(manifestUrl, 'font');
			const r = await fetch(resolved.href);
			if (!r.ok) throw new Error(`fonts.json HTTP ${r.status}`);
			const raw = await r.json() as Array<{ file: string; mimeType?: string }>;
			const baseFolder = manifestUrl.replace(/\/[^/]*$/u, '');
			const urls = raw.map(f => `${baseFolder}/${f.file}`);
			// Concat any plugin-level static fonts after the per-item ones so
			// consumer overrides remain available even when an item ships a manifest.
			this._fontsForCurrent = [...urls, ...(this.opts?.fonts ?? [])];
		}
		catch (error) {
			this.report({
				code: 'plugin:octopus/fonts-manifest-failed',
				severity: 'warning',
				context: { manifestUrl },
				cause: error,
			});
			this._fontsForCurrent = [...(this.opts?.fonts ?? [])];
		}
		return this._fontsForCurrent;
	}

	private async load(url: string, prefetched?: ResolvedUrl): Promise<void> {
		if (url === this.currentLoadedUrl && this.instance) return;

		this.destroy();
		this.currentLoadedUrl = url;

		try {
			if (this.currentLoadedUrl !== url) return;

			// Push subtitle + font URLs through the player's URL resolver so
			// query-string / signed-URL schemes reach libass intact. Reuse a
			// prefetched resolved form when applyActive() already paid for it.
			const subResolved = prefetched ?? (await this.resolveUrl(url, 'subtitle'));
			const subUrl = subResolved.href;
			const fontUrls = await this.resolveFontsForCurrent();
			const fontResolveds = await Promise.all(
				fontUrls.map(f => this.resolveUrl(f, 'font')),
			);
			const fontFiles = fontResolveds.map(r => r.href);
			const accessToken = await this.resolveAccessToken();

			const opts: NMOctopusOptions = {
				video: this.player.videoElement,
				trackUrl: subUrl,
				fonts: fontFiles,
				accessToken,
				targetFps: this.opts?.targetFps,
				renderMode: this.opts?.renderMode,
				lazyFileLoading: this.opts?.lazyFileLoading,
				prescaleFactor: this.opts?.prescaleFactor,
				renderAhead: this.opts?.renderAhead ?? 10,
				debug: this.opts?.debug,
				workerUrl: this.opts?.workerUrl,
				legacyWorkerUrl: this.opts?.legacyWorkerUrl,
				fallbackFont: this.opts?.fallbackFont,
				geometrySource: this.player.container,
			};

			this.instance = new NMSubtitleOctopus(opts);
			this.instance.on('rendererReady', () => {
				this.emit('renderer:ready', { url });
			});
			this.instance.on('error', (err: Error) => {
				this.report({
					code: 'plugin:octopus/render-error',
					severity: 'warning',
					context: { url },
					cause: err,
				});
			});
		}
		catch (error) {
			this.currentLoadedUrl = null;
			this.report({
				code: 'plugin:octopus/load-failed',
				severity: 'warning',
				context: { url },
				cause: error,
			});
		}
	}

	private destroy(): void {
		this.currentLoadedUrl = null;
		const inst = this.instance;
		this.instance = null;
		if (!inst) return;
		try {
			inst.dispose();
		}
		catch {
			// Defensive — never let a teardown error escape the player.
		}
	}

	/**
	 * Resolve the live bearer token. Reads through `player.auth()` so token
	 * refreshes (`auth()` setter / `refreshAuth`) propagate — reading
	 * `options.auth` would freeze on the setup-time value.
	 */
	private async resolveAccessToken(): Promise<string | undefined> {
		const auth = (this.player as unknown as { auth?: () => { bearerToken?: unknown } | undefined }).auth;
		const live = typeof auth === 'function' ? auth.call(this.player) : undefined;
		const v = live?.bearerToken;
		if (!v) return undefined;
		if (typeof v === 'string') return v;
		if (typeof v === 'function') {
			try {
				const out = (v as () => string | Promise<string>)();
				return out instanceof Promise ? await out : out;
			}
			catch {
				return undefined;
			}
		}
		return undefined;
	}
}

/** Plugin alias for {@link OctopusPlugin}. Pass to `addPlugin(octopusPlugin)`. */
export const octopusPlugin = OctopusPlugin;
