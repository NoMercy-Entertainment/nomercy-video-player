Vue is the primary framework used by the project maintainers. The recommended pattern is a composable that owns the player lifecycle.

## Composable

```typescript
// composables/useNMPlayer.ts
import { onBeforeUnmount, onMounted } from 'vue';
import type { Ref } from 'vue';
import nmplayer from '@nomercy-entertainment/nomercy-video-player';
import { KeyHandlerPlugin } from '@nomercy-entertainment/nomercy-video-player/plugins';
import type { NMVideoPlayer, VideoPlayerConfig } from '@nomercy-entertainment/nomercy-video-player';

export function useNMPlayer(containerId: string, config: Ref<VideoPlayerConfig>) {
	let player: NMVideoPlayer | null = null;

	onMounted(() => {
		player = nmplayer(containerId)
			.addPlugin(KeyHandlerPlugin)
			.setup(config.value);

		player.on('ready', () => {
			player!.current(0, { autoplay: true });
		});
	});

	onBeforeUnmount(() => {
		player?.dispose();
		player = null;
	});

	return {
		togglePlayback: () => player?.togglePlayback(),
		seek: (seconds: number) => player?.currentTime(seconds),
	};
}
```

## Component

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useNMPlayer } from '@/composables/useNMPlayer';
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

const config = ref<VideoPlayerConfig>({
  playlist,
  basePath,
  imageBasePath,
});

const containerId = 'nomercy-player';
const { togglePlayback } = useNMPlayer(containerId, config);
</script>

<template>
  <div>
    <div :id="containerId" style="width: 100%; aspect-ratio: 16/9;" />

    <div class="controls">
      <button @click="togglePlayback()">Play / Pause</button>
    </div>
  </div>
</template>
```

## Reactive Playlist Updates

To switch the queue while the player is running, call `player.queue(newItems)` followed by `player.current(0, { autoplay: true })`:

```typescript
function loadNewPlaylist(items: VideoPlaylistItem[]) {
	player?.queue(items);
	player?.current(0, { autoplay: true });
}
```

## Next Steps

- [Plugin Development](Plugin-Development) — extending the player
- [Events](Events) — full event reference
- [Framework Integration](Framework-Integration) — other frameworks
