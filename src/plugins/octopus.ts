import { Plugin } from '@nomercy-entertainment/nomercy-player-core';
import type { ResolvedUrl } from '@nomercy-entertainment/nomercy-player-core';
import { NMSubtitleOctopus } from '@nomercy-entertainment/nomercy-subtitle-octopus';
import type { OctopusOptions as NMOctopusOptions } from '@nomercy-entertainment/nomercy-subtitle-octopus';
import type { NMVideoPlayer } from '../index';

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
	/** Frames to render ahead. */
	prescaleFactor?: number;
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

	override use(): void {
		this.on('subtitle' as any, (data: { track: string | number | null }) => {
			void this.applyActive(data?.track);
		});

		// Track new playlist items — clear the cached URL so the next
		// `subtitle` event re-resolves against the new item's subtitle list.
		this.on('playlistItem' as any, () => {
			this.destroy();
		});

		this.lifecycle.addCleanup(() => this.destroy());
	}

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
	 * `fonts()` — current array of font URLs (empty when none).
	 * `fonts(urls)` — replace the font list and re-load the active subtitle so
	 * new fonts apply.
	 */
	fonts(): readonly string[];
	fonts(urls: string[]): Promise<void>;
	fonts(urls?: string[]): readonly string[] | Promise<void> {
		if (urls === undefined)
			return this.opts?.fonts ?? [];
		this.opts = { ...(this.opts ?? {}), fonts: urls } as OctopusOptions;
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
		const current = (this.player as unknown as { current?: () => { subtitles?: Array<{ id?: string; url?: string }> } | null }).current;
		const item = typeof current === 'function' ? current.call(this.player) : null;
		const list = item?.subtitles ?? [];

		if (typeof track === 'number') {
			return list[track]?.url ?? null;
		}

		const match = list.find(t => t.id === track);
		return match?.url ?? null;
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
			const fontResolveds = await Promise.all(
				(this.opts?.fonts ?? []).map(f => this.resolveUrl(f, 'font')),
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
				workerUrl: this.opts?.workerUrl,
				legacyWorkerUrl: this.opts?.legacyWorkerUrl,
				fallbackFont: this.opts?.fallbackFont,
				geometrySource: this.player.container,
			};

			this.instance = new NMSubtitleOctopus(opts);
			this.instance.on('rendererReady', () => {
				this.emit('renderer:ready' as any, { url } as any);
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

export const octopusPlugin = OctopusPlugin;
