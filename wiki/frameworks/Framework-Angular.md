Use `AfterViewInit` to initialize the player after the DOM is ready, and `OnDestroy` to clean up.

## Component

```typescript
// nomercy-player.component.ts
import { AfterViewInit, Component, Input, OnDestroy } from '@angular/core';
import nmplayer from '@nomercy-entertainment/nomercy-video-player';
import { KeyHandlerPlugin } from '@nomercy-entertainment/nomercy-video-player/plugins';
import type { NMVideoPlayer, VideoPlayerConfig } from '@nomercy-entertainment/nomercy-video-player';

@Component({
	selector: 'app-nomercy-player',
	template: `
    <div>
      <div [id]="containerId" style="width: 100%; aspect-ratio: 16/9;"></div>

      <div class="controls">
        <button (click)="togglePlayback()">Play / Pause</button>
        <span>{{ currentTime | number:'1.0-0' }}s / {{ duration | number:'1.0-0' }}s</span>
      </div>
    </div>
  `,
})
export class NMPlayerComponent implements AfterViewInit, OnDestroy {
	@Input() containerId = 'nomercy-player';
	@Input() config!: VideoPlayerConfig;

	player: NMVideoPlayer | null = null;
	currentTime = 0;
	duration = 0;

	ngAfterViewInit() {
		this.player = nmplayer(this.containerId)
			.addPlugin(KeyHandlerPlugin)
			.setup(this.config);

		this.player.on('ready', () => {
			this.player!.current(0, { autoplay: true });
		});

		this.player.on('time', (data) => {
			this.currentTime = data.time;
		});

		this.player.on('duration', (data) => {
			this.duration = data.duration;
		});
	}

	ngOnDestroy() {
		this.player?.dispose();
		this.player = null;
	}

	togglePlayback() {
		this.player?.togglePlayback();
	}
}
```

## Usage

```typescript
import type { VideoPlayerConfig, VideoPlaylistItem } from '@nomercy-entertainment/nomercy-video-player';

const playlist: VideoPlaylistItem[] = [
	{
		id: 'sintel',
		title: 'Sintel',
		url: '/Sintel.(2010)/Sintel.(2010).NoMercy.m3u8',
		image: '/w780/q2bVM5z90tCGbmXYtq2J38T5hSX.jpg',
		duration: 888,
	},
];

const playerConfig: VideoPlayerConfig = {
	playlist,
	basePath: 'https://raw.githubusercontent.com/NoMercy-Entertainment/media/master/Films/Films',
	imageBasePath: 'https://image.tmdb.org/t/p',
};
```

```html
<app-nomercy-player containerId="nomercy-player" [config]="playerConfig" />
```

## Service Pattern

For shared player state across components, wrap the player in an Angular service:

```typescript
// nomercy-player.service.ts
import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import nmplayer from '@nomercy-entertainment/nomercy-video-player';
import type { NMVideoPlayer, VideoPlayerConfig } from '@nomercy-entertainment/nomercy-video-player';

@Injectable({ providedIn: 'root' })
export class NMPlayerService implements OnDestroy {
	private player: NMVideoPlayer | null = null;

	readonly isPlaying$ = new BehaviorSubject(false);
	readonly currentTime$ = new BehaviorSubject(0);
	readonly duration$ = new BehaviorSubject(0);

	init(containerId: string, config: VideoPlayerConfig) {
		this.player = nmplayer(containerId).setup(config);

		this.player.on('ready', () => {
			this.player!.current(0, { autoplay: true });
		});

		this.player.on('play', () => this.isPlaying$.next(true));
		this.player.on('pause', () => this.isPlaying$.next(false));

		this.player.on('time', (data) => {
			this.currentTime$.next(data.time);
		});

		this.player.on('duration', (data) => {
			this.duration$.next(data.duration);
		});
	}

	togglePlayback() {
		this.player?.togglePlayback();
	}

	ngOnDestroy() {
		this.player?.dispose();
		this.player = null;
	}
}
```

## Next Steps

- [Plugin Development](Plugin-Development) — extending the player
- [Events](Events) — full event reference
- [Framework Integration](Framework-Integration) — other frameworks
