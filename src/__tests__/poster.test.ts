/**
 * Verifies the playlist item's `image` field reaches the `<video>` element's
 * `poster` attribute on `current` events — covering both orderings:
 *   - cursor moves AFTER backend allocation (real element already exists)
 *   - cursor moves BEFORE backend allocation (real element materialises later)
 */

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

		const videoEl = document.querySelector('#poster-test video') as HTMLVideoElement | null;
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
		const videoEl = document.querySelector('#poster-test video') as HTMLVideoElement | null;
		expect(videoEl).not.toBeNull();
		expect(videoEl!.getAttribute('poster')).toBe('https://cdn/a.jpg');
	});

	it('clears poster when advancing to an item without an image', () => {
		const p = new NMVideoPlayer<ItemShape>('poster-test').setup({ playlist: items });
		p.backend();
		p.queue(items);

		p.current('a');
		const videoEl = document.querySelector('#poster-test video') as HTMLVideoElement;
		expect(videoEl.getAttribute('poster')).toBe('https://cdn/a.jpg');

		p.current('c');
		expect(videoEl.hasAttribute('poster')).toBe(false);
	});

	it('updates poster when cursor moves between items', () => {
		const p = new NMVideoPlayer<ItemShape>('poster-test').setup({ playlist: items });
		p.backend();
		p.queue(items);

		p.current('a');
		const videoEl = document.querySelector('#poster-test video') as HTMLVideoElement;
		expect(videoEl.getAttribute('poster')).toBe('https://cdn/a.jpg');

		p.current('b');
		expect(videoEl.getAttribute('poster')).toBe('https://cdn/b.jpg');
	});
});
