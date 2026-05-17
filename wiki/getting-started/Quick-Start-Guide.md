## Installation

```bash
npm install @nomercy-entertainment/nomercy-video-player
```

## Basic Setup

### 1. Create a Container

Add a `<div>` to your HTML. Never use a `<video>` tag — the player creates its own video element.

```html
<div id="nomercy-player" style="width: 100%; max-width: 960px; aspect-ratio: 16/9; background: #000"></div>
```

> **Important:** Each player instance requires a **unique** container ID. If you have multiple players on the same page, give each one a different `id` (e.g., `nomercy-player-1`, `nomercy-player-2`).

### 2. Initialize the Player

```typescript
import nmplayer from '@nomercy-entertainment/nomercy-video-player';
import type { VideoPlayerConfig, VideoPlaylistItem } from '@nomercy-entertainment/nomercy-video-player';

const items: VideoPlaylistItem[] = [
	{
		id: 'sintel',
		title: 'Sintel',
		url: '/Sintel.(2010)/Sintel.(2010).NoMercy.m3u8',
		image: '/w780/q2bVM5z90tCGbmXYtq2J38T5hSX.jpg',
		duration: 888,
		tracks: [
			{ id: 0, label: 'English', file: '/Sintel.(2010)/subtitles/Sintel.(2010).NoMercy.eng.full.vtt', language: 'eng', kind: 'subtitles' },
			{ id: 1, file: '/Sintel.(2010)/chapters.vtt', kind: 'chapters' },
		],
	},
];

const config: VideoPlayerConfig = {
	basePath: 'https://raw.githubusercontent.com/NoMercy-Entertainment/media/master/Films/Films',
	imageBasePath: 'https://image.tmdb.org/t/p',
	playlist: items,
};

const player = nmplayer('nomercy-player').setup(config);
```

The player is now running — but you won't see any controls. That's by design. This is a headless player; you build the UI yourself.

### 3. Listen to Events and Start Playback

```typescript
player.on('ready', () => {
	// Queue is seeded from the inline playlist. Move the cursor to item 0 and play.
	player.current(0, { autoplay: true });
});

player.on('play', () => console.log('Playing'));
player.on('pause', () => console.log('Paused'));
player.on('time', (data) => {
	console.log(`${data.time.toFixed(1)}s`);
});
```

### 4. Add Plugins

Plugins are imported from the `/plugins` subpath — they are **not** in the main entry.

```typescript
import { KeyHandlerPlugin, OctopusPlugin } from '@nomercy-entertainment/nomercy-video-player/plugins';

// VLC-style keyboard shortcuts (Space, arrows, F, M, etc.)
player.addPlugin(KeyHandlerPlugin);

// ASS/SSA subtitle rendering (heavy — only load when needed)
player.addPlugin(OctopusPlugin);
```

> **Note:** `addPlugin` can be called before or after `setup()`. Before setup, plugins are queued and initialized during the setup pipeline. After setup, initialization runs immediately — listen for `plugin:installed` if you need to act on it.

## Working Example with Playlist

```typescript
import nmplayer from '@nomercy-entertainment/nomercy-video-player';
import { KeyHandlerPlugin } from '@nomercy-entertainment/nomercy-video-player/plugins';
import type { VideoPlayerConfig, VideoPlaylistItem } from '@nomercy-entertainment/nomercy-video-player';

const items: VideoPlaylistItem[] = [
	{
		id: 'sintel',
		title: 'Sintel',
		url: '/Sintel.(2010)/Sintel.(2010).NoMercy.m3u8',
		image: '/w780/q2bVM5z90tCGbmXYtq2J38T5hSX.jpg',
		duration: 888,
		tracks: [
			{ id: 0, label: 'Dutch', file: '/Sintel.(2010)/subtitles/Sintel.(2010).NoMercy.dut.full.vtt', language: 'dut', kind: 'subtitles' },
			{ id: 1, label: 'English', file: '/Sintel.(2010)/subtitles/Sintel.(2010).NoMercy.eng.full.vtt', language: 'eng', kind: 'subtitles' },
			{ id: 2, file: '/Sintel.(2010)/chapters.vtt', kind: 'chapters' },
			{ id: 3, file: '/Sintel.(2010)/thumbs_256x109.vtt', kind: 'thumbnails' },
		],
	},
	{
		id: 'cosmos-laundromat',
		title: 'Cosmos Laundromat',
		url: '/Cosmos.Laundromat.(2015)/Cosmos.Laundromat.(2015).NoMercy.m3u8',
		image: '/w780/f2wABsgj2lIR2dkDEfBZX8p4Iyk.jpg',
		duration: 724,
		tracks: [
			{ id: 0, label: 'English', file: '/Cosmos.Laundromat.(2015)/subtitles/Cosmos.Laundromat.(2015).NoMercy.eng.full.vtt', language: 'eng', kind: 'subtitles' },
			{ id: 1, file: '/Cosmos.Laundromat.(2015)/chapters.vtt', kind: 'chapters' },
		],
	},
	{
		id: 'big-buck-bunny',
		title: 'Big Buck Bunny',
		url: '/Big.Buck.Bunny.(2008)/Big.Buck.Bunny.(2008).NoMercy.m3u8',
		image: '/original/xtdybjRRZ15mCrPOvEld305myys.jpg',
		duration: 596,
		tracks: [
			{ id: 0, file: '/Big.Buck.Bunny.(2008)/chapters.vtt', kind: 'chapters' },
		],
	},
];

const config: VideoPlayerConfig = {
	basePath: 'https://raw.githubusercontent.com/NoMercy-Entertainment/media/master/Films/Films',
	imageBasePath: 'https://image.tmdb.org/t/p',
	muted: false,
	preload: 'auto',
	playbackRates: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
	playlist: items,
};

const player = nmplayer('nomercy-player')
	.addPlugin(KeyHandlerPlugin)
	.setup(config);

player.on('ready', () => {
	player.current(0, { autoplay: true });
});

player.on('item', (item) => {
	document.title = item.title ?? '';
});

player.on('levelsChanged', (quality) => {
	console.log('Quality changed to:', quality.name);
});

player.on('subtitleChanged', (track) => {
	console.log('Subtitle changed to:', track?.label);
});
```

## ASS Subtitle Example

For anime or content with styled subtitles, the OctopusPlugin renders `.ass` files with font support:

```typescript
import nmplayer from '@nomercy-entertainment/nomercy-video-player';
import { OctopusPlugin } from '@nomercy-entertainment/nomercy-video-player/plugins';
import type { VideoPlayerConfig, VideoPlaylistItem } from '@nomercy-entertainment/nomercy-video-player';

const items: VideoPlaylistItem[] = [
	{
		id: 'rail-wars',
		title: 'Rail Wars',
		url: '/Rail.Wars!.(2014)/Rail.Wars!.S00E00/Rail.Wars!.(2014).S00E00.NoMercy.m3u8',
		image: '/original/vH8NqN2LMcmtBv037iHGwcPOgCZ.jpg',
		duration: 90,
		tracks: [
			{ id: 0, label: 'English', file: '/Rail.Wars!.(2014)/Rail.Wars!.S00E00/subtitles/Rail.Wars!.(2014).S00E00.NoMercy.eng.full.ass', language: 'eng', kind: 'subtitles' },
			{ id: 1, file: '/Rail.Wars!.(2014)/Rail.Wars!.S00E00/fonts.json', kind: 'fonts' },
		],
	},
];

const config: VideoPlayerConfig = {
	basePath: 'https://raw.githubusercontent.com/NoMercy-Entertainment/media/refs/heads/master/Anime/Anime',
	imageBasePath: 'https://image.tmdb.org/t/p',
	playlist: items,
};

const player = nmplayer('nomercy-player')
	.addPlugin(OctopusPlugin)
	.setup(config);

player.on('ready', () => {
	player.current(0, { autoplay: true });
});
```

The `fonts` track points to a JSON file listing the font files needed by the ASS subtitle. The OctopusPlugin fetches and loads them automatically when a caption with an `.ass` or `.ssa` extension is selected.

## Vanilla HTML

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>NoMercy Video Player</title>
	</head>
	<body>
		<div id="nomercy-player" style="width: 100%; max-width: 960px; aspect-ratio: 16/9; background: #000"></div>

		<script src="https://cdn.jsdelivr.net/npm/@nomercy-entertainment/nomercy-video-player@latest/dist/nomercy-video-player.iife.js"></script>
		<script>
			var config = {
				basePath: 'https://raw.githubusercontent.com/NoMercy-Entertainment/media/master/Films/Films',
				imageBasePath: 'https://image.tmdb.org/t/p',
				playlist: [
					{
						id: 'sintel',
						title: 'Sintel',
						url: '/Sintel.(2010)/Sintel.(2010).NoMercy.m3u8',
						image: '/w780/q2bVM5z90tCGbmXYtq2J38T5hSX.jpg',
						duration: 888,
					},
				],
			};

			var player = nmplayer('nomercy-player').setup(config);

			player.on('ready', function () {
				player.current(0, { autoplay: true });
			});
		</script>
	</body>
</html>
```

## Understanding the Player State

The player communicates through:

1. **CSS classes** on the container div — `playing`, `paused`, `buffering`, `active`, `inactive`, `error`
2. **Events** — `play`, `pause`, `time`, `levels`, `subtitleList`, etc.
3. **Methods** — `play()`, `pause()`, `seek()`, `volume()`, etc.

See [Plugin Development](Plugin-Development) for building plugins that use these.

## Cleanup

Always dispose the player when done:

```typescript
player.dispose();
```

## Item Shape Reference

```typescript
interface VideoPlaylistItem {
	id: string | number;       // required — unique within the queue
	url?: string;              // media URL (absolute, or relative to basePath)
	title?: string;
	image?: string;            // also accepted: poster, thumbnail
	duration?: number;         // seconds (numeric)
	show?: string;             // series title
	season?: number;           // 1-based
	episode?: number;          // 1-based
	tracks?: Array<{
		id?: number | string;
		kind?: string;         // 'subtitles' | 'chapters' | 'thumbnails' | 'fonts'
		file?: string;
		label?: string;
		language?: string;     // ISO 639-2 (e.g. 'eng', 'dut')
	}>;
}
```

## Next Steps

- [Configuration](Configuration) — All PlayerConfig options
- [Plugin Development](Plugin-Development) — extending the player
- [Events](Events) — Full event reference
- [Methods](API-Reference-Methods) — All player methods
- [Framework Integration](Framework-Integration) — React, Vue, Angular, Svelte patterns
- [Live Examples](https://github.com/NoMercy-Entertainment/nomercy-examples) — Working example project
