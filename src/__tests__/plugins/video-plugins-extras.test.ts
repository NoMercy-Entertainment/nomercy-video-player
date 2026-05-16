/**
 * Tests for the second-tier video plugins:
 *   - mediaSession (video override of getMetadata — title/show/season/poster)
 *   - castSender (degrades to unsupported when cast.framework is missing)
 *   - drm (degrades to unsupported when requestMediaKeySystemAccess is missing)
 *   - liveTranscoding (opens a WebSocket via this.websocket(url))
 *
 * All four plugins must register cleanly in JSDOM. None of them throw past
 * `use()` even when their underlying browser API is unavailable.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NMVideoPlayer } from '../../index';
import { CastSenderPlugin, castSenderPlugin } from '../../plugins/cast-sender';
import { DrmPlugin, drmPlugin } from '../../plugins/drm';
import { LiveTranscodingPlugin, liveTranscodingPlugin } from '../../plugins/live-transcoding';
import { MediaSessionPlugin, mediaSessionPlugin } from '../../plugins/media-session';

describe('video-plugins (extras)', () => {
	beforeEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	const setup = () => new NMVideoPlayer('test').setup({});

	describe('MediaSessionPlugin (video)', () => {
		it('getMetadata reads video-specific text fields (title/show/season)', async () => {
			const p = setup();
			p.addPlugin(mediaSessionPlugin);
			await p.ready();
			const inst = p.getPlugin(MediaSessionPlugin)!;
			expect(inst).toBeInstanceOf(MediaSessionPlugin);

			const item = {
				id: 'tt-001',
				title: 'Pilot',
				show: 'Test Show',
				season: 1,
				poster: 'https://example.com/poster.jpg',
			} as any;

			const meta = (inst as unknown as { getMetadata: (i: any) => any }).getMetadata(item);
			expect(meta.title).toBe('Pilot');
			expect(meta.artist).toBe('Test Show');
			expect(meta.album).toBe('Season 1');
			// Artwork is resolved by the kit base class via resolveUrl(url, 'poster')
			// and applied asynchronously by _pushMetadata — covered in kit tests.
			expect(meta.artwork).toBeUndefined();
		});

		it('getMetadata falls back to year when show is absent', async () => {
			const p = setup();
			p.addPlugin(mediaSessionPlugin);
			await p.ready();
			const inst = p.getPlugin(MediaSessionPlugin)!;

			const item = { id: 'm-001', title: 'Movie', year: 2024 } as any;
			const meta = (inst as unknown as { getMetadata: (i: any) => any }).getMetadata(item);
			expect(meta.title).toBe('Movie');
			expect(meta.artist).toBe('2024');
			expect(meta.album).toBe('');
			expect(meta.artwork).toBeUndefined();
		});
	});

	describe('CastSenderPlugin', () => {
		it('isConnected() returns false in JSDOM (no cast.framework)', async () => {
			const p = setup();
			p.addPlugin(castSenderPlugin);
			await p.ready();
			const inst = p.getPlugin(CastSenderPlugin)!;
			expect(inst).toBeInstanceOf(CastSenderPlugin);
			expect(inst.isConnected()).toBe(false);
		});

		it('connect() throws BrowserPolicyError when cast framework is missing', async () => {
			const p = setup();
			p.addPlugin(castSenderPlugin);
			await p.ready();
			const inst = p.getPlugin(CastSenderPlugin)!;
			let caught: unknown;
			try { await inst.connect(); }
			catch (e) { caught = e; }
			expect(caught).toBeDefined();
			expect((caught as Error).message).toMatch(/cast/i);
		});

		it('forwards player current → loadMedia with TvShowMediaMetadata for episodes', async () => {
			const loadMedia = vi.fn().mockResolvedValue(undefined);
			const requestSession = vi.fn().mockResolvedValue(undefined);
			const sessionStub = { loadMedia, getCastDevice: () => ({ friendlyName: 'TV' }) };
			class StubRemote {
				isConnected = true;
				isPaused = false;
				isMuted = false;
				currentTime = 0;
				duration = 0;
				volumeLevel = 1;
				mediaInfo: { contentId?: string } | null = null;
			}
			class StubController {
				addEventListener = vi.fn();
				removeEventListener = vi.fn();
				playOrPause = vi.fn();
				stop = vi.fn();
				seek = vi.fn();
				setVolumeLevel = vi.fn();
				muteOrUnmute = vi.fn();
				constructor(_r: StubRemote) {}
			}
			class MediaInfoCtor { constructor(public contentId: string, public contentType: string) {} }
			class LoadRequestCtor { constructor(public media: unknown) {} }
			class GenericMetaCtor {}
			class TvShowMetaCtor {}
			(globalThis as any).cast = {
				framework: {
					CastContext: { getInstance: () => ({ requestSession, getCurrentSession: () => sessionStub, endCurrentSession: vi.fn() }) },
					RemotePlayer: StubRemote,
					RemotePlayerController: StubController,
					RemotePlayerEventType: {
						IS_CONNECTED_CHANGED: 'isConnectedChanged',
						IS_PAUSED_CHANGED: 'isPausedChanged',
						CURRENT_TIME_CHANGED: 'currentTimeChanged',
						IS_MEDIA_LOADED_CHANGED: 'isMediaLoadedChanged',
						MEDIA_INFO_CHANGED: 'mediaInfoChanged',
						VOLUME_LEVEL_CHANGED: 'volumeLevelChanged',
						IS_MUTED_CHANGED: 'isMutedChanged',
					},
				},
			};
			(globalThis as any).chrome = {
				cast: {
					media: {
						MediaInfo: MediaInfoCtor,
						LoadRequest: LoadRequestCtor,
						GenericMediaMetadata: GenericMetaCtor,
						TvShowMediaMetadata: TvShowMetaCtor,
						StreamType: { BUFFERED: 'BUFFERED', LIVE: 'LIVE' },
					},
				},
			};

			try {
				const p = setup();
				p.addPlugin(castSenderPlugin);
				await p.ready();
				const inst = p.getPlugin(CastSenderPlugin)!;

				const episode = {
					id: 'ep-1',
					title: 'Pilot',
					show: 'Test Show',
					season: 1,
					episode: 1,
					url: 'https://cdn/ep1.mp4',
					poster: 'https://cdn/poster.jpg',
				};
				(p as any).current = (): unknown => episode;

				inst.connect();
				// connect() resolves async; let the promise chain settle.
				await new Promise(resolve => setTimeout(resolve, 0));
				await new Promise(resolve => setTimeout(resolve, 0));
				expect(inst.isConnected()).toBe(true);

				(p as any).emit('current', { item: episode, index: 0 });
				await new Promise(resolve => setTimeout(resolve, 0));

				expect(loadMedia).toHaveBeenCalled();
				const call = loadMedia.mock.calls[0]?.[0] as { media?: any };
				const media = call?.media;
				expect(media).toBeDefined();
				expect(media.contentId).toBe('https://cdn/ep1.mp4');
				expect(media.contentType).toBe('video/mp4');
				expect(media.streamType).toBe('BUFFERED');
				expect(media.metadata).toBeInstanceOf(TvShowMetaCtor);
				expect(media.metadata.title).toBe('Pilot');
				expect(media.metadata.seriesTitle).toBe('Test Show');
				expect(media.metadata.season).toBe(1);
				expect(media.metadata.episode).toBe(1);
				expect(media.metadata.images?.[0]?.url).toBe('https://cdn/poster.jpg');
			}
			finally {
				delete (globalThis as any).cast;
				delete (globalThis as any).chrome;
			}
		});

		it('mirrors receiver IS_PAUSED_CHANGED back as a player pause with {source:cast, silent:true}', async () => {
			const requestSession = vi.fn().mockResolvedValue(undefined);
			const handlers: Record<string, (e: { value: unknown }) => void> = {};
			class StubRemote {
				isConnected = true;
				isPaused = false;
				isMuted = false;
				currentTime = 0;
				duration = 0;
				volumeLevel = 1;
				mediaInfo: { contentId?: string } | null = null;
			}
			let stubRemoteRef: StubRemote | null = null as StubRemote | null;
			class StubController {
				addEventListener = (event: string, handler: (e: { value: unknown }) => void): void => {
					handlers[event] = handler;
				};
				removeEventListener = vi.fn();
				playOrPause = vi.fn();
				stop = vi.fn();
				seek = vi.fn();
				setVolumeLevel = vi.fn();
				muteOrUnmute = vi.fn();
				constructor(_r: StubRemote) {}
			}
			(globalThis as any).cast = {
				framework: {
					CastContext: { getInstance: () => ({ requestSession, getCurrentSession: () => ({ loadMedia: vi.fn().mockResolvedValue(undefined) }), endCurrentSession: vi.fn() }) },
					RemotePlayer: class extends StubRemote { constructor() { super(); stubRemoteRef = this; } },
					RemotePlayerController: StubController,
					RemotePlayerEventType: {
						IS_CONNECTED_CHANGED: 'isConnectedChanged',
						IS_PAUSED_CHANGED: 'isPausedChanged',
						CURRENT_TIME_CHANGED: 'currentTimeChanged',
						IS_MEDIA_LOADED_CHANGED: 'isMediaLoadedChanged',
						MEDIA_INFO_CHANGED: 'mediaInfoChanged',
						VOLUME_LEVEL_CHANGED: 'volumeLevelChanged',
						IS_MUTED_CHANGED: 'isMutedChanged',
					},
				},
			};
			(globalThis as any).chrome = { cast: { media: { MediaInfo: class { constructor() {} }, LoadRequest: class { constructor() {} }, GenericMediaMetadata: class {}, TvShowMediaMetadata: class {}, StreamType: { BUFFERED: 'BUFFERED', LIVE: 'LIVE' } } } };

			try {
				const p = setup();
				p.addPlugin(castSenderPlugin);
				await p.ready();
				const inst = p.getPlugin(CastSenderPlugin)!;
				(p as any).current = (): unknown => undefined;

				inst.connect();
				await new Promise(resolve => setTimeout(resolve, 0));
				await new Promise(resolve => setTimeout(resolve, 0));

				const seenPause: any[] = [];
				p.on('pause' as any, (data: any) => { seenPause.push(data); });

				if (stubRemoteRef) (stubRemoteRef as StubRemote).isPaused = true;
				handlers['isPausedChanged']?.({ value: true });

				expect(seenPause.length).toBeGreaterThan(0);
				expect(seenPause[0]).toMatchObject({ source: 'cast', silent: true });
			}
			finally {
				delete (globalThis as any).cast;
				delete (globalThis as any).chrome;
			}
		});
	});

	describe('DrmPlugin', () => {
		it('use() does not throw on platforms without requestMediaKeySystemAccess', async () => {
			const p = setup();
			expect(() => p.addPlugin(drmPlugin, { keySystem: 'com.widevine.alpha', licenseUrl: 'https://example.com/license' })).not.toThrow();
			await p.ready();
			const inst = p.getPlugin(DrmPlugin)!;
			expect(inst).toBeInstanceOf(DrmPlugin);
			// JSDOM has no EME — mediaKeys() should return null.
			expect(inst.mediaKeys()).toBeNull();
		});
	});

	describe('LiveTranscodingPlugin', () => {
		it('use() opens a WebSocket via the configured wsUrl', async () => {
			const opens: string[] = [];
			class FakeChannel {
				readyState: 'connecting' | 'open' | 'closing' | 'closed' = 'open';
				private listeners = new Map<string, Set<(d?: unknown) => void>>();
				constructor(public url: string) { opens.push(url); }
				send(_data: unknown): void { /* no-op */ }
				close(): void { this.readyState = 'closed'; }
				on(event: string, fn: (d?: unknown) => void): void {
					if (!this.listeners.has(event)) this.listeners.set(event, new Set());
					this.listeners.get(event)!.add(fn);
				}
				off(event: string, fn: (d?: unknown) => void): void {
					this.listeners.get(event)?.delete(fn);
				}
			}

			const p = new NMVideoPlayer('test').setup({
				websocketFactory: ((url: string) => new FakeChannel(url)) as any,
			});
			p.addPlugin(liveTranscodingPlugin, { wsUrl: 'ws://example.com/live' });
			await p.ready();

			const inst = p.getPlugin(LiveTranscodingPlugin)!;
			expect(inst).toBeInstanceOf(LiveTranscodingPlugin);
			expect(opens).toEqual(['ws://example.com/live']);
		});

		it('use() is a no-op when no wsUrl/controlUrl is given', async () => {
			const p = setup();
			expect(() => p.addPlugin(liveTranscodingPlugin)).not.toThrow();
			await p.ready();
			const inst = p.getPlugin(LiveTranscodingPlugin)!;
			expect(inst.transcodedTo()).toBe(0);
		});
	});
});
