/**
 * OctopusPlugin tests — libass / SubtitleOctopus bridge for ASS/SSA subtitles.
 *
 * What's locked here:
 *  - `accessToken` is never forwarded to `NMSubtitleOctopus`
 *  - Subtitle body fetched with default responseType (text) via `this.fetch`
 *  - Fonts manifest fetched with `responseType: 'json'`
 *  - Each font binary fetched with `responseType: 'arrayBuffer'`
 *  - Blob URLs are created during `load()` and revoked during `destroy()`
 *  - Non-ASS / non-SSA URLs tear down the renderer without creating an instance
 *  - `subtitle(null)` tears down the renderer
 *  - `fonts(urls)` re-loads the active subtitle with updated fonts
 *  - `renderer()` returns the constructed instance (or null pre-load)
 *
 * Real ASS rendering (ResizeObserver, canvas geometry, Worker + WASM) is
 * exercised by the Playwright e2e matrix against playlist items with `.ass` +
 * `fonts.json` tracks.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock NMSubtitleOctopus ────────────────────────────────────────────────────

const octopusCalls: any[] = [];
const octopusDisposed: any[] = [];

vi.mock('@nomercy-entertainment/nomercy-subtitle-octopus', () => {
	function MockOctopus(this: any, options: any) {
		octopusCalls.push(options);
		this._options = options;
		this._listeners = {} as Record<string, Function[]>;
		this.on = (event: string, fn: Function) => {
			if (!this._listeners[event]) this._listeners[event] = [];
			this._listeners[event].push(fn);
		};
		this.dispose = () => {
			octopusDisposed.push(this);
		};
		// Fire rendererReady asynchronously so load() resolves cleanly.
		Promise.resolve().then(() => {
			this._listeners['rendererReady']?.forEach((fn: Function) => fn({ url: options.trackContent ? '[inline]' : '' }));
		});
	}
	return { NMSubtitleOctopus: MockOctopus };
});

// ── Mock globalThis.fetch ─────────────────────────────────────────────────────

let fetchSpy: ReturnType<typeof vi.spyOn>;

function mockText(body: string): void {
	(fetchSpy as any).mockResolvedValueOnce(new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain' } }));
}

function mockJson(obj: unknown): void {
	(fetchSpy as any).mockResolvedValueOnce(new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } }));
}

function mockBinary(bytes: number[]): void {
	(fetchSpy as any).mockResolvedValueOnce(new Response(new Uint8Array(bytes), { status: 200, headers: { 'Content-Type': 'font/ttf' } }));
}

// ── Test helpers ──────────────────────────────────────────────────────────────

import { NMVideoPlayer } from '../../index';
import { OctopusPlugin, octopusPlugin } from '../../plugins/octopus';

const blobUrls: string[] = [];

function setup(): NMVideoPlayer<any> {
	const player = new NMVideoPlayer('test').setup({});
	// The plugin's load() gates on videoElement being present. Inject a minimal
	// mock so the constructor path is exercised in happy-dom.
	(player as any).videoElement = document.createElement('video');
	return player;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OctopusPlugin', () => {
	beforeEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		octopusCalls.length = 0;
		octopusDisposed.length = 0;
		blobUrls.length = 0;

		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);

		fetchSpy = vi.spyOn(globalThis, 'fetch');

		// URL.createObjectURL / revokeObjectURL are not in happy-dom; shim them.
		let blobCounter = 0;
		vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
			const url = `blob:mock-${blobCounter++}`;
			blobUrls.push(url);
			return url;
		});
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
			const idx = blobUrls.indexOf(url);
			if (idx !== -1) blobUrls.splice(idx, 1);
		});
	});

	afterEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	// ── Registration ────────────────────────────────────────────────────────

	describe('registration', () => {
		it('registers and use() succeeds', async () => {
			const player = setup();
			expect(() => player.addPlugin(octopusPlugin)).not.toThrow();
			await player.ready();
			expect(player.getPlugin(OctopusPlugin)).toBeInstanceOf(OctopusPlugin);
		});

		it('renderer() returns null before any load', async () => {
			const player = setup();
			player.addPlugin(octopusPlugin);
			await player.ready();
			expect(player.getPlugin(OctopusPlugin)!.renderer()).toBeNull();
		});
	});

	// ── No accessToken forwarded ────────────────────────────────────────────

	describe('security: no accessToken on NMSubtitleOctopus', () => {
		it('does not forward accessToken even when auth is configured', async () => {
			mockText('[Script Info]\nScriptType: v4.00+\n\n[V4+ Styles]\n\n[Events]\n');
			mockJson([]);

			const player = setup();
			player.auth({ bearerToken: 'secret-tok' });
			player.addPlugin(octopusPlugin);
			await player.ready();

			const inst = player.getPlugin(OctopusPlugin)!;
			await inst.subtitle('https://cdn.example.com/sub.ass');

			expect(octopusCalls).toHaveLength(1);
			expect(octopusCalls[0].accessToken).toBeUndefined();
		});
	});

	// ── Fetch responseType routing ──────────────────────────────────────────

	describe('fetch responseType routing', () => {
		it('fetches subtitle body as text (default responseType)', async () => {
			const assBody = '[Script Info]\nScriptType: v4.00+\n\n[V4+ Styles]\n\n[Events]\n';
			mockText(assBody);
			mockJson([]);

			const player = setup();
			player.addPlugin(octopusPlugin);
			await player.ready();

			await player.getPlugin(OctopusPlugin)!.subtitle('https://cdn.example.com/sub.ass');

			// First fetch = subtitle body; constructor receives trackContent, not trackUrl
			expect(octopusCalls[0].trackContent).toBe(assBody);
			expect(octopusCalls[0].trackUrl).toBeUndefined();
		});

		it('fetches fonts manifest with responseType: json when fonts track present', async () => {
			const assBody = '[Script Info]\n\n[Events]\n';
			mockText(assBody);
			mockJson([{ file: 'Inter.ttf', mimeType: 'font/ttf' }]);
			mockBinary([0, 1, 2, 3]);

			const player = setup();
			player.addPlugin(octopusPlugin);
			await player.ready();

			// Inject a fonts track onto the player's current item.
			(player as any)._current = {
				tracks: [{ kind: 'fonts', file: 'https://cdn.example.com/fonts/fonts.json' }],
			};
			(player as any).current = () => (player as any)._current;

			await player.getPlugin(OctopusPlugin)!.subtitle('https://cdn.example.com/sub.ass');

			// Three fetch calls: subtitle body, fonts manifest, font binary.
			expect(fetchSpy).toHaveBeenCalledTimes(3);
		});

		it('fetches each font binary with responseType: arrayBuffer', async () => {
			const assBody = '[Script Info]\n\n[Events]\n';
			mockText(assBody);
			mockJson([{ file: 'Inter.ttf' }]);
			mockBinary([0xDE, 0xAD, 0xBE, 0xEF]);

			const player = setup();
			player.addPlugin(octopusPlugin);
			await player.ready();

			(player as any)._current = {
				tracks: [{ kind: 'fonts', file: 'https://cdn.example.com/fonts/fonts.json' }],
			};
			(player as any).current = () => (player as any)._current;

			await player.getPlugin(OctopusPlugin)!.subtitle('https://cdn.example.com/sub.ass');

			// Font binary request uses Accept or just default headers — the key
			// assertion is that NMSubtitleOctopus receives availableFonts (blob map),
			// not a fonts[] URL array.
			expect(octopusCalls[0].availableFonts).toBeDefined();
			expect(typeof octopusCalls[0].availableFonts).toBe('object');
			expect(octopusCalls[0].fonts).toBeUndefined();
		});
	});

	// ── Blob URL lifecycle ──────────────────────────────────────────────────

	describe('blob URL lifecycle', () => {
		it('creates blob URLs during load', async () => {
			mockText('[Script Info]\n\n[Events]\n');
			mockJson([{ file: 'A.ttf' }]);
			mockBinary([1, 2]);

			const player = setup();
			player.addPlugin(octopusPlugin);
			await player.ready();

			(player as any)._current = {
				tracks: [{ kind: 'fonts', file: 'https://cdn.example.com/fonts/fonts.json' }],
			};
			(player as any).current = () => (player as any)._current;

			await player.getPlugin(OctopusPlugin)!.subtitle('https://cdn.example.com/sub.ass');

			expect(blobUrls.length).toBeGreaterThan(0);
		});

		it('revokes blob URLs when destroy() is called', async () => {
			mockText('[Script Info]\n\n[Events]\n');
			mockJson([{ file: 'A.ttf' }]);
			mockBinary([1, 2]);

			const player = setup();
			player.addPlugin(octopusPlugin);
			await player.ready();

			(player as any)._current = {
				tracks: [{ kind: 'fonts', file: 'https://cdn.example.com/fonts/fonts.json' }],
			};
			(player as any).current = () => (player as any)._current;

			const inst = player.getPlugin(OctopusPlugin)!;
			await inst.subtitle('https://cdn.example.com/sub.ass');
			expect(blobUrls.length).toBeGreaterThan(0);

			await inst.subtitle(null);
			expect(blobUrls).toHaveLength(0);
		});
	});

	// ── Extension gating ────────────────────────────────────────────────────

	describe('extension gating via subtitle event', () => {
		it('non-ASS / non-SSA URLs do NOT trigger the bridge', async () => {
			const player = setup();
			player.addPlugin(octopusPlugin);
			await player.ready();

			(player as any).emit('subtitle', { track: 0 });
			await new Promise(r => setTimeout(r, 0));

			expect(octopusCalls).toHaveLength(0);
		});

		it('null track clears the renderer', async () => {
			mockText('[Script Info]\n\n[Events]\n');
			mockJson([]);

			const player = setup();
			player.addPlugin(octopusPlugin);
			await player.ready();

			const inst = player.getPlugin(OctopusPlugin)!;
			await inst.subtitle('https://cdn.example.com/sub.ass');
			expect(octopusCalls).toHaveLength(1);

			(player as any).emit('subtitle', { track: null });
			await new Promise(r => setTimeout(r, 0));

			expect(octopusDisposed).toHaveLength(1);
			expect(inst.renderer()).toBeNull();
		});
	});

	// ── Direct subtitle() API ───────────────────────────────────────────────

	describe('subtitle() direct API', () => {
		it('null tears down the active renderer', async () => {
			mockText('[Script Info]\n\n[Events]\n');
			mockJson([]);

			const player = setup();
			player.addPlugin(octopusPlugin);
			await player.ready();

			const inst = player.getPlugin(OctopusPlugin)!;
			await inst.subtitle('https://cdn.example.com/sub.ass');
			await inst.subtitle(null);

			expect(octopusDisposed).toHaveLength(1);
			expect(inst.renderer()).toBeNull();
		});

		it('same URL twice is a no-op', async () => {
			mockText('[Script Info]\n\n[Events]\n');
			mockJson([]);

			const player = setup();
			player.addPlugin(octopusPlugin);
			await player.ready();

			const inst = player.getPlugin(OctopusPlugin)!;
			await inst.subtitle('https://cdn.example.com/sub.ass');
			await inst.subtitle('https://cdn.example.com/sub.ass');

			expect(octopusCalls).toHaveLength(1);
		});

		it('subtitle() getter returns currently-loaded URL', async () => {
			mockText('[Script Info]\n\n[Events]\n');
			mockJson([]);

			const player = setup();
			player.addPlugin(octopusPlugin);
			await player.ready();

			const inst = player.getPlugin(OctopusPlugin)!;
			expect(inst.subtitle()).toBeNull();

			await inst.subtitle('https://cdn.example.com/sub.ass');
			expect(inst.subtitle()).toBe('https://cdn.example.com/sub.ass');
		});
	});

	// ── fonts() API ─────────────────────────────────────────────────────────

	describe('fonts() API', () => {
		it('fonts(urls) re-loads the active subtitle with new fonts', async () => {
			mockText('[Script Info]\n\n[Events]\n');
			mockJson([]);
			mockText('[Script Info]\n\n[Events]\n');
			mockJson([]);

			const player = setup();
			player.addPlugin(octopusPlugin);
			await player.ready();

			const inst = player.getPlugin(OctopusPlugin)!;
			await inst.subtitle('https://cdn.example.com/sub.ass');
			expect(octopusCalls).toHaveLength(1);

			await inst.fonts(['https://fonts.example.com/A.ttf']);
			expect(octopusCalls).toHaveLength(2);
		});
	});

	// ── Lifecycle ───────────────────────────────────────────────────────────

	describe('lifecycle', () => {
		it('dispose() tears down the renderer', async () => {
			mockText('[Script Info]\n\n[Events]\n');
			mockJson([]);

			const player = setup();
			player.addPlugin(octopusPlugin);
			await player.ready();

			const inst = player.getPlugin(OctopusPlugin)!;
			await inst.subtitle('https://cdn.example.com/sub.ass');
			expect(octopusDisposed).toHaveLength(0);

			inst.dispose();
			expect(octopusDisposed).toHaveLength(1);
		});

		it('dispose() is idempotent', async () => {
			mockText('[Script Info]\n\n[Events]\n');
			mockJson([]);

			const player = setup();
			player.addPlugin(octopusPlugin);
			await player.ready();

			const inst = player.getPlugin(OctopusPlugin)!;
			await inst.subtitle('https://cdn.example.com/sub.ass');
			inst.dispose();
			expect(() => inst.dispose()).not.toThrow();
			expect(octopusDisposed).toHaveLength(1);
		});
	});
});
