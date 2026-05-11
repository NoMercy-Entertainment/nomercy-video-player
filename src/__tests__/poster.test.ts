import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NMVideoPlayer } from '../index';

interface ItemShape {
	id: string;
	url: string;
	image?: string;
}

const items: ItemShape[] = [
	{ id: 'a', url: '/a.m3u8', image: 'https://cdn/a.jpg' },
	{ id: 'b', url: '/b.m3u8', image: 'https://cdn/b.jpg' },
	{ id: 'c', url: '/c.m3u8' },
];

describe('NMVideoPlayer poster sync', () => {
	beforeEach(() => {
		document.body.innerHTML = '<div id="poster-test"></div>';
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	afterEach(() => {
		document.body.innerHTML = '';
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	it('sets video.poster when current() advances after backend exists', () => {
		const p = new NMVideoPlayer<ItemShape>('poster-test').setup({ playlist: items });

		// Force backend allocation.
		p.backend();

		const videoEl = document.querySelector<HTMLVideoElement>('#poster-test video');
		expect(videoEl).not.toBeNull();

		p.queue(items);
		p.current('a');

		expect(videoEl!.getAttribute('poster')).toBe('https://cdn/a.jpg');
	});

	it('applies wanted poster when backend allocates AFTER cursor moved', () => {
		const p = new NMVideoPlayer<ItemShape>('poster-test').setup({ playlist: items });

		// Cursor first — no backend yet.
		p.queue(items);
		p.current('a');

		// `<video>` doesn't exist yet — there's no poster to read.
		expect(document.querySelector('#poster-test video')).toBeNull();

		// Allocating the backend should retroactively apply the poster.
		p.backend();
		const videoEl = document.querySelector<HTMLVideoElement>('#poster-test video');
		expect(videoEl).not.toBeNull();
		expect(videoEl!.getAttribute('poster')).toBe('https://cdn/a.jpg');
	});

	it('clears poster when advancing to an item without an image', () => {
		const p = new NMVideoPlayer<ItemShape>('poster-test').setup({ playlist: items });
		p.backend();
		p.queue(items);

		p.current('a');
		const videoEl = document.querySelector<HTMLVideoElement>('#poster-test video')!
		expect(videoEl.getAttribute('poster')).toBe('https://cdn/a.jpg');

		p.current('c');
		expect(videoEl.hasAttribute('poster')).toBe(false);
	});

	it('updates poster when cursor moves between items', () => {
		const p = new NMVideoPlayer<ItemShape>('poster-test').setup({ playlist: items });
		p.backend();
		p.queue(items);

		p.current('a');
		const videoEl = document.querySelector<HTMLVideoElement>('#poster-test video')!
		expect(videoEl.getAttribute('poster')).toBe('https://cdn/a.jpg');

		p.current('b');
		expect(videoEl.getAttribute('poster')).toBe('https://cdn/b.jpg');
	});

	it('applies poster when backend allocates after queue() pre-positioned cursor without current() call', () => {
		// Regression: queue() silently positions cursor at index 0 without emitting
		// 'current'. When load(items[0]) detects alreadyCurrent=true it skips
		// setCurrent, so 'current' never fires. backend() must fall back to reading
		// the current item directly instead of relying on _wantedPoster being set.
		const p = new NMVideoPlayer<ItemShape>('poster-test').setup({ playlist: items });

		p.queue(items);

		// Force backend allocation WITHOUT calling current() — mirrors the
		// VideoPlayer.vue build() path: queue() then load() (which calls backend()
		// internally). We call backend() directly here since load() is async and
		// requires a real HLS endpoint.
		p.backend();
		const videoEl = document.querySelector<HTMLVideoElement>('#poster-test video');
		expect(videoEl).not.toBeNull();

		// The cursor is at index 0 (sintel) because queue() pre-positions it.
		// backend() must have read the image from the current item.
		expect(videoEl!.getAttribute('poster')).toBe('https://cdn/a.jpg');
	});

	it('resolves relative image paths against imageBasePath', () => {
		const relItems: ItemShape[] = [
			{ id: 'r1', url: '/r1.m3u8', image: '/w780/abc.jpg' },
		];

		const p = new NMVideoPlayer<ItemShape>('poster-test').setup({
			imageBasePath: 'https://image.tmdb.org/t/p',
			playlist: relItems,
		});
		p.backend();
		p.queue(relItems);
		p.current('r1');

		const videoEl = document.querySelector<HTMLVideoElement>('#poster-test video')!
		expect(videoEl.getAttribute('poster')).toBe('https://image.tmdb.org/t/p/w780/abc.jpg');
	});

	it('passes absolute image URLs through unchanged when imageBasePath is set', () => {
		const absItems: ItemShape[] = [
			{ id: 'abs', url: '/abs.m3u8', image: 'https://other.cdn/img.jpg' },
		];

		const p = new NMVideoPlayer<ItemShape>('poster-test').setup({
			imageBasePath: 'https://image.tmdb.org/t/p',
			playlist: absItems,
		});
		p.backend();
		p.queue(absItems);
		p.current('abs');

		const videoEl = document.querySelector<HTMLVideoElement>('#poster-test video')!
		expect(videoEl.getAttribute('poster')).toBe('https://other.cdn/img.jpg');
	});
});
