The recommended pattern is a custom hook that manages the player lifecycle inside a `useEffect`.

## Hook

```typescript
// hooks/useNMPlayer.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import nmplayer from '@nomercy-entertainment/nomercy-video-player';
import { KeyHandlerPlugin } from '@nomercy-entertainment/nomercy-video-player/plugins';
import type { NMVideoPlayer, VideoPlayerConfig } from '@nomercy-entertainment/nomercy-video-player';

export function useNMPlayer(containerId: string, config: VideoPlayerConfig) {
	const playerRef = useRef<NMVideoPlayer | null>(null);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [isPlaying, setIsPlaying] = useState(false);

	useEffect(() => {
		const instance = nmplayer(containerId)
			.addPlugin(KeyHandlerPlugin)
			.setup(config);

		instance.on('ready', () => {
			instance.current(0, { autoplay: true });
		});

		instance.on('time', (data) => {
			setCurrentTime(data.time);
		});

		instance.on('duration', (data) => {
			setDuration(data.duration);
		});

		instance.on('play', () => setIsPlaying(true));
		instance.on('pause', () => setIsPlaying(false));

		playerRef.current = instance;

		return () => {
			instance.dispose();
			playerRef.current = null;
		};
	}, [containerId]);

	const togglePlayback = useCallback(() => {
		playerRef.current?.togglePlayback();
	}, []);

	return { player: playerRef, currentTime, duration, isPlaying, togglePlayback };
}
```

## Component

```tsx
import { useNMPlayer } from './hooks/useNMPlayer';
import type { VideoPlayerConfig, VideoPlaylistItem } from '@nomercy-entertainment/nomercy-video-player';

const basePath = 'https://raw.githubusercontent.com/NoMercy-Entertainment/media/master/Films/Films';
const imageBasePath = 'https://image.tmdb.org/t/p';

const playlist: VideoPlaylistItem[] = [
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

const config: VideoPlayerConfig = { playlist, basePath, imageBasePath };

export default function NMPlayerView({ containerId = 'nomercy-player' }: { containerId?: string }) {
	const { currentTime, duration, isPlaying, togglePlayback } = useNMPlayer(containerId, config);

	return (
		<div>
			<div id={containerId} style={{ width: '100%', aspectRatio: '16/9' }} />

			<div className="controls">
				<button onClick={togglePlayback}>
					{isPlaying ? 'Pause' : 'Play'}
				</button>
				<span>
					{Math.floor(currentTime)}s / {Math.floor(duration)}s
				</span>
			</div>
		</div>
	);
}
```

## Important Notes

- The `useEffect` cleanup function calls `dispose()` — this tears down HLS, event listeners, and the video element.
- Keep `config` outside the component or memoize it to avoid re-initializing the player on every render.
- The hook uses `useRef` for the player instance to avoid triggering re-renders on player creation.

## Next Steps

- [Plugin Development](Plugin-Development) — extending the player
- [Events](Events) — full event reference
- [Framework Integration](Framework-Integration) — other frameworks
