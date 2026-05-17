Svelte's `onMount` and `onDestroy` map directly to the player lifecycle.

## Component

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import nmplayer from '@nomercy-entertainment/nomercy-video-player';
  import { KeyHandlerPlugin } from '@nomercy-entertainment/nomercy-video-player/plugins';
  import type { NMVideoPlayer, VideoPlaylistItem, VideoPlayerConfig } from '@nomercy-entertainment/nomercy-video-player';

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

  const containerId = 'nomercy-player';
  const config: VideoPlayerConfig = { playlist, basePath, imageBasePath };

  let player: NMVideoPlayer | null = null;
  let currentTime = 0;
  let duration = 0;
  let isPlaying = false;

  onMount(() => {
    player = nmplayer(containerId)
      .addPlugin(KeyHandlerPlugin)
      .setup(config);

    player.on('ready', () => {
      player!.current(0, { autoplay: true });
    });

    player.on('time', (data) => { currentTime = data.time; });
    player.on('duration', (data) => { duration = data.duration; });
    player.on('play', () => { isPlaying = true; });
    player.on('pause', () => { isPlaying = false; });
  });

  onDestroy(() => {
    player?.dispose();
    player = null;
  });
</script>

<div>
  <div id={containerId} style="width: 100%; aspect-ratio: 16/9;" />

  <div class="controls">
    <button on:click={() => player?.togglePlayback()}>
      {isPlaying ? 'Pause' : 'Play'}
    </button>
    <span>{Math.floor(currentTime)}s / {Math.floor(duration)}s</span>
  </div>
</div>
```

## Svelte 5 (Runes)

With Svelte 5 runes, use `$state` and `$effect`:

```svelte
<script lang="ts">
  import nmplayer from '@nomercy-entertainment/nomercy-video-player';
  import { KeyHandlerPlugin } from '@nomercy-entertainment/nomercy-video-player/plugins';
  import type { NMVideoPlayer, VideoPlaylistItem, VideoPlayerConfig } from '@nomercy-entertainment/nomercy-video-player';

  const basePath = 'https://raw.githubusercontent.com/NoMercy-Entertainment/media/master/Films/Films';
  const imageBasePath = 'https://image.tmdb.org/t/p';

  const playlist: VideoPlaylistItem[] = [
    {
      id: 'sintel',
      title: 'Sintel',
      url: '/Sintel.(2010)/Sintel.(2010).NoMercy.m3u8',
      image: '/w780/q2bVM5z90tCGbmXYtq2J38T5hSX.jpg',
      duration: 888,
    },
  ];

  const containerId = 'nomercy-player';
  const config: VideoPlayerConfig = { playlist, basePath, imageBasePath };

  let player = $state<NMVideoPlayer | null>(null);
  let currentTime = $state(0);
  let duration = $state(0);
  let isPlaying = $state(false);

  $effect(() => {
    const instance = nmplayer(containerId)
      .addPlugin(KeyHandlerPlugin)
      .setup(config);

    instance.on('ready', () => {
      instance.current(0, { autoplay: true });
    });

    instance.on('time', (data) => { currentTime = data.time; });
    instance.on('duration', (data) => { duration = data.duration; });
    instance.on('play', () => { isPlaying = true; });
    instance.on('pause', () => { isPlaying = false; });

    player = instance;

    return () => {
      instance.dispose();
      player = null;
    };
  });
</script>

<div>
  <div id={containerId} style="width: 100%; aspect-ratio: 16/9;"></div>

  <div class="controls">
    <button onclick={() => player?.togglePlayback()}>
      {isPlaying ? 'Pause' : 'Play'}
    </button>
    <span>{Math.floor(currentTime)}s / {Math.floor(duration)}s</span>
  </div>
</div>
```

## Next Steps

- [Plugin Development](Plugin-Development) — extending the player
- [Events](Events) — full event reference
- [Framework Integration](Framework-Integration) — other frameworks
