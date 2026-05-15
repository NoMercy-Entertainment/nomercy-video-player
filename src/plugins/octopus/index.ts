import { mergeConfig, Plugin } from '@nomercy-entertainment/nomercy-player-core';
import type { ResolvedUrl } from '@nomercy-entertainment/nomercy-player-core';
import { NMSubtitleOctopus } from '@nomercy-entertainment/nomercy-subtitle-octopus';
import type { OctopusOptions as NMOctopusOptions } from '@nomercy-entertainment/nomercy-subtitle-octopus';
import type { NMVideoPlayer } from '../../index';


interface FontManifestEntry {
	file: string;
	mimeType?: string;
}

function isFontEntry(value: unknown): value is FontManifestEntry {
	return (
		value !== null
		&& typeof value === 'object'
		&& 'file' in value
		&& typeof (value as Record<string, unknown>)['file'] === 'string'
	);
}


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
 *
 * Security: all network I/O (subtitle body + font binaries) goes through
 * `this.fetch` (kit auth pipeline). The libass worker receives pre-fetched
 * content as blob URLs / inline strings — it never performs authenticated XHR.
 * TODO(security): strip the auth XHR paths from the worker binaries
 * (`public/subtitles-octopus-worker*.js`) in a follow-up to close the
 * remaining surface in the vendored WASM bundle.
 */
export class OctopusPlugin extends Plugin<NMVideoPlayer<any>, OctopusOptions> {
	static override readonly id: string = 'octopus';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'libass / SubtitleOctopus integration for ASS/SSA subtitle rendering';

	private instance: NMSubtitleOctopus | null = null;
	private currentLoadedUrl: string | null = null;
	/** Memoised font name→blobUrl map for the active playlist item. Null = not yet fetched. */
	private _availableFontsForCurrent: Record<string, string> | null = null;
	/** Blob URLs created during load — revoked in destroy() to avoid memory leaks. */
	private ownedBlobs: string[] = [];

	/** Wires `subtitle` and `current` listeners to load ASS/SSA tracks into the libass renderer. */
	override use(): void {
		this.on('subtitle', (data) => {
			void this.applyActive(data?.track);
		});

		this.on('current', () => {
			this.destroy();
			this._availableFontsForCurrent = null;
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
			return Object.keys(this._availableFontsForCurrent ?? {}).length > 0
				? Object.values(this._availableFontsForCurrent ?? {})
				: (this.opts?.fonts ?? []);
		this.opts = mergeConfig<OctopusOptions>(this.opts ?? {}, { fonts: urls });
		this._availableFontsForCurrent = null;
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

		const resolved = await this.resolveUrl(url, 'subtitle');
		if (resolved.ext !== 'ass' && resolved.ext !== 'ssa') {
			this.destroy();
			return;
		}

		await this.load(url, resolved);
	}

	private resolveTrackUrl(track: string | number): string | null {
		const list = this.player.subtitles?.() ?? [];

		if (typeof track === 'number') {
			return list[track]?.url ?? null;
		}

		const match = list.find(t => t.id === track);
		return match?.url ?? null;
	}

	/**
	 * Resolve the active playlist item's font name→blobUrl map.
	 *
	 * Fetches the `fonts.json` manifest via `this.fetch` (kit auth pipeline),
	 * then fetches each font binary as an ArrayBuffer and creates a blob URL.
	 * Blob URLs are tracked in `ownedBlobs` and revoked when the renderer
	 * is torn down. Memoised per item — the `current` event resets the cache.
	 */
	private async resolveFontsForCurrent(): Promise<Record<string, string>> {
		if (this._availableFontsForCurrent) return this._availableFontsForCurrent;

		const item = this.player.current?.();
		const tracks = Array.isArray(item?.tracks) ? item!.tracks! : [];
		const fontsTrack = tracks.find((t: { kind?: string; file?: string }) => t?.kind === 'fonts');
		const manifestUrl = fontsTrack?.file;

		if (!manifestUrl) {
			const fallbackMap = await this.buildFontMap(this.opts?.fonts ?? []);
			this._availableFontsForCurrent = fallbackMap;
			return this._availableFontsForCurrent;
		}

		try {
			const resolved = await this.resolveUrl(manifestUrl, 'font');
			const rawEntries = await this.fetch<FontManifestEntry[]>(resolved.href, { responseType: 'json' });
			const validEntries: FontManifestEntry[] = Array.isArray(rawEntries)
				? rawEntries.filter(isFontEntry)
				: [];

			const baseFolder = manifestUrl.replace(/\/[^/]*$/u, '');
			const manifestFontUrls = validEntries.map(entry => `${baseFolder}/${entry.file}`);
			const allUrls = [...manifestFontUrls, ...(this.opts?.fonts ?? [])];
			this._availableFontsForCurrent = await this.buildFontMap(allUrls);
		}
		catch (error) {
			this.report({
				code: 'plugin:octopus/fonts-manifest-failed',
				severity: 'warning',
				context: { manifestUrl },
				cause: error,
			});
			this._availableFontsForCurrent = await this.buildFontMap(this.opts?.fonts ?? []);
		}

		return this._availableFontsForCurrent;
	}

	/**
	 * Fetch each font URL as an ArrayBuffer, create a blob URL, and return a
	 * libass name→blobUrl map. Font name is derived from the file path basename
	 * minus extension, lowercased — matching v1's convention and libass expectations.
	 */
	private async buildFontMap(urls: string[]): Promise<Record<string, string>> {
		const entries = await Promise.allSettled(
			urls.map(async (fontUrl) => {
				const buffer = await this.fetch<ArrayBuffer>(fontUrl, { responseType: 'arrayBuffer' });
				const blob = new Blob([buffer]);
				const blobUrl = URL.createObjectURL(blob);
				this.ownedBlobs.push(blobUrl);
				const name = this.fontNameFromUrl(fontUrl);
				return [name, blobUrl] as [string, string];
			}),
		);

		const map: Record<string, string> = {};
		for (const result of entries) {
			if (result.status === 'fulfilled') {
				const [name, blobUrl] = result.value;
				map[name] = blobUrl;
			}
		}
		return map;
	}

	private fontNameFromUrl(url: string): string {
		const pathname = url.split('?')[0] ?? url;
		const basename = pathname.split('/').at(-1) ?? pathname;
		return basename.replace(/\.[^.]+$/u, '').toLowerCase();
	}

	private async load(url: string, prefetched?: ResolvedUrl): Promise<void> {
		if (url === this.currentLoadedUrl && this.instance) return;

		this.destroy();
		this.currentLoadedUrl = url;

		try {
			if (this.currentLoadedUrl !== url) return;

			const subResolved = prefetched ?? (await this.resolveUrl(url, 'subtitle'));
			const subContent = await this.fetch(subResolved.href);
			const availableFonts = await this.resolveFontsForCurrent();

			const videoEl = this.player.videoElement;
			if (!videoEl) return;

			const opts: NMOctopusOptions = {
				video: videoEl,
				trackContent: subContent,
				availableFonts,
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
		this.revokeOwnedBlobs();
		this._availableFontsForCurrent = null;
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

	private revokeOwnedBlobs(): void {
		for (const blobUrl of this.ownedBlobs) {
			try {
				URL.revokeObjectURL(blobUrl);
			}
			catch {
				// Defensive — invalid blob URL should not propagate.
			}
		}
		this.ownedBlobs = [];
	}
}

/** Plugin alias for {@link OctopusPlugin}. Pass to `addPlugin(octopusPlugin)`. */
export const octopusPlugin = OctopusPlugin;
