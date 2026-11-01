// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Generates the deterministic media fixtures the e2e suite drives through a real
 * browser. Produced by the NoMercy FFmpeg fork (resolved by ensure-ffmpeg.mjs),
 * never a system ffmpeg, so the fixtures match the encoder the product ships.
 *
 * Outputs into e2e/media/:
 *   sample.mp4   3s 320x180 H264 + AAC tone
 *   stream.m3u8  HLS playlist + seg_000.ts (from sample.mp4)
 *   sample.vtt   two WebVTT cues
 *   sample.ass   two ASS cues (drives the libass/octopus path)
 *
 * Run: `node scripts/generate-e2e-fixtures.mjs` (also exposed as `pretest:e2e`).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureFfmpeg } from './ensure-ffmpeg.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const mediaDir = join(here, '..', 'e2e', 'media');

function run(ffmpeg, args) {
	const result = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8', cwd: mediaDir });
	if (result.status !== 0)
		throw new Error(`ffmpeg failed: ${args.join(' ')}\n${result.stderr}`);
}

const SAMPLE_VTT = `WEBVTT

00:00:00.000 --> 00:00:01.500
First cue line

00:00:01.500 --> 00:00:03.000
Second cue line
`;

const SAMPLE_ASS = `[Script Info]
ScriptType: v4.00+
PlayResX: 320
PlayResY: 180

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:01.50,Default,,0,0,0,,First ASS cue
Dialogue: 0,0:00:01.50,0:00:03.00,Default,,0,0,0,,Second ASS cue
`;

const EPISODE_SECONDS = 24;
const EPISODE_RENDITIONS = [
	{ dir: 'v0', size: '320x180', bandwidth: 400000 },
	{ dir: 'v1', size: '640x360', bandwidth: 1200000 },
];

/** Two multi-rendition HLS episodes (ep1, ep2) with a VTT each, for the next-item warmup spec. */
function generateEpisodePair(ffmpeg) {
	for (const episode of ['ep1', 'ep2']) {
		const episodeDir = join(mediaDir, episode);
		let master = '#EXTM3U\n';

		for (const rendition of EPISODE_RENDITIONS) {
			mkdirSync(join(episodeDir, rendition.dir), { recursive: true });
			run(ffmpeg, [
				'-f',
				'lavfi',
				'-i',
				`testsrc=duration=${EPISODE_SECONDS}:size=${rendition.size}:rate=15`,
				'-f',
				'lavfi',
				'-i',
				`sine=frequency=${episode === 'ep1' ? 440 : 660}:duration=${EPISODE_SECONDS}`,
				'-c:v',
				'libx264',
				'-pix_fmt',
				'yuv420p',
				'-g',
				'60',
				'-keyint_min',
				'60',
				'-sc_threshold',
				'0',
				'-c:a',
				'aac',
				'-shortest',
				'-f',
				'hls',
				'-hls_time',
				'4',
				'-hls_list_size',
				'0',
				'-hls_segment_filename',
				`${episode}/${rendition.dir}/seg_%03d.ts`,
				`${episode}/${rendition.dir}/index.m3u8`,
			]);
			master += `#EXT-X-STREAM-INF:BANDWIDTH=${rendition.bandwidth},RESOLUTION=${rendition.size}\n${rendition.dir}/index.m3u8\n`;
		}

		writeFileSync(join(episodeDir, 'master.m3u8'), master);

		let vtt = 'WEBVTT\n\n';
		for (let second = 0; second < EPISODE_SECONDS; second += 2) {
			const format = value => `00:00:${String(value).padStart(2, '0')}.000`;
			vtt += `${format(second)} --> ${format(second + 2)}\n${episode} caption at ${second}s\n\n`;
		}
		writeFileSync(join(episodeDir, 'captions.vtt'), vtt);
	}
}

async function main() {
	const ffmpeg = await ensureFfmpeg();
	mkdirSync(mediaDir, { recursive: true });

	run(ffmpeg, [
		'-f',
		'lavfi',
		'-i',
		'testsrc=duration=3:size=320x180:rate=15',
		'-f',
		'lavfi',
		'-i',
		'sine=frequency=440:duration=3',
		'-c:v',
		'libx264',
		'-pix_fmt',
		'yuv420p',
		'-c:a',
		'aac',
		'-shortest',
		'sample.mp4',
	]);

	run(ffmpeg, [
		'-i',
		'sample.mp4',
		'-c:v',
		'libx264',
		'-c:a',
		'aac',
		'-f',
		'hls',
		'-hls_time',
		'1',
		'-hls_list_size',
		'0',
		'-hls_segment_filename',
		'seg_%03d.ts',
		'stream.m3u8',
	]);

	writeFileSync(join(mediaDir, 'sample.vtt'), SAMPLE_VTT);
	writeFileSync(join(mediaDir, 'sample.ass'), SAMPLE_ASS);

	generateEpisodePair(ffmpeg);

	console.log(`e2e fixtures generated in ${mediaDir} using ${ffmpeg}`);
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
