# NoMercy Video Player

A headless, plugin-based HTML5 video player engine built with TypeScript. No UI included — you build your own.

[![NPM Version](https://img.shields.io/npm/v/@nomercy-entertainment/nomercy-video-player?style=flat&logo=npm&logoColor=white&color=cb3837)](https://www.npmjs.com/package/@nomercy-entertainment/nomercy-video-player)
[![NPM Downloads](https://img.shields.io/npm/dm/@nomercy-entertainment/nomercy-video-player?style=flat&logo=npm&logoColor=white&color=cb3837)](https://www.npmjs.com/package/@nomercy-entertainment/nomercy-video-player)
[![Build Status](https://img.shields.io/github/actions/workflow/status/NoMercy-Entertainment/nomercy-video-player/release.yml?style=flat&logo=github&logoColor=white)](https://github.com/NoMercy-Entertainment/nomercy-video-player/actions)
[![Tests](https://img.shields.io/github/actions/workflow/status/NoMercy-Entertainment/nomercy-video-player/test-reports.yml?style=flat&logo=vitest&logoColor=white&label=tests)](https://nomercy-entertainment.github.io/nomercy-video-player/)
[![License](https://img.shields.io/github/license/NoMercy-Entertainment/nomercy-video-player?style=flat&color=green)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178c6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

## Why?

Most video players force their UI on you. This one doesn't. NoMercy Video Player handles video playback, HLS streaming, subtitle rendering, playlists, and state management — then gets out of the way. You control every pixel of the interface through the plugin system.

## Install

```bash
npm install @nomercy-entertainment/nomercy-video-player
```

## Quick Example

```typescript
import nmplayer, { KeyHandlerPlugin } from '@nomercy-entertainment/nomercy-video-player';
import type { PlayerConfig } from '@nomercy-entertainment/nomercy-video-player';

const config: PlayerConfig = {
	basePath:      'https://raw.githubusercontent.com/NoMercy-Entertainment/media/master/Films/Films',
	imageBasePath: 'https://image.tmdb.org/t/p',
	playlist: [
		{
			id:          'sintel',
			title:       'Sintel',
			description: 'A short fantasy film by the Blender Foundation',
			file:        '/Sintel.(2010)/Sintel.(2010).NoMercy.m3u8',
			image:       '/w780/q2bVM5z90tCGbmXYtq2J38T5hSX.jpg',
			duration:    '14:48',
			tracks: [
				{ id: 0, label: 'English', file: '/Sintel.(2010)/subtitles/Sintel.(2010).NoMercy.eng.full.vtt', language: 'eng', kind: 'subtitles' },
				{ id: 1, file: '/Sintel.(2010)/chapters.vtt', kind: 'chapters' },
			],
		},
	],
};

const player = nmplayer('player').setup(config);

// Add keyboard shortcuts (Space, arrows, F, M, etc.)
const keyHandler = new KeyHandlerPlugin();
player.registerPlugin('keyHandler', keyHandler);
player.usePlugin('keyHandler');

// React to player state
player.on('play', () => console.log('Playing'));
player.on('time', data => console.log(`${data.currentTimeHuman} / ${data.durationHuman}`));
```

The `'player'` argument is the ID of a `<div>` element — never use a `<video>` tag. The player creates its own video element internally.

## What You Get

**Playback engine** — MP4, WebM, HLS adaptive streaming with automatic quality switching

**Subtitle engine** — VTT subtitles built-in, ASS/SSA via the included OctopusPlugin

**State management** — CSS classes on the container (`playing`, `paused`, `buffering`, `active`, `inactive`, `error`) so your UI can react with pure CSS or JavaScript

**Event system** — 50+ typed events for playback, tracks, playlists, volume, quality, and more

**Plugin architecture** — Build your entire UI as a plugin with full access to the player API

**Playlist & tracks** — Multi-item playlists, audio track switching, quality levels, chapters, thumbnail sprites

## Building Your UI

The player adds CSS classes to the container div that reflect its state. Use these to drive your UI:

| Class           | When applied                                    |
| --------------- | ----------------------------------------------- |
| `nomercyplayer` | Always present                                  |
| `playing`       | Video is playing                                |
| `paused`        | Video is paused                                 |
| `buffering`     | Video is buffering                              |
| `active`        | User is interacting (mouse/keyboard activity)   |
| `inactive`      | User stopped interacting (controls should hide) |
| `error`         | Playback error occurred                         |

**With plain CSS** — target the state classes on the container:

```css
.nomercyplayer.paused .controls {
	opacity: 1;
}
.nomercyplayer.playing .controls {
	opacity: 0;
}
.nomercyplayer.active .controls {
	opacity: 1;
}
.nomercyplayer.buffering .spinner {
	display: flex;
}

```

**With Tailwind CSS** — add `group` to the container (the player does this automatically) and use the `group-[&.class]` modifier:

```html
<!-- Show controls when paused or active -->
<div class="opacity-0 group-[&.paused]:opacity-100 group-[&.active]:opacity-100 transition-opacity">
	<!-- your controls -->
</div>

<!-- Show spinner only when buffering -->
<div class="hidden group-[&.buffering]:flex">
	<!-- spinner -->
</div>

<!-- Hide an element during playback -->
<button class="flex group-[&.playing]:hidden">
	<!-- big play button -->
</button>

```

You can chain multiple states: `group-[&.nomercyplayer:not(.buffering).paused]:bg-black/50` targets a paused, non-buffering player.

Create a plugin to build your controls:

```typescript
import { Plugin } from '@nomercy-entertainment/nomercy-video-player';
import type { NMPlayer } from '@nomercy-entertainment/nomercy-video-player';

class MyUIPlugin extends Plugin {
	declare player: NMPlayer;

	initialize(player: NMPlayer) {
		this.player = player;
	}

	use() {
		// Build your UI using player.container, player.overlay, etc.
		// Listen to events: this.player.on('time', ...)
		// Call methods: this.player.play(), this.player.seek(30), etc.
	}

	dispose() {
		// Clean up DOM elements and event listeners
	}
}
```

See the [Plugin Development Guide](https://github.com/NoMercy-Entertainment/nomercy-video-player/wiki/Plugin-Development) for complete examples.

## Documentation

| Guide                                                                                                               | Description                             |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| [Getting Started](https://github.com/NoMercy-Entertainment/nomercy-video-player/wiki/Quick-Start-Guide)               | Installation, setup, and first plugin   |
| [Configuration](https://github.com/NoMercy-Entertainment/nomercy-video-player/wiki/Configuration)                     | All PlayerConfig options                |
| [Plugin Development](https://github.com/NoMercy-Entertainment/nomercy-video-player/wiki/Plugin-Development)           | Extending the player with plugins       |
| [Building a Player UI](https://github.com/NoMercy-Entertainment/nomercy-video-player/wiki/Building-a-Video-Player-UI) | 10-step tutorial from scratch           |
| [API Reference](https://github.com/NoMercy-Entertainment/nomercy-video-player/wiki/API-Reference)                     | Types and interfaces                    |
| [Methods](https://github.com/NoMercy-Entertainment/nomercy-video-player/wiki/API-Reference-Methods)                   | All NMPlayer methods                    |
| [Events](https://github.com/NoMercy-Entertainment/nomercy-video-player/wiki/Events)                                   | All events with data types              |
| [Framework Integration](https://github.com/NoMercy-Entertainment/nomercy-video-player/wiki/Framework-Integration)     | Vue, React, Svelte, Angular, Vanilla JS |

## Browser Support

| Feature       | Chrome | Firefox | Safari | Edge |
| ------------- | ------ | ------- | ------ | ---- |
| Core Playback | Yes    | Yes     | Yes    | Yes  |
| HLS Streaming | Yes    | Yes     | Native | Yes  |
| ASS Subtitles | Yes    | Yes     | Yes    | Yes  |
| Plugin System | Yes    | Yes     | Yes    | Yes  |

## Contributing

```bash
git clone https://github.com/NoMercy-Entertainment/nomercy-video-player.git
cd nomercy-video-player
npm install
npm run dev
npm run build
```

## License

[Apache-2.0](LICENSE)

## About

Built by the [NoMercy Entertainment](https://github.com/NoMercy-Entertainment) team. Powers video playback in [NoMercyTV](https://nomercy.tv/).

See also: [NoMercy MusicPlayer](https://github.com/NoMercy-Entertainment/nomercy-music-player) | [NoMercy MediaServer](https://github.com/NoMercy-Entertainment/nomercy-media-server)
