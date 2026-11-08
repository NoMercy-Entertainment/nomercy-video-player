// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Locks the package.json exports map — every subpath a consumer can import
 * must exist and expose its documented named exports. Mirrors the core kit's
 * `subpath-exports.test.ts`: each dist subpath is exercised via its source
 * module (dist mirrors src 1:1 through tsc), so a renamed/deleted export or a
 * dropped exports-map key fails here before it ships.
 */

import type { TvKeyHandlerOptions } from '../plugins/tv-key-handler/index';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import RootDefault, {
	containedRect,
	FullscreenState,
	Html5VideoBackend,
	nmplayer,
	NMVideoPlayer,
	NotImplementedError,
	PipState,
	PlayState,
	KeyHandlerPlugin as RootKeyHandlerPlugin,
	OctopusPlugin as RootOctopusPlugin,
	StorageBackedSubtitleStyleStore,
	SubtitleState,
	TheaterState,
	V1VideoCompatPlugin,
	VideoPreloadStrategy,
	VolumeState,
	VttChapterSource,
	VttSpriteThumbnailSource,
} from '../index';
import * as castSenderModule from '../plugins/cast-sender/index';
import * as desktopUiModule from '../plugins/desktop-ui/index';
import * as drmModule from '../plugins/drm/index';
import * as pluginsBarrel from '../plugins/index';
import * as keyHandlerModule from '../plugins/key-handler/index';
import * as liveTranscodingModule from '../plugins/live-transcoding/index';
import * as mediaSessionModule from '../plugins/media-session/index';
import * as octopusModule from '../plugins/octopus/index';
import * as subtitleOverlayModule from '../plugins/subtitle-overlay/index';
import * as touchZonesModule from '../plugins/touch-zones/index';
import * as tvKeyHandlerModule from '../plugins/tv-key-handler/index';
import * as hlsStreamModule from '../streams/hls';
import * as nativeStreamModule from '../streams/native';

const EXPECTED_EXPORT_KEYS = [
	'.',
	'./plugins',
	'./adapters',
	'./plugins/cast-sender',
	'./plugins/desktop-ui',
	'./plugins/drm',
	'./plugins/key-handler',
	'./plugins/live-transcoding',
	'./plugins/media-session',
	'./plugins/octopus',
	'./plugins/subtitle-overlay',
	'./plugins/touch-zones',
	'./plugins/twitch',
	'./plugins/tv-key-handler',
	'./streams/native',
	'./streams/hls',
	'./package.json',
];

describe('subpath-exports', () => {
	describe('package.json exports map', () => {
		const packageJson = JSON.parse(
			readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
		) as { exports: Record<string, unknown> };

		it('contains exactly the 17 documented export keys', () => {
			expect(Object.keys(packageJson.exports)).toEqual(EXPECTED_EXPORT_KEYS);
		});

		it('every non-package.json subpath declares types + import conditions', () => {
			for (const [key, value] of Object.entries(packageJson.exports)) {
				if (key === './package.json')
					continue;
				expect(value, key).toMatchObject({
					types: expect.stringMatching(/^\.\/dist\/.+\.d\.ts$/),
					import: expect.stringMatching(/^\.\/dist\/.+\.js$/),
				});
			}
		});

		it('./package.json is exported as the raw file', () => {
			expect(packageJson.exports['./package.json']).toBe('./package.json');
		});
	});

	describe('. (root)', () => {
		it('default export is the nmplayer factory', () => {
			expect(typeof RootDefault).toBe('function');
			expect(RootDefault).toBe(nmplayer);
		});

		it('NMVideoPlayer class and factory are exported', () => {
			expect(typeof NMVideoPlayer).toBe('function');
			expect(typeof nmplayer).toBe('function');
		});

		it('adapters are exported: Html5VideoBackend, VttChapterSource, VttSpriteThumbnailSource, StorageBackedSubtitleStyleStore', () => {
			expect(typeof Html5VideoBackend).toBe('function');
			expect(typeof VttChapterSource).toBe('function');
			expect(typeof VttSpriteThumbnailSource).toBe('function');
			expect(typeof StorageBackedSubtitleStyleStore).toBe('function');
		});

		it('VideoPreloadStrategy and the ergonomic plugin re-exports are on the root barrel', () => {
			expect(typeof VideoPreloadStrategy).toBe('function');
			expect(typeof RootKeyHandlerPlugin).toBe('function');
			expect(typeof RootOctopusPlugin).toBe('function');
			expect(typeof V1VideoCompatPlugin).toBe('function');
		});

		it('state enums and helpers are exported', () => {
			expect(FullscreenState.ON).toBe('on');
			expect(PipState.OFF).toBe('off');
			expect(TheaterState.ON).toBe('on');
			expect(SubtitleState.OFF).toBe('off');
			expect(typeof PlayState).toBe('object');
			expect(typeof VolumeState).toBe('object');
			expect(typeof containedRect).toBe('function');
			expect(typeof NotImplementedError).toBe('function');
		});
	});

	describe('./plugins (barrel)', () => {
		it('exports every video plugin class with its lowercase convenience alias', () => {
			expect(typeof pluginsBarrel.CastSenderPlugin).toBe('function');
			expect(pluginsBarrel.castSenderPlugin).toBe(pluginsBarrel.CastSenderPlugin);
			expect(typeof pluginsBarrel.DesktopUiPlugin).toBe('function');
			expect(pluginsBarrel.desktopUiPlugin).toBe(pluginsBarrel.DesktopUiPlugin);
			expect(typeof pluginsBarrel.DrmPlugin).toBe('function');
			expect(pluginsBarrel.drmPlugin).toBe(pluginsBarrel.DrmPlugin);
			expect(typeof pluginsBarrel.KeyHandlerPlugin).toBe('function');
			expect(pluginsBarrel.keyHandlerPlugin).toBe(pluginsBarrel.KeyHandlerPlugin);
			expect(typeof pluginsBarrel.LiveTranscodingPlugin).toBe('function');
			expect(pluginsBarrel.liveTranscodingPlugin).toBe(pluginsBarrel.LiveTranscodingPlugin);
			expect(typeof pluginsBarrel.MediaSessionPlugin).toBe('function');
			expect(pluginsBarrel.mediaSessionPlugin).toBe(pluginsBarrel.MediaSessionPlugin);
			expect(typeof pluginsBarrel.OctopusPlugin).toBe('function');
			expect(pluginsBarrel.octopusPlugin).toBe(pluginsBarrel.OctopusPlugin);
			expect(typeof pluginsBarrel.SubtitleOverlayPlugin).toBe('function');
			expect(pluginsBarrel.subtitleOverlayPlugin).toBe(pluginsBarrel.SubtitleOverlayPlugin);
			expect(typeof pluginsBarrel.TouchZonesPlugin).toBe('function');
			expect(pluginsBarrel.touchZonesPlugin).toBe(pluginsBarrel.TouchZonesPlugin);
		});

		it('exports TvKeyHandlerPlugin (also available via its dedicated subpath)', () => {
			expect(typeof pluginsBarrel.TvKeyHandlerPlugin).toBe('function');
			expect(pluginsBarrel.tvKeyHandlerPlugin).toBe(pluginsBarrel.TvKeyHandlerPlugin);
			expect((pluginsBarrel.TvKeyHandlerPlugin as unknown as { id: string }).id).toBe('tv-key-handler');
		});

		it('re-exports the cross-library kit plugins', () => {
			expect(typeof pluginsBarrel.AudioGraphPlugin).toBe('function');
			expect(typeof pluginsBarrel.CanvasPlugin).toBe('function');
			expect(typeof pluginsBarrel.EqualizerPlugin).toBe('function');
			expect(typeof pluginsBarrel.MixerPlugin).toBe('function');
			expect(typeof pluginsBarrel.SpectrumPlugin).toBe('function');
			expect(typeof pluginsBarrel.VisualizationPlugin).toBe('function');
			expect(typeof pluginsBarrel.EmbedPlugin).toBe('function');
			expect(typeof pluginsBarrel.MessagePlugin).toBe('function');
			expect(typeof pluginsBarrel.TabLeaderPlugin).toBe('function');
		});
	});

	describe('./plugins/* (dedicated subpaths)', () => {
		it('./plugins/cast-sender → CastSenderPlugin', () => {
			expect(typeof castSenderModule.CastSenderPlugin).toBe('function');
			expect(castSenderModule.castSenderPlugin).toBe(castSenderModule.CastSenderPlugin);
		});

		it('./plugins/desktop-ui → DesktopUiPlugin', () => {
			expect(typeof desktopUiModule.DesktopUiPlugin).toBe('function');
			expect(desktopUiModule.desktopUiPlugin).toBe(desktopUiModule.DesktopUiPlugin);
		});

		it('./plugins/drm → DrmPlugin', () => {
			expect(typeof drmModule.DrmPlugin).toBe('function');
			expect(drmModule.drmPlugin).toBe(drmModule.DrmPlugin);
		});

		it('./plugins/key-handler → KeyHandlerPlugin', () => {
			expect(typeof keyHandlerModule.KeyHandlerPlugin).toBe('function');
			expect(keyHandlerModule.keyHandlerPlugin).toBe(keyHandlerModule.KeyHandlerPlugin);
		});

		it('./plugins/live-transcoding → LiveTranscodingPlugin', () => {
			expect(typeof liveTranscodingModule.LiveTranscodingPlugin).toBe('function');
			expect(liveTranscodingModule.liveTranscodingPlugin).toBe(liveTranscodingModule.LiveTranscodingPlugin);
		});

		it('./plugins/media-session → MediaSessionPlugin', () => {
			expect(typeof mediaSessionModule.MediaSessionPlugin).toBe('function');
			expect(mediaSessionModule.mediaSessionPlugin).toBe(mediaSessionModule.MediaSessionPlugin);
		});

		it('./plugins/octopus → OctopusPlugin', () => {
			expect(typeof octopusModule.OctopusPlugin).toBe('function');
			expect(octopusModule.octopusPlugin).toBe(octopusModule.OctopusPlugin);
		});

		it('./plugins/subtitle-overlay → SubtitleOverlayPlugin', () => {
			expect(typeof subtitleOverlayModule.SubtitleOverlayPlugin).toBe('function');
			expect(subtitleOverlayModule.subtitleOverlayPlugin).toBe(subtitleOverlayModule.SubtitleOverlayPlugin);
		});

		it('./plugins/touch-zones → TouchZonesPlugin', () => {
			expect(typeof touchZonesModule.TouchZonesPlugin).toBe('function');
			expect(touchZonesModule.touchZonesPlugin).toBe(touchZonesModule.TouchZonesPlugin);
		});

		it('./plugins/twitch → TwitchPlugin', async () => {
			const twitchModule = await import('../plugins/twitch/index');

			expect(typeof twitchModule.TwitchPlugin).toBe('function');
			expect(pluginsBarrel.TwitchPlugin).toBe(twitchModule.TwitchPlugin);
		});

		it('./plugins/tv-key-handler → TvKeyHandlerPlugin', () => {
			expect(typeof tvKeyHandlerModule.TvKeyHandlerPlugin).toBe('function');
			expect(tvKeyHandlerModule.tvKeyHandlerPlugin).toBe(tvKeyHandlerModule.TvKeyHandlerPlugin);
			expect((tvKeyHandlerModule.TvKeyHandlerPlugin as unknown as { id: string }).id).toBe('tv-key-handler');
			// TvKeyHandlerOptions is a type-only export — constructing a value against
			// it here pins its presence on the subpath at typecheck time.
			const options: TvKeyHandlerOptions = { arrowSeekSeconds: 5, infoDisplayMs: 5000 };
			expect(options.arrowSeekSeconds).toBe(5);
		});
	});

	describe('./streams/*', () => {
		it('./streams/hls → hlsFactory (default + named)', () => {
			expect(hlsStreamModule.hlsFactory).toBeTruthy();
			expect(hlsStreamModule.default).toBe(hlsStreamModule.hlsFactory);
			expect(hlsStreamModule.hlsFactory.id).toBe('hls');
			expect(typeof hlsStreamModule.hlsFactory.canPlay).toBe('function');
		});

		it('./streams/native → nativeFactory (default + named)', () => {
			expect(nativeStreamModule.nativeFactory).toBeTruthy();
			expect(nativeStreamModule.default).toBe(nativeStreamModule.nativeFactory);
			expect(nativeStreamModule.nativeFactory.id).toBe('native');
			expect(typeof nativeStreamModule.nativeFactory.canPlay).toBe('function');
		});
	});
});
