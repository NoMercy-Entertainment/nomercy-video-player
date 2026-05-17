No framework needed. Initialize the player after the DOM is ready.

## CDN / Script Tag

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<style>
			#nomercy-player {
				width: 100%;
				max-width: 960px;
				aspect-ratio: 16/9;
				background: #000;
			}
		</style>
	</head>
	<body>
		<div id="nomercy-player"></div>

		<div class="controls">
			<button id="play-btn">Play</button>
			<span id="time">0s / 0s</span>
		</div>

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
						tracks: [
							{
								id: 0,
								label: 'English',
								file: '/Sintel.(2010)/subtitles/Sintel.(2010).NoMercy.eng.full.vtt',
								language: 'eng',
								kind: 'subtitles',
							},
							{ id: 1, file: '/Sintel.(2010)/chapters.vtt', kind: 'chapters' },
						],
					},
				],
			};

			var player = window.nmplayer('nomercy-player').setup(config);

			var playBtn = document.getElementById('play-btn');
			var timeDisplay = document.getElementById('time');

			player.on('ready', function () {
				player.current(0, { autoplay: true });
			});

			player.on('time', function (data) {
				timeDisplay.textContent = Math.floor(data.time) + 's';
			});

			player.on('play', function () { playBtn.textContent = 'Pause'; });
			player.on('pause', function () { playBtn.textContent = 'Play'; });

			playBtn.addEventListener('click', function () {
				player.togglePlayback();
			});
		</script>
	</body>
</html>
```

## With a Bundler (Vite, Webpack, etc.)

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
	},
];

const config: VideoPlayerConfig = {
	basePath: 'https://raw.githubusercontent.com/NoMercy-Entertainment/media/master/Films/Films',
	imageBasePath: 'https://image.tmdb.org/t/p',
	playlist: items,
};

const player = nmplayer('nomercy-player')
	.addPlugin(KeyHandlerPlugin)
	.setup(config);

player.on('ready', () => {
	player.current(0, { autoplay: true });
});
```

## Cleanup

Always dispose when navigating away or removing the player:

```javascript
player.dispose();
```

## Next Steps

- [Plugin Development](Plugin-Development) — extending the player
- [Events](Events) — full event reference
- [Framework Integration](Framework-Integration) — other frameworks
