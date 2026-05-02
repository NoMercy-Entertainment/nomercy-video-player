import HLS from 'hls.js';
import type { NMPlayer, TimeData } from '../types';
import { humanTime } from './utils';

export const eventMethods = {
	videoPlayer_playEvent(this: NMPlayer): void {
		this.emit('beforePlay');

		this.container.classList.remove('paused');
		this.container.classList.add('playing');

		this.container.classList.remove('buffering');

		this.mediaSession.setPlaybackState('playing');

		this.emit('play', this.timeData());

		this.isPlaying = true;
	},

	videoPlayer_onPlayingEvent(this: NMPlayer): void {
		this.videoElement.removeEventListener('playing', this.videoPlayer_onPlayingEvent);

		if (!this.firstFrame) {
			this.emit('firstFrame');
			this.firstFrame = true;
		}

		this.setMediaAPI();

		this.on('item', () => {
			this.videoElement.addEventListener('playing', this.videoPlayer_onPlayingEvent, { passive: true });
			this.firstFrame = false;
		});

		this.mediaSession.setPlaybackState('playing');
	},

	videoPlayer_pauseEvent(this: NMPlayer): void {
		this.container.classList.remove('playing');
		this.container.classList.add('paused');

		this.emit('pause', this.timeData());

		this.mediaSession.setPlaybackState('paused');

		this.isPlaying = false;
	},

	videoPlayer_endedEvent(this: NMPlayer): void {
		this.emit('complete');

		if (this.currentIndex < this._playlist.length - 1) {
			if (this.options.disableAutoPlayback)
				return;
			this.playVideo(this.currentIndex + 1);
		}
		else {
			this.logger.debug('Playlist complete');
			this.isPlaying = false;
			this.emit('playlistComplete');

			this.isPlaying = false;
		}
	},

	videoPlayer_errorEvent(this: NMPlayer): void {
		this.emit('error', this.videoElement.error ?? undefined);

		this.isPlaying = false;
	},

	videoPlayer_waitingEvent(this: NMPlayer): void {
		this.emit('waiting', this.videoElement);
	},

	videoPlayer_canplayEvent(this: NMPlayer): void {
		this.emit('canplay', this.videoElement);
	},

	videoPlayer_loadedmetadataEvent(this: NMPlayer, e: Event): void {
		const video = e.target as HTMLVideoElement;

		this.resize();

		this.emit('loadedmetadata', this.videoElement);
		this.emit('duration', this.videoPlayer_getTimeData({ target: video }));
	},

	videoPlayer_loadstartEvent(this: NMPlayer): void {
		this.emit('loadstart', this.videoElement);
	},

	videoPlayer_timeupdateEvent(this: NMPlayer, e: Event): void {
		const _e = e as Event & { target: HTMLVideoElement };
		if (Number.isNaN(_e.target.duration) || Number.isNaN(_e.target.currentTime))
			return;

		this.emit('time', this.videoPlayer_getTimeData(_e));
	},

	videoPlayer_durationchangeEvent(this: NMPlayer, e: Event): void {
		const _e = e as Event & { target: HTMLVideoElement };
		this.emit('duration', this.videoPlayer_getTimeData(_e));
	},

	videoPlayer_volumechangeEvent(this: NMPlayer): void {
		if (this._volume !== Math.round(this.videoElement.volume * 100)) {
			this.emit('volume', {
				volume: Math.round(this.videoElement.volume * 100),
				muted: this.videoElement.muted,
			});
		}

		if (this._muted !== this.videoElement.muted) {
			this.emit('mute', {
				volume: Math.round(this.videoElement.volume * 100),
				muted: this.videoElement.muted,
			});
		}

		this._muted = this.videoElement.muted;
		this._volume = Math.round(this.videoElement.volume * 100);
	},

	videoPlayer_getTimeData(this: NMPlayer, _e: { target: HTMLVideoElement }): TimeData {
		return {
			currentTime: _e.target.currentTime,
			duration: _e.target.duration,
			percentage: (_e.target.currentTime / _e.target.duration) * 100,
			remaining: _e.target.duration - _e.target.currentTime,
			currentTimeHuman: humanTime(_e.target.currentTime),
			durationHuman: humanTime(_e.target.duration),
			remainingHuman: humanTime(_e.target.duration - _e.target.currentTime),
			playbackRate: _e.target.playbackRate,
		};
	},

	emitPlayEvent(this: NMPlayer): void {
		this.emit('playing', true);
	},

	emitPausedEvent(this: NMPlayer): void {
		this.emit('playing', false);
	},

	_playerEvents: [] as { type: string; handler: (e?: any) => void }[],
	_containerEvents: [] as { type: string; handler: (e?: any) => void }[],
	_hlsRecoveryAttempts: 0,
	_hlsRecoveryTimer: null as ReturnType<typeof setTimeout> | null,
	_boundEmitPlay: null as ((data?: any) => void) | null,
	_boundEmitPaused: null as ((data?: any) => void) | null,
	_boundInteraction: null as ((data?: any) => void) | null,
	_boundPipClass: null as ((enabled: boolean) => void) | null,
	_boundTheaterClass: null as ((enabled: boolean) => void) | null,
	_boundFloatClass: null as ((enabled: boolean) => void) | null,

	_initEventArrays(this: NMPlayer): void {
		this._playerEvents = [
			{ type: 'play', handler: this.videoPlayer_playEvent.bind(this) },
			{ type: 'playing', handler: this.videoPlayer_onPlayingEvent.bind(this) },
			{ type: 'pause', handler: this.videoPlayer_pauseEvent.bind(this) },
			{ type: 'ended', handler: this.videoPlayer_endedEvent.bind(this) },
			{ type: 'error', handler: this.videoPlayer_errorEvent.bind(this) },
			{ type: 'waiting', handler: this.videoPlayer_waitingEvent.bind(this) },
			{ type: 'canplay', handler: this.videoPlayer_canplayEvent.bind(this) },
			{ type: 'loadedmetadata', handler: this.videoPlayer_loadedmetadataEvent.bind(this) },
			{ type: 'loadstart', handler: this.videoPlayer_loadstartEvent.bind(this) },
			{ type: 'timeupdate', handler: this.videoPlayer_timeupdateEvent.bind(this) },
			{ type: 'durationchange', handler: this.videoPlayer_durationchangeEvent.bind(this) },
			{ type: 'volumechange', handler: this.videoPlayer_volumechangeEvent.bind(this) },
			{ type: 'keydown', handler: this.ui_resetInactivityTimer.bind(this) },
		];

		this._containerEvents = [
			{ type: 'click', handler: this.ui_resetInactivityTimer.bind(this) },
			{ type: 'mousemove', handler: this.ui_resetInactivityTimer.bind(this) },
			{ type: 'mouseleave', handler: this.handleMouseLeave.bind(this) },
			{ type: 'keydown', handler: this.ui_resetInactivityTimer.bind(this) },
		];
	},

	_addEvents(this: NMPlayer): void {
		this._initEventArrays();

		this._playerEvents.forEach((event) => {
			this.videoElement.addEventListener(event.type, event.handler, { passive: true });
		});
		this._containerEvents.forEach((event) => {
			this.container.addEventListener(event.type, event.handler as EventListener, { passive: true });
		});

		this._boundEmitPlay = this.emitPlayEvent.bind(this);
		this._boundEmitPaused = this.emitPausedEvent.bind(this);
		this._boundInteraction = this.ui_resetInactivityTimer.bind(this);

		this.on('play', this._boundEmitPlay);
		this.on('pause', this._boundEmitPaused);
		this.on('interaction', this._boundInteraction);

		this._boundPipClass = (enabled: boolean) => {
			this.container.classList.toggle('pip', enabled);
			this.container.classList.toggle('not-pip', !enabled);
		};
		this._boundTheaterClass = (enabled: boolean) => {
			this.container.classList.toggle('theater', enabled);
			this.container.classList.toggle('not-theater', !enabled);
		};
		this._boundFloatClass = (enabled: boolean) => {
			this.container.classList.toggle('floating', enabled);
			this.container.classList.toggle('not-floating', !enabled);
		};

		this.on('pip', this._boundPipClass);
		this.on('theater', this._boundTheaterClass);
		this.on('float', this._boundFloatClass);

		this.mediaSession?.setActionHandler({
			play: this.play.bind(this),
			pause: this.pause.bind(this),
			stop: this.stop.bind(this),
			previous: this.previous.bind(this),
			next: this.next.bind(this),
			seek: this.seek.bind(this),
			getPosition: this.currentTime.bind(this),
		});

		this.on('item', () => {
			this.lastTime = 0;
			setTimeout(() => {
				this.emit('subtitleList', this.subtitles());
				this.emit('captionsList', this.subtitles());
				this.emit('levels', this.qualityLevels());
				this.emit('levelsChanging', {
					id: this.hls?.loadLevel,
					name: this.qualityLevels().find(l => l.id === this.hls?.loadLevel)?.name,
				});
			}, 250);
		});

		this.on('seeked', () => {
			this.lastTime = 0;
		});

		this.on('firstFrame', () => {
			this.emit('audioTracks', this.audioTracks());
		});

		this.on('chapters', () => {
			this.setMediaAPI();
		});

		this.on('hls', () => {
			if (!this.hls)
				return;

			this.hls.on(HLS.Events.AUDIO_TRACK_LOADING, (event, data) => {
				this.logger.verbose(event, { data });
			});
			this.hls.on(HLS.Events.AUDIO_TRACK_LOADED, (event, data) => {
				this.logger.verbose(event, { data });
			});
			this.hls.on(HLS.Events.AUDIO_TRACK_SWITCHING, (event, data) => {
				this.logger.verbose(event, { data });
				this.emit('audioTrackChanging', {
					id: data.id,
					name: (this.audioTracks() as any[]).find(l => l.id === data.id)?.name,
				});
			});
			this.hls.on(HLS.Events.AUDIO_TRACK_SWITCHED, (event, data) => {
				this.logger.verbose(event, { data });
				this.emit('audioTrackChanged', {
					id: data.id,
					name: (this.audioTracks() as any[]).find(l => l.id === data.id)?.name,
				});
			});

			this.hls.on(HLS.Events.ERROR, (error, errorData) => {
				this.logger.error('HLS error', { error, details: errorData.details, fatal: errorData.fatal });

				if (errorData.details === 'bufferNudgeOnStall') {
					this.seek(this.videoElement.currentTime + 1);
				}

				if (!errorData.fatal)
					return;

				const MAX_RECOVERY_ATTEMPTS = 3;

				if (this._hlsRecoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
					this.logger.error('HLS fatal error: max recovery attempts reached', {
						attempts: this._hlsRecoveryAttempts,
						details: errorData.details,
					});
					this.emit('error', new MediaError());
					this.container.classList.add('error');
					return;
				}

				this._hlsRecoveryAttempts += 1;
				this.logger.warn('HLS fatal error: attempting recovery', {
					attempt: this._hlsRecoveryAttempts,
					type: errorData.type,
					details: errorData.details,
				});

				this.emit('recovering', { attempt: this._hlsRecoveryAttempts, details: errorData.details } as any);

				if (errorData.type === HLS.ErrorTypes.NETWORK_ERROR) {
					// Exponential back-off before retrying the load
					const delay = Math.min(1000 * 2 ** (this._hlsRecoveryAttempts - 1), 8000);
					if (this._hlsRecoveryTimer !== null) {
						clearTimeout(this._hlsRecoveryTimer);
					}
					this._hlsRecoveryTimer = setTimeout(() => {
						this._hlsRecoveryTimer = null;
						this.hls?.startLoad();
					}, delay);
				}
				else if (errorData.type === HLS.ErrorTypes.MEDIA_ERROR) {
					this.hls?.recoverMediaError();
				}
				else {
					// Unknown fatal error: destroy and re-attach
					const currentSrc = this.videoElement.currentSrc || this.videoElement.src;
					if (currentSrc) {
						this.hls?.destroy();
						this.hls = undefined;
						this.loadSource(currentSrc);
					}
				}
			});

			this.hls.on(HLS.Events.LEVEL_LOADED, (event, data) => {
				this.logger.verbose(event, { data });

				this.videoElement.style.setProperty('--aspect-ratio', data.levelInfo ? `${data.levelInfo?.width / data.levelInfo?.height}` : '');
			});
			this.hls.on(HLS.Events.LEVEL_LOADING, (event, data) => {
				this.logger.verbose(event, { data });
			});
			this.hls.on(HLS.Events.LEVEL_SWITCHED, (_, data) => {
				this.emit('levelsChanged', {
					id: data.level,
					name: this.qualityLevels().find(l => l.id === data.level)?.name,
				});
			});
			this.hls.on(HLS.Events.LEVEL_SWITCHING, (_, data) => {
				this.emit('levelsChanging', {
					id: data.level,
					name: this.qualityLevels().find(l => l.id === data.level)?.name,
				});
			});
			this.hls.on(HLS.Events.LEVEL_UPDATED, (event, data) => {
				this.logger.verbose(event, { data });
			});
			this.hls.on(HLS.Events.LEVELS_UPDATED, (event, data) => {
				this.logger.verbose(event, { data });
			});

			this.hls.on(HLS.Events.MANIFEST_LOADED, (event, data) => {
				this.logger.verbose(event, { data });
			});
			this.hls.on(HLS.Events.MANIFEST_PARSED, (event, data) => {
				this.logger.verbose(event, { data });
			});
			this.hls.on(HLS.Events.MANIFEST_LOADING, (event, data) => {
				this.logger.verbose(event, { data });
			});
			this.hls.on(HLS.Events.STEERING_MANIFEST_LOADED, (event, data) => {
				this.logger.verbose(event, { data });
			});

			this.hls.on(HLS.Events.MEDIA_ATTACHED, (event, data) => {
				this.logger.verbose(event, { data });
			});
			this.hls.on(HLS.Events.MEDIA_ATTACHING, (event, data) => {
				this.logger.verbose(event, { data });
			});
			this.hls.on(HLS.Events.MEDIA_DETACHED, (event) => {
				this.logger.verbose(event);
			});
			this.hls.on(HLS.Events.MEDIA_DETACHING, (event) => {
				this.logger.verbose(event);
			});
		});

		this.once('item', () => {
			this.on('subtitleList', async () => {
				await this.setCurrentCaptionFromStorage();
			});
			this.on('audioTracks', () => {
				if (this.audioTracks().length < 2)
					return;

				this.setCurrentAudioTrackFromStorage();

				this.once('play', async () => {
					this.setCurrentAudioTrackFromStorage();

					const audioLanguage = await this.storage.get('audio-language', null);

					this.emit('audioTrackChanged', {
						id: (this.audioTracks() as any[]).find(l => l.lang === audioLanguage)?.id,
						name: (this.audioTracks() as any[]).find(l => l.lang === audioLanguage)?.name,
					});
				});
			});

			if (!this.options.disableControls) {
				this.videoElement.focus();
			}

			const item = this.getParameterByName<number>('item');
			const season = this.getParameterByName<number>('season');
			const episode = this.getParameterByName<number>('episode');

			if (item != null) {
				setTimeout(() => {
					this.setEpisode(0, item);
				}, 0);
			}
			else if (season != null && episode != null) {
				setTimeout(() => {
					this.setEpisode(season, episode);
				}, 0);
			}
			else {
				const progressItem = this.playlist()
					.filter(i => i.progress);

				if (progressItem.length === 0 && this.options.autoPlay && !this.options.disableAutoPlayback) {
					this.play().catch((err) => {
						this.logger.verbose('Autoplay rejected', { reason: String(err) });
					});
					return;
				}

				const playlistItem = progressItem
					.filter(i => i.progress)
					.sort((a, b) => new Date(b.progress!.date).getTime() - new Date(a.progress!.date).getTime())
					.at(0);

				if (!playlistItem?.progress) {
					if (this.options.autoPlay && !this.options.disableAutoPlayback) {
						this.play().catch((err) => {
							this.logger.verbose('Autoplay rejected', { reason: String(err) });
						});
					}
					return;
				}

				setTimeout(() => {
					if (this.options.disableAutoPlayback)
						return;
					const duration = this.duration();
					const progressTime = playlistItem.progress?.time ?? 0;
					if (playlistItem.progress && Number.isFinite(duration) && duration > 0 && 100 * progressTime / duration > 90) {
						this.playlistItem(this.playlist().indexOf(playlistItem) + 1);
					}
					else {
						this.playlistItem(this.playlist().indexOf(playlistItem));
					}
				}, 0);

				this.once('firstFrame', () => {
					if (!playlistItem.progress || this.options.disableAutoPlayback)
						return;

					this.seek(playlistItem.progress.time);
				});
			}
		});

		this.on('play', () => {
			this.container.classList.remove('buffering');
			this.container.classList.remove('error');
			// Reset HLS recovery counter on successful playback
			this._hlsRecoveryAttempts = 0;
			if (this._hlsRecoveryTimer !== null) {
				clearTimeout(this._hlsRecoveryTimer);
				this._hlsRecoveryTimer = null;
			}
		});

		this.on('time', () => {
			this.container.classList.remove('buffering');
			this.container.classList.remove('error');
		});

		this.on('waiting', () => {
			this.container.classList.add('buffering');
		});

		this.on('error', () => {
			this.container.classList.add('error');
		});

		this.on('ended', () => {
			this.container.classList.remove('buffering');
			this.container.classList.remove('error');
		});

		this.on('time', (data) => {
			if (data.currentTime > this.lastTime + 5) {
				this.emit('lastTimeTrigger', data);
				this.lastTime = data.currentTime;
			}
		});

		this.on('bufferedEnd', () => {
			this.container.classList.remove('buffering');
		});

		this.on('stalled', () => {
			this.container.classList.add('buffering');
		});

		this.on('item', async () => {
			this.once('audioTracks', () => {
				if (this.audioTracks().length < 2)
					return;
				this.setCurrentAudioTrackFromStorage();
				this.once('play', () => {
					this.setCurrentAudioTrackFromStorage();
				});
			});
			this.container.classList.remove('buffering');
			this.container.classList.remove('error');
			await this.setCurrentCaptionFromStorage();
			this.fetchChapterFile();
		});
	},

	_removeEvents(this: NMPlayer): void {
		this._playerEvents.forEach((event) => {
			this.videoElement.removeEventListener(event.type, event.handler);
		});

		this._containerEvents.forEach((event) => {
			this.container.removeEventListener(event.type, event.handler as EventListener);
		});

		if (this._boundEmitPlay)
			this.off('play', this._boundEmitPlay);
		if (this._boundEmitPaused)
			this.off('pause', this._boundEmitPaused);
		if (this._boundInteraction)
			this.off('interaction', this._boundInteraction);
		if (this._boundPipClass)
			this.off('pip', this._boundPipClass);
		if (this._boundTheaterClass)
			this.off('theater', this._boundTheaterClass);
		if (this._boundFloatClass)
			this.off('float', this._boundFloatClass);
	},
};
