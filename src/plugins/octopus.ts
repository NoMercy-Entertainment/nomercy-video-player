import { Plugin } from '@nomercy-entertainment/nomercy-player-core';
import type { ResolvedUrl } from '@nomercy-entertainment/nomercy-player-core';
import type { NMVideoPlayer } from '../index';
import SubtitlesOctopus, { type SubtitlesOctopusOptions } from '../../public/js/octopus/subtitles-octopus';

const OCTOPUS_CDN_BASE = 'https://cdn.jsdelivr.net/npm/@nomercy-entertainment/nomercy-video-player@latest/public/js/octopus';

export interface OctopusOptions {
	/** Worker URL (modern). Defaults to the CDN-hosted bundle. */
	workerUrl?: string;
	/** Legacy worker URL for browsers without WebAssembly streaming. */
	legacyWorkerUrl?: string;
	/** Fallback font URL used when the subtitle requests a font not in `fonts`. */
	fallbackFont?: string;
	/** Optional list of font file URLs to preload. */
	fonts?: string[];
	/** Renderer target FPS. */
	targetFps?: number;
	/** Use blend rendering (smoother, slightly heavier). */
	blendRender?: boolean;
	/** Lazy-load subtitle file chunks. */
	lazyFileLoading?: boolean;
	/** Frames to render ahead. */
	renderAhead?: number;
	/** Lossy render mode (faster, lower quality). */
	lossyRender?: boolean;
}

interface OctopusInstance {
	worker: Worker;
	canvasParent: HTMLDivElement;
	dispose: () => void;
}

/**
 * libass-based ASS/SSA subtitle renderer. Wraps the SubtitleOctopus runtime
 * shipped under `public/js/octopus/`.
 *
 * Activation flow:
 *  - Listens to the player's `subtitle` event. When a track is selected,
 *    resolves its URL from `current().subtitles[idx]` and loads it.
 *  - Non-ASS / non-SSA URLs tear down the renderer (native textTracks handle them).
 *  - ResizeObserver keeps the libass canvas matched to the video element.
 *
 * Consumers can also call `setSubtitle(url)` directly for ASS files that
 * aren't part of the playlist item's `subtitles` array.
 */
export class OctopusPlugin extends Plugin<NMVideoPlayer<any>, OctopusOptions> {
	static override readonly id: string = 'octopus';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'libass / SubtitleOctopus integration for ASS/SSA subtitle rendering';

	private instance: OctopusInstance | null = null;
	private currentLoadedUrl: string | null = null;
	private resizeObserver: ResizeObserver | null = null;

	override use(): void {
		this.on('subtitle' as any, (data: { track: string | number | null }) => {
			void this.applyActive(data?.track);
		});

		// Track new playlist items — clear the cached URL so the next
		// `subtitle` event re-resolves against the new item's subtitle list.
		this.on('playlistItem' as any, () => {
			this.destroy();
		});

		if (typeof ResizeObserver !== 'undefined') {
			this.resizeObserver = new ResizeObserver(() => this.resize());
			this.resizeObserver.observe(this.player.container);
			this.lifecycle.addCleanup(() => {
				this.resizeObserver?.disconnect();
				this.resizeObserver = null;
			});
		}

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
	renderer(): unknown {
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
		// Same subtitle already mounted — no-op.
		if (url === this.currentLoadedUrl && this.instance) return;

		this.destroy();
		this.currentLoadedUrl = url;

		try {
			// Race guard: if `destroy()` ran between then and now, abort.
			if (this.currentLoadedUrl !== url) return;

			// Worker can't carry custom Authorization headers — push auth
			// through the player's URL resolver so query-string / signed-URL
			// schemes reach libass intact. Reuse a prefetched resolved form
			// when applyActive() already paid for the round-trip.
			const subResolved = prefetched ?? (await this.resolveUrl(url, 'subtitle'));
			const subUrl = subResolved.href;
			const fontResolveds = await Promise.all(
				(this.opts?.fonts ?? []).map(f => this.resolveUrl(f, 'font')),
			);
			const fontFiles = fontResolveds.map(r => r.href);
			const accessToken = await this.resolveAccessToken();

			// Drop any stale libass canvases that survived a hot-reload.
			(this.player.container.querySelectorAll('.libassjs-canvas-parent') as NodeListOf<HTMLDivElement>)
				.forEach(el => el.remove());

			const config = (this.player as unknown as { options?: { debug?: boolean } }).options ?? {};

			const opts: SubtitlesOctopusOptions = {
				video: this.player.videoElement,
				subUrl,
				fonts: fontFiles,
				lossyRender: this.opts?.lossyRender,
				accessToken,
				targetFps: this.opts?.targetFps,
				debug: config.debug,
				blendRender: this.opts?.blendRender,
				lazyFileLoading: this.opts?.lazyFileLoading,
				renderAhead: this.opts?.renderAhead,
				workerUrl: this.opts?.workerUrl ?? `${OCTOPUS_CDN_BASE}/subtitles-octopus-worker.js`,
				legacyWorkerUrl: this.opts?.legacyWorkerUrl ?? `${OCTOPUS_CDN_BASE}/subtitles-octopus-worker-legacy.js`,
				fallbackFont: this.opts?.fallbackFont ?? `${OCTOPUS_CDN_BASE}/default.ttf`,
				onReady: () => {
					this.emit('ready' as any, { url } as any);
				},
				onError: (event: unknown) => {
					this.report({
						code: 'plugin:octopus/render-error',
						severity: 'warning',
						context: { url },
						cause: event,
					});
				},
			};

			this.instance = new SubtitlesOctopus(opts) as unknown as OctopusInstance;
			this.resize();
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
			inst.worker?.terminate();
			if (inst.canvasParent) inst.dispose();
		}
		catch {
			//
		}
	}

	private resize(): void {
		const inst = this.instance;
		if (!inst?.canvasParent) return;
		const ve = this.player.videoElement;
		if (!ve) return;
		const rect = ve.getBoundingClientRect?.();
		if (!rect) return;
		inst.canvasParent.style.width = `${rect.width}px`;
		inst.canvasParent.style.height = `${rect.height}px`;
		inst.canvasParent.style.position = 'absolute';
		inst.canvasParent.style.top = `${ve.offsetTop}px`;
		inst.canvasParent.style.left = `${ve.offsetLeft}px`;
	}

	/**
	 * Resolve the live bearer token. Reads through `player.getAuth()` so token
	 * refreshes (`setAuth` / `updateAuth` / `refreshAuth`) propagate — reading
	 * `options.auth` would freeze on the setup-time value.
	 */
	private async resolveAccessToken(): Promise<string | undefined> {
		const getAuth = (this.player as unknown as { getAuth?: () => { bearerToken?: unknown } | undefined }).getAuth;
		const live = typeof getAuth === 'function' ? getAuth.call(this.player) : undefined;
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
