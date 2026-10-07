// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { ResolvedUrl } from '@nomercy-entertainment/nomercy-player-core';
import type { OctopusOptions as NMOctopusOptions } from '@nomercy-entertainment/nomercy-subtitle-octopus';
import type { NMVideoPlayer } from '../../index';
import type { VideoPlaylistItem } from '../../types';
import { mergeConfig, Plugin } from '@nomercy-entertainment/nomercy-player-core';
import { readFontFamilyNames } from './font-names';
import { scaleAssFontSize } from './style-scale';

// A zero or negative scale would ask libass for text that cannot be drawn.
const MIN_FONT_SCALE = 0.1;

interface FontManifestEntry {
	file: string;
	mimeType?: string;
}

function isFontEntry(value: unknown): value is FontManifestEntry {
	return (
		value !== null
		&& typeof value === 'object'
		&& 'file' in value
		&& typeof (value as Record<string, unknown>).file === 'string'
	);
}

/** Minimal interface describing the subset of NMSubtitleOctopus we call. */
interface SubtitleOctopusInstance {
	on(event: string, fn: (...args: unknown[]) => void): void;
	/** Replaces the track; the renderer remounts and redraws the current frame. */
	trackContent(content: string | null): void;
	dispose(): void;
}

/** Minimal shape of the NMSubtitleOctopus constructor options we pass. */
interface SubtitleOctopusCtorOptions {
	video: HTMLVideoElement;
	trackContent: unknown;
	availableFonts: Record<string, string>;
	targetFps?: number;
	renderMode?: NMOctopusOptions['renderMode'];
	lazyFileLoading?: boolean;
	prescaleFactor?: number;
	renderAhead?: number;
	debug?: boolean;
	workerUrl?: string;
	legacyWorkerUrl?: string;
	fallbackFont?: string;
	geometrySource?: HTMLElement;
}

/** Minimal constructor signature resolved from the dynamic import. */
type SubtitleOctopusCtor = new (opts: SubtitleOctopusCtorOptions) => SubtitleOctopusInstance;

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
	/** Render mode. Default `'wasm-blend'`. */
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
 * `@nomercy-entertainment/nomercy-subtitle-octopus` — the NoMercy fork
 * with auth pre-fetch, cross-origin worker support, canvas geometry fixes,
 * lifecycle race-guard, and URL resolution built in.
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
 *
 * Bundled dependency: `@nomercy-entertainment/nomercy-subtitle-octopus` is a
 * regular `dependency` — it ships with the package, not as an optional peer.
 */
export class OctopusPlugin<T extends VideoPlaylistItem = VideoPlaylistItem> extends Plugin<NMVideoPlayer<T>, OctopusOptions> {
	static override readonly id: string = 'octopus';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'libass / SubtitleOctopus integration for ASS/SSA subtitle rendering';

	private instance: SubtitleOctopusInstance | null = null;
	private currentLoadedUrl: string | null = null;
	/** Cached constructor from the dynamic import. `null` = import failed (degraded). `undefined` = not yet attempted. */
	private _ctor: SubtitleOctopusCtor | null | undefined = undefined;
	/** Memoised font name→blobUrl map for the active playlist item. Null = not yet fetched. */
	private _availableFontsForCurrent: Record<string, string> | null = null;
	/** Blob URLs created during load — revoked in destroy() to avoid memory leaks. */
	private ownedBlobs: string[] = [];
	/** The track as fetched, before the viewer's size is applied. Null when nothing is shown. */
	private trackSource: string | null = null;
	private appliedScale = 1;

	/**
	 * Accepts constructor-supplied opts for callers that instantiate the plugin
	 * directly (`new OctopusPlugin(opts)`). Stores them so they survive the
	 * kit's `initialize()` call, which would otherwise overwrite them with
	 * `undefined` when opts aren't passed through `addPlugin`.
	 */
	constructor(opts?: OctopusOptions) {
		super();
		this._ctorOpts = opts;
	}

	private _ctorOpts: OctopusOptions | undefined;

	/**
	 * Falls back to constructor-supplied opts when `opts` arrives as `undefined`
	 * (e.g. when the plugin is registered via the `registerPlugin` shim).
	 */
	override initialize(
		player: NMVideoPlayer<T>,
		opts: OctopusOptions,
		lifecycle: Parameters<Plugin<NMVideoPlayer<T>, OctopusOptions>['initialize']>[2],
	): void {
		const resolvedOpts: OctopusOptions = opts ?? this._ctorOpts ?? {};
		super.initialize(player, resolvedOpts, lifecycle);
	}

	/** Wires `subtitle` and `current` listeners to load ASS/SSA tracks into the libass renderer. */
	override use(): void {
		this.on('subtitle', (data) => {
			void this.applyActive(data?.track);
		});

		this.on('subtitleStyle', () => {
			this.applyStyle();
		});

		this.on('item', () => {
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
		if (urls === undefined) {
			return Object.keys(this._availableFontsForCurrent ?? {}).length > 0
				? Object.values(this._availableFontsForCurrent ?? {})
				: (this.opts?.fonts ?? []);
		}
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
	renderer(): SubtitleOctopusInstance | null {
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

	/** The viewer's caption size as a scale, 1 being the track's own. */
	private wantedScale(): number {
		const size = this.player.subtitleStyle().fontSize;
		return Math.max(size / 100, MIN_FONT_SCALE);
	}

	/**
	 * Hand the renderer the track at the viewer's size. Replacing the track
	 * makes it redraw the current frame, so a paused video follows too.
	 */
	private applyStyle(): void {
		const source = this.trackSource;
		const scale = this.wantedScale();
		if (!this.instance || source === null || scale === this.appliedScale)
			return;
		this.appliedScale = scale;
		this.instance.trackContent(scaleAssFontSize(source, scale));
	}

	private resolveTrackUrl(track: string | number): string | null {
		const list = this.player.subtitles?.() ?? [];

		if (typeof track === 'number') {
			return list[track]?.url ?? null;
		}

		const match = list.find(subtitleTrack => subtitleTrack.id === track);
		return match?.url ?? null;
	}

	/**
	 * Lazily import `@nomercy-entertainment/nomercy-subtitle-octopus`. On
	 * first call the import result is cached; subsequent calls return the
	 * cached value without re-importing. When the peer is absent the import
	 * rejects, the error is logged, and `_ctor` is set to `null` so the
	 * plugin degrades gracefully on every future call.
	 */
	private async loadCtor(): Promise<SubtitleOctopusCtor | null> {
		if (this._ctor !== undefined)
			return this._ctor;

		try {
			const mod = await import('@nomercy-entertainment/nomercy-subtitle-octopus');
			const ctor = (mod.NMSubtitleOctopus) as SubtitleOctopusCtor | undefined;
			if (typeof ctor !== 'function') {
				// eslint-disable-next-line player/no-raw-throw-in-plugin -- local control flow: this throw never escapes the plugin, it is caught by the try/catch below which logs and degrades to null (ASS/SSA disabled). Not a consumer-facing error, so this.throw() would be wrong.
				throw new TypeError('nomercy-subtitle-octopus did not export NMSubtitleOctopus');
			}
			this._ctor = ctor;
		}
		catch (error) {
			this._ctor = null;
			this.logger.warn(
				'[octopus] optional peer @nomercy-entertainment/nomercy-subtitle-octopus not available — '
				+ 'ASS/SSA subtitle rendering is disabled.',
				error,
			);
		}

		return this._ctor;
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
		if (this._availableFontsForCurrent)
			return this._availableFontsForCurrent;

		const item = this.player.item?.();

		// The typed `fonts` field carries either a `fonts.json` manifest URL or
		// direct font file URLs (the FontTrackRef contract allows both — NoMercy
		// items ship the direct list, the track-derived fallback the manifest).
		const typedFonts = (Array.isArray(item?.fonts) ? item!.fonts : [])
			.filter(entry => typeof entry?.file === 'string' && entry.file.length > 0);
		const isManifest = (file: string): boolean => /\.json(?:$|\?)/iu.test(file);
		const manifestUrl = typedFonts.find(entry => isManifest(entry.file))?.file;
		const directFiles = typedFonts.filter(entry => !isManifest(entry.file)).map(entry => entry.file);

		if (!manifestUrl && directFiles.length === 0) {
			const fallbackMap = await this.buildFontMap(this.opts?.fonts ?? []);
			this._availableFontsForCurrent = fallbackMap;
			return this._availableFontsForCurrent;
		}

		const fontUrls: string[] = [];

		if (manifestUrl) {
			try {
				const resolved = await this.resolveUrl(manifestUrl, 'font');
				const rawEntries = await this.fetch<FontManifestEntry[]>(resolved.href, { responseType: 'json' });
				const validEntries: FontManifestEntry[] = Array.isArray(rawEntries)
					? rawEntries.filter(isFontEntry)
					: [];

				const baseFolder = manifestUrl.replace(/\/[^/]*$/u, '');
				fontUrls.push(...validEntries.map(entry => `${baseFolder}/${entry.file}`));
			}
			catch (error) {
				this.report({
					code: 'plugin:octopus/fonts-manifest-failed',
					severity: 'warning',
					context: { manifestUrl },
					cause: error,
				});
			}
		}

		// Direct font paths are server-relative on the wire — resolve through
		// the player's url pipeline (baseUrl + auth transform) before fetching.
		for (const file of directFiles) {
			try {
				fontUrls.push((await this.resolveUrl(file, 'font')).href);
			}
			catch {
				fontUrls.push(file);
			}
		}

		this._availableFontsForCurrent = await this.buildFontMap([...fontUrls, ...(this.opts?.fonts ?? [])]);
		return this._availableFontsForCurrent;
	}

	/**
	 * Fetch each font URL as an ArrayBuffer, create a blob URL, and return a
	 * libass name→blobUrl map.
	 *
	 * The worker looks each ASS `Fontname` up in this map, so the keys must be
	 * the names the font declares internally — not its filename. Every name the
	 * font answers to is registered, with the basename kept as an alias for the
	 * rare release whose attachments are named after the family.
	 */
	private async buildFontMap(urls: string[]): Promise<Record<string, string>> {
		const entries = await Promise.allSettled(
			urls.map(async (fontUrl) => {
				const buffer = await this.fetch<ArrayBuffer>(fontUrl, { responseType: 'arrayBuffer' });
				const blob = new Blob([buffer]);
				const blobUrl = URL.createObjectURL(blob);
				this.ownedBlobs.push(blobUrl);
				const names = [...readFontFamilyNames(buffer), this.fontNameFromUrl(fontUrl)];
				return [names, blobUrl] as [string[], string];
			}),
		);

		const map: Record<string, string> = {};
		for (const result of entries) {
			if (result.status !== 'fulfilled')
				continue;
			const [names, blobUrl] = result.value;
			for (const name of names) {
				// First font to claim a name keeps it — attachment order decides,
				// matching how libass itself resolves a duplicate family.
				map[name] ??= blobUrl;
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
		if (url === this.currentLoadedUrl && this.instance)
			return;

		this.destroy();
		this.currentLoadedUrl = url;

		const OctopusCtor = await this.loadCtor();
		if (!OctopusCtor) {
			// Peer absent — plugin degraded. Silently no-op; logger already warned in loadCtor().
			this.currentLoadedUrl = null;
			return;
		}

		try {
			if (this.currentLoadedUrl !== url)
				return;

			const subResolved = prefetched ?? (await this.resolveUrl(url, 'subtitle'));
			const subContent = await this.fetch(subResolved.href);
			const availableFonts = await this.resolveFontsForCurrent();

			const videoEl = this.player.videoElement;
			if (!videoEl)
				return;

			this.trackSource = String(subContent);
			this.appliedScale = this.wantedScale();

			const opts: SubtitleOctopusCtorOptions = {
				video: videoEl,
				trackContent: scaleAssFontSize(this.trackSource, this.appliedScale),
				availableFonts,
				targetFps: this.opts?.targetFps,
				renderMode: this.opts?.renderMode ?? 'wasm-blend',
				lazyFileLoading: this.opts?.lazyFileLoading,
				prescaleFactor: this.opts?.prescaleFactor,
				renderAhead: this.opts?.renderAhead ?? 10,
				debug: this.opts?.debug,
				workerUrl: this.opts?.workerUrl,
				legacyWorkerUrl: this.opts?.legacyWorkerUrl,
				fallbackFont: this.opts?.fallbackFont,
				geometrySource: this.player.container,
			};

			this.instance = new OctopusCtor(opts);
			this.instance.on('rendererReady', () => {
				this.emit('renderer:ready', { url });
			});
			this.instance.on('error', (err: unknown) => {
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
		this.trackSource = null;
		this.revokeOwnedBlobs();
		this._availableFontsForCurrent = null;
		const inst = this.instance;
		this.instance = null;
		if (!inst)
			return;
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
