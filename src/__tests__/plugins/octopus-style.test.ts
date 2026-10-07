// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * OctopusPlugin subtitle-style tests — the viewer's caption size reaches libass.
 *
 * What's locked here:
 *  - The size picked in the settings menu (`subtitleStyle().fontSize`, a percent
 *    where 100 is the track's own) scales every ASS style's `Fontsize`
 *  - A size picked before the track loads is applied on the first render
 *  - A size picked while a track is shown (paused or not) hands the renderer
 *    the rescaled track, which makes it redraw the held cue
 *  - The scale comes from the style alone, so desktop and mobile layouts apply
 *    the same value (no double scaling on a narrow viewport)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NMVideoPlayer } from '../../index';
import { OctopusPlugin, octopusPlugin } from '../../plugins/octopus';
import { scaleAssFontSize } from '../../plugins/octopus/style-scale';

const instances: any[] = [];

vi.mock('@nomercy-entertainment/nomercy-subtitle-octopus', () => {
	function MockOctopus(this: any, options: any) {
		this.options = options;
		this.trackContentCalls = [];
		this.on = () => {};
		this.trackContent = (content: string) => {
			this.trackContentCalls.push(content);
		};
		this.upstreamInstance = () => null;
		this.dispose = () => {};
		instances.push(this);
	}
	return { NMSubtitleOctopus: MockOctopus };
});

const ASS = [
	'[Script Info]',
	'PlayResY: 1080',
	'',
	'[V4+ Styles]',
	'Format: Name, Fontname, Fontsize, PrimaryColour, Bold',
	'Style: Default,Arial,48,&H00FFFFFF,0',
	'Style: Sign,Arial,20.5,&H00FFFFFF,-1',
	'',
	'[Events]',
	'Format: Layer, Start, End, Style, Text',
	'Dialogue: 0,0:00:01.00,0:00:05.00,Default,{\\fs60}Hello, world',
	'',
].join('\n');

let fetchSpy: ReturnType<typeof vi.spyOn>;

function mockTrackFetches(): void {
	(fetchSpy as any).mockResolvedValueOnce(new Response(ASS, { status: 200, headers: { 'Content-Type': 'text/plain' } }));
	(fetchSpy as any).mockResolvedValueOnce(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
}

async function setupPlayer(): Promise<NMVideoPlayer<any>> {
	const player = new NMVideoPlayer('test').setup({});
	(player as any).videoElement = document.createElement('video');
	player.addPlugin(octopusPlugin);
	await player.ready();
	return player;
}

describe('OctopusPlugin subtitle style', () => {
	beforeEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		instances.length = 0;
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
		fetchSpy = vi.spyOn(globalThis, 'fetch');
		vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:mock');
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
	});

	afterEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	describe('scaleAssFontSize', () => {
		it('scales Fontsize in every style, leaving dialogue text alone', () => {
			const scaled = scaleAssFontSize(ASS, 1.5);
			expect(scaled).toContain('Style: Default,Arial,72,&H00FFFFFF,0');
			expect(scaled).toContain('Style: Sign,Arial,30.75,&H00FFFFFF,-1');
			expect(scaled).toContain('{\\fs60}Hello, world');
		});

		it('finds Fontsize by the Format line, not by position', () => {
			const reordered = '[V4 Styles]\nFormat: Fontsize, Name\nStyle: 40,Default\n';
			expect(scaleAssFontSize(reordered, 0.5)).toBe('[V4 Styles]\nFormat: Fontsize, Name\nStyle: 20,Default\n');
		});

		it('returns the content unchanged at scale 1', () => {
			expect(scaleAssFontSize(ASS, 1)).toBe(ASS);
		});

		it('returns the same result whatever the viewport width is (desktop and mobile)', () => {
			const results: string[] = [];
			for (const width of [1920, 390]) {
				Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
				results.push(scaleAssFontSize(ASS, 1.5));
			}
			expect(results[1]).toBe(results[0]);
		});
	});

	describe('live style', () => {
		it('applies a size picked before the track loads on the first render', async () => {
			mockTrackFetches();
			const player = await setupPlayer();
			player.subtitleStyle({ fontSize: 150 });
			await player.getPlugin(OctopusPlugin)!.subtitle('https://cdn.example.com/sub.ass');

			expect(instances[0].options.trackContent).toContain('Style: Default,Arial,72,');
		});

		it('hands the renderer the rescaled track when the size changes while a track is shown', async () => {
			mockTrackFetches();
			const player = await setupPlayer();
			await player.getPlugin(OctopusPlugin)!.subtitle('https://cdn.example.com/sub.ass');
			expect(instances).toHaveLength(1);

			player.subtitleStyle({ fontSize: 150 });

			expect(instances[0].trackContentCalls).toHaveLength(1);
			expect(instances[0].trackContentCalls[0]).toContain('Style: Default,Arial,72,');
		});

		it('restores the track\'s own size at 100 percent', async () => {
			mockTrackFetches();
			const player = await setupPlayer();
			await player.getPlugin(OctopusPlugin)!.subtitle('https://cdn.example.com/sub.ass');
			player.subtitleStyle({ fontSize: 150 });
			player.subtitleStyle({ fontSize: 100 });

			expect(instances[0].trackContentCalls.at(-1)).toBe(ASS);
		});

		it('ignores a style change that leaves the size as it was', async () => {
			mockTrackFetches();
			const player = await setupPlayer();
			await player.getPlugin(OctopusPlugin)!.subtitle('https://cdn.example.com/sub.ass');
			player.subtitleStyle({ textColor: '#ff0000' });

			expect(instances[0].trackContentCalls).toHaveLength(0);
		});

		it('does nothing when no track is shown', async () => {
			const player = await setupPlayer();
			player.subtitleStyle({ fontSize: 150 });

			expect(instances).toHaveLength(0);
		});
	});
});
