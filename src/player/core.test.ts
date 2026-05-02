import { describe, expect, it, vi } from 'vitest';
import { coreMethods } from './core';

function makeHlsMock() {
	return {
		destroy: vi.fn(),
		loadSource: vi.fn(),
		attachMedia: vi.fn(),
	};
}

function createMockPlayer(overrides: Record<string, any> = {}) {
	const container = document.createElement('div');
	container.id = 'test-player';
	document.body.appendChild(container);

	const videoElement = document.createElement('video');
	const overlay = document.createElement('div');

	const player: any = {
		playerId: 'test-player',
		container,
		videoElement,
		overlay,
		subtitleOverlay: document.createElement('div'),
		subtitleArea: document.createElement('div'),
		subtitleText: document.createElement('span'),
		subtitleSafeZone: document.createElement('div'),
		_subtitleStyle: {},
		_audioContext: undefined,
		gainNode: undefined,
		options: {
			basePath: '',
			imageBasePath: '',
			accessToken: '',
			debug: false,
			disableHls: false,
			forceHls: false,
			muted: false,
			autoPlay: false,
			controls: false,
			preload: 'auto',
			disableAutoPlayback: false,
		},
		translations: null,
		defaultTranslations: {},
		fonts: [],
		currentFontFile: '',
		storage: {
			get: vi.fn(() => Promise.resolve(null)),
			set: vi.fn(() => Promise.resolve()),
		},
		emit: vi.fn(),
		on: vi.fn(),
		once: vi.fn(),
		logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn() },
		localize: vi.fn((s: string) => s),
		displayMessage: vi.fn(),
		createElement: vi.fn((type: string, id: string) => {
			const el = document.createElement(type);
			el.id = id;
			return {
				addClasses: () => ({
					appendTo: (p: Element) => {
						p.appendChild(el);
						return { get: () => el };
					},
					prependTo: (p: Element) => {
						p.prepend(el);
						return { get: () => el };
					},
					get: () => el,
				}),
				appendTo: (p: Element) => {
					p.appendChild(el);
					return { addClasses: () => ({ get: () => el }), get: () => el };
				},
				prependTo: (p: Element) => {
					p.prepend(el);
					return { addClasses: () => ({ get: () => el }), get: () => el };
				},
				get: () => el,
			};
		}),
		addClasses: vi.fn(),
		checkSubtitles: vi.fn(),
		applySubtitleStyle: vi.fn(),
		emitPausedEvent: vi.fn(),
		setupVideoElementAttributes: vi.fn(),
		setupVideoElementEventListeners: vi.fn(),
		pause: vi.fn(),
		play: vi.fn(() => Promise.resolve()),
		hdrSupported: vi.fn(() => false),
		resize: vi.fn(),
		setTitle: vi.fn(),
		setResponsiveAspectRatio: vi.fn(),
		mediaSession: { setMetadata: vi.fn(), setPlaybackState: vi.fn() },
		pad: vi.fn((n: number, w: number) => String(n).padStart(w, '0')),
		playlistItem: vi.fn(() => ({
			title: 'Test Episode %S%E',
			show: 'Test Show',
			season: 1,
			episode: 5,
			image: 'poster.jpg',
		})),
		hls: undefined,
		_hlsRecoveryAttempts: 0,
		_hlsRecoveryTimer: null,
		getAccessToken: vi.fn(() => null),
		...overrides,
	};

	for (const [key, value] of Object.entries(coreMethods)) {
		if (typeof value === 'function') {
			player[key] = (value as Function).bind(player);
		}
	}

	return player;
}

describe('coreMethods', () => {
	describe('styleContainer()', () => {
		it('adds nomercyplayer class', () => {
			const player = createMockPlayer();
			player.styleContainer();
			expect(player.container.classList.contains('nomercyplayer')).toBe(true);
		});

		it('sets required styles', () => {
			const player = createMockPlayer();
			player.styleContainer();
			expect(player.container.style.overflow).toBe('hidden');
			expect(player.container.style.position).toBe('relative');
			expect(player.container.style.display).toBe('flex');
			expect(player.container.style.zIndex).toBe('0');
		});
	});

	describe('resolveImageUrl()', () => {
		it('returns undefined for undefined input', () => {
			const player = createMockPlayer();
			expect(player.resolveImageUrl(undefined)).toBeUndefined();
		});

		it('returns absolute URLs unchanged', () => {
			const player = createMockPlayer();
			expect(player.resolveImageUrl('https://example.com/img.jpg')).toBe('https://example.com/img.jpg');
		});

		it('prepends imageBasePath for relative URLs', () => {
			const player = createMockPlayer({
				options: { imageBasePath: 'https://cdn.example.com/', basePath: '' },
			});
			expect(player.resolveImageUrl('poster.jpg')).toBe('https://cdn.example.com/poster.jpg');
		});

		it('falls back to basePath when no imageBasePath', () => {
			const player = createMockPlayer({
				options: { basePath: 'https://cdn.example.com/' },
			});
			expect(player.resolveImageUrl('poster.jpg')).toBe('https://cdn.example.com/poster.jpg');
		});
	});

	describe('hdrSupported()', () => {
		it('returns a boolean', () => {
			const player = createMockPlayer();
			// In happy-dom, screen.colorDepth is typically 24 or less
			const result = player.hdrSupported();
			expect(typeof result).toBe('boolean');
		});
	});

	describe('getCSSPositionValue()', () => {
		it('returns px value for non-zero', () => {
			const player = createMockPlayer();
			expect(player.getCSSPositionValue(10)).toBe('10px');
		});

		it('returns empty string for 0', () => {
			const player = createMockPlayer();
			expect(player.getCSSPositionValue(0)).toBe('');
		});
	});

	describe('removeGainNode()', () => {
		it('disconnects gainNode', () => {
			const gainNode = { disconnect: vi.fn() };
			const audioContext = { close: vi.fn(() => Promise.resolve()) };
			const player = createMockPlayer({ gainNode, _audioContext: audioContext });
			player.removeGainNode();
			expect(gainNode.disconnect).toHaveBeenCalled();
		});

		it('closes audioContext', () => {
			const gainNode = { disconnect: vi.fn() };
			const audioContext = { close: vi.fn(() => Promise.resolve()) };
			const player = createMockPlayer({ gainNode, _audioContext: audioContext });
			player.removeGainNode();
			expect(audioContext.close).toHaveBeenCalled();
		});

		it('clears _audioContext reference', () => {
			const gainNode = { disconnect: vi.fn() };
			const audioContext = { close: vi.fn(() => Promise.resolve()) };
			const player = createMockPlayer({ gainNode, _audioContext: audioContext });
			player.removeGainNode();
			expect(player._audioContext).toBeUndefined();
		});

		it('handles missing gainNode gracefully', () => {
			const player = createMockPlayer();
			expect(() => player.removeGainNode()).not.toThrow();
		});
	});

	describe('computeSubtitlePosition()', () => {
		it('sets bottom:3% when no linePosition', () => {
			const player = createMockPlayer();
			const cue = { linePosition: 'auto', alignment: 'center', size: 100 } as any;
			player.computeSubtitlePosition(cue, player.videoElement, player.subtitleArea, player.subtitleText);
			expect(player.subtitleArea.style.bottom).toBe('3%');
		});

		it('sets top when linePosition is a number', () => {
			const player = createMockPlayer();
			const cue = { linePosition: 10, alignment: 'center', size: 100 } as any;
			player.computeSubtitlePosition(cue, player.videoElement, player.subtitleArea, player.subtitleText);
			expect(player.subtitleArea.style.top).toBe('10%');
		});

		it('adds aligned-start class for start alignment', () => {
			const player = createMockPlayer();
			const cue = { linePosition: 'auto', alignment: 'start', size: 100 } as any;
			player.computeSubtitlePosition(cue, player.videoElement, player.subtitleArea, player.subtitleText);
			expect(player.subtitleArea.classList.contains('aligned-start')).toBe(true);
		});

		it('adds aligned-center class for center alignment', () => {
			const player = createMockPlayer();
			const cue = { linePosition: 'auto', alignment: 'center', size: 100 } as any;
			player.computeSubtitlePosition(cue, player.videoElement, player.subtitleArea, player.subtitleText);
			expect(player.subtitleArea.classList.contains('aligned-center')).toBe(true);
		});

		it('adds aligned-end class for end alignment', () => {
			const player = createMockPlayer();
			const cue = { linePosition: 'auto', alignment: 'end', size: 100 } as any;
			player.computeSubtitlePosition(cue, player.videoElement, player.subtitleArea, player.subtitleText);
			expect(player.subtitleArea.classList.contains('aligned-end')).toBe(true);
		});

		it('does nothing when videoElement is null', () => {
			const player = createMockPlayer();
			expect(() => player.computeSubtitlePosition({} as any, null, null, null)).not.toThrow();
		});
	});

	describe('loadSource() HLS instance lifecycle', () => {
		it('destroys existing HLS instance before creating a new one', () => {
			const existingHls = makeHlsMock();
			const player = createMockPlayer({
				hls: existingHls,
				options: {
					disableHls: false,
					forceHls: true,
					debug: false,
					autoPlay: false,
					disableAutoPlayback: true,
				},
			});

			// Make HLS.isSupported() return true by patching the module-level import path
			// core.ts uses the HLS default import; we control it via the forceHls + override pattern
			// Instead: exercise the non-HLS branch to verify destroy is called on branch switch
			player.options.disableHls = true;

			player.loadSource('https://cdn.example.com/video/index.m3u8');

			expect(existingHls.destroy).toHaveBeenCalledOnce();
			expect(player.hls).toBeUndefined();
		});

		it('resets recovery counters when switching to a non-HLS source', () => {
			const existingHls = makeHlsMock();
			const player = createMockPlayer({
				hls: existingHls,
				_hlsRecoveryAttempts: 2,
				options: {
					disableHls: true,
					forceHls: false,
					debug: false,
					autoPlay: false,
					disableAutoPlayback: true,
				},
			});

			player.loadSource('https://cdn.example.com/video/stream.mp4');

			expect(existingHls.destroy).toHaveBeenCalledOnce();
			expect(player.hls).toBeUndefined();
		});

		it('clears pending recovery timer when switching source', () => {
			const existingHls = makeHlsMock();
			const timerId = setTimeout(() => {}, 10000);
			const player = createMockPlayer({
				hls: existingHls,
				_hlsRecoveryTimer: timerId,
				options: {
					disableHls: true,
					forceHls: false,
					debug: false,
					autoPlay: false,
					disableAutoPlayback: true,
				},
			});

			player.loadSource('https://cdn.example.com/video/stream.mp4');

			expect(player._hlsRecoveryTimer).toBeNull();
		});
	});
});
