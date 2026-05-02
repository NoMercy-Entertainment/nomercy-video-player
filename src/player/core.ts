import HLS from 'hls.js';
import type { NMPlayer, SubtitleStyle } from '../types';
import { defaultSubtitleStyles, getEdgeStyle, pad, parseColorToHex } from './utils';
import type { Cue } from 'webvtt-parser';

const EMPTY_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

export const coreMethods = {
	styleContainer(this: NMPlayer): void {
		this.container.classList.add('nomercyplayer');
		this.container.style.overflow = 'hidden';
		this.container.style.position = 'relative';
		this.container.style.display = 'flex';
		this.container.style.width = '100%';
		this.container.style.height = '100%';
		this.container.style.aspectRatio = '16/9';
		this.container.style.zIndex = '0';
		this.container.style.alignItems = 'center';
		this.container.style.justifyContent = 'center';
		this.container.style.maxHeight = '100%';
		this.container.style.maxWidth = '100%';
	},

	createVideoElement(this: NMPlayer): void {
		this.videoElement = this.createElement('video', `${this.playerId}_video`, true)
			.appendTo(this.container)
			.get();

		this.setupVideoElementAttributes();
		this.setupVideoElementEventListeners();
		this.emitPausedEvent();
	},

	setupVideoElementAttributes(this: NMPlayer): void {
		this.videoElement.poster = EMPTY_IMAGE;
		this.videoElement.autoplay = (!!this.options.disableAutoPlayback && this.options.autoPlay) ?? false;
		this.videoElement.controls = this.options.controls ?? false;
		this.videoElement.preload = this.options.preload ?? 'auto';
		this.storage.get('muted', this.options.muted).then((val) => {
			this.videoElement.muted = val === true;
		});
		this.storage.get('volume', 100).then((val) => {
			this.videoElement.volume = val ? val / 100 : 1;
		});
	},

	setupVideoElementEventListeners(this: NMPlayer): void {
		this.videoElement.addEventListener('scroll', () => {
			this.videoElement.scrollIntoView();
		}, { passive: true });
	},

	createOverlayElement(this: NMPlayer): void {
		this.overlay = this.createElement('div', `${this.playerId}-ui-overlay`, true)
			.addClasses(['ui-overlay'])
			.appendTo(this.container)
			.get();
	},

	createBaseStyles(this: NMPlayer): void {
		const styleSheet = this.createElement('style', `${this.playerId}-styles`, true)
			.prependTo(this.container)
			.get();

		styleSheet.textContent = `
			.nomercyplayer {
				position: relative;
				width: 100%;
				height: 100%;
				background-color: black;
			}
			.nomercyplayer * {
				user-select: none;
				scrollbar-width: thin;
				scrollbar-color: transparent transparent;
			}

			.nomercyplayer.inactive {
				cursor: none;
			}

			.nomercyplayer .font-mono {
				font-family: 'Source Code Pro', monospace;
			}

			.nomercyplayer video {
				position: relative;
				width: 100%;
				height: 100%;
				max-width: 100%;
				max-height: 100%;
				overflow: hidden;
				z-index: 0;
				outline: 0;
				color: #eee;
				text-align: left;
				direction: ltr;
				font-size: 11px;
				line-height: 1.3;
				-webkit-font-smoothing: antialiased;
				-webkit-tap-highlight-color: rgba(0, 0, 0, 0);
				touch-action: manipulation;
    			aspect-ratio: var(--aspect-ratio, 16 / 9);
			}

			.nomercyplayer .libassjs-canvas-parent {
				pointer-events: none;
				position: absolute;
				bottom: 0;
				left: 0;
				right: 0;
				top: 0;
				z-index: 0;
				transition: bottom 0.3s ease-in-out;
			}

			.nomercyplayer .subtitle-overlay {
				pointer-events: none;
				position: absolute;
				z-index: 0;
				transition: bottom 0.3s ease-in-out;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
			}

			.nomercyplayer .libassjs-canvas {
				position: unset !important;
			}

			.nomercyplayer .subtitle-overlay .subtitle-safezone {
				position: absolute;
				inset: 0px;
				margin: 1.5%;
			}

			.nomercyplayer .subtitle-overlay .subtitle-area {
				direction: ltr;
				writing-mode: horizontal-tb;
				unicode-bidi: plaintext;
				white-space: pre-line;
				padding: 0.5rem 0;
				position: absolute;
				height: fit-content;
    			font-size: 28px;
    			transition: margin 0.3s ease-in-out;
			}

			.nomercyplayer:has(.subtitle-text:empty) .subtitle-overlay .subtitle-area {
				display: none;
			}

			.nomercyplayer .subtitle-overlay .subtitle-area.aligned-start {
				text-align: left;
			}

			.nomercyplayer .subtitle-overlay .subtitle-area.aligned-center {
				text-align: center;
			}

			.nomercyplayer .subtitle-overlay .subtitle-area.aligned-end {
				text-align: right;
			}

			.nomercyplayer .subtitle-overlay .subtitle-area.sized {
				left: 0;
				width: 100%;
			}

			.nomercyplayer .subtitle-overlay .subtitle-text {
				display: inline-block;
				white-space: pre-line;
				padding: 0 0.5rem;
				line-height: 1.2;
				writing-mode: horizontal-tb;
				unicode-bidi: plaintext;
			}

			.nomercyplayer .subtitle-overlay .subtitle-text:empty {
				display: none;
			}

			.nomercyplayer .subtitle-text,
			.nomercyplayer .subtitle-text[data-language="eng"] {
				font-family: 'ReithSans', sans-serif;
				font-weight: 500; /* Default to Regular */
				font-style: normal;
			}

			.nomercyplayer .subtitle-text i {
				font-style: italic;
			}

			.nomercyplayer .subtitle-text b {
				font-weight: 800; /* Bold */
			}

			.nomercyplayer .subtitle-text u {
				text-decoration: underline;
			}

			.nomercyplayer .subtitle-text b i,
			.nomercyplayer .subtitle-text i b {
				font-weight: 800;
				font-style: italic;
			}

			.nomercyplayer .subtitle-text[data-language="jpn"] {
				font-family: 'Noto Sans JP', sans-serif;
				font-weight: 500;
				font-style: normal;
			}

			.nomercyplayer .ui-overlay {
				align-items: center;
				display: flex;
				flex-direction: column;
				height: 100%;
				inset: 0px;
				justify-content: center;
				position: absolute;
				width: 100%;
				z-index: 10;
			}

			.nomercyplayer .player-message {
				background-color: var(--nomercyplayer-message-bg, rgb(23 23 23 / 0.95));
				border-radius: 0.375rem;
				color: var(--nomercyplayer-message-color, white);
				display: none;
				left: 50%;
				padding: 0.5rem 1rem;
				pointer-events: none;
				position: absolute;
				text-align: center;
				top: 3rem;
				transform: translateX(-50%);
				z-index: 50;
			}
		`;
	},

	createSubtitleFontFamily(this: NMPlayer): void {
		const fontBaseUrl = 'https://raw.githubusercontent.com/NoMercy-Entertainment/media/refs/heads/master/Fonts/ReithSans';

		const styleSheet = this.createElement('style', `${this.playerId}-fonts`, true)
			.appendTo(this.container)
			.get();

		styleSheet.textContent = `
			@import url(https://fonts.bunny.net/css?family=noto-sans-jp:500);
			@font-face {
				font-family: 'ReithSans';
				font-style: normal;
				font-weight: 500;
				font-display: swap;
				src: url("${fontBaseUrl}/ReithSansMedium.woff2") format("woff2");
			}
			@font-face {
				font-family: 'ReithSans';
				font-style: italic;
				font-weight: 500;
				font-display: swap;
				src: url("${fontBaseUrl}/ReithSansMediumItalic.woff2") format("woff2");
			}
			@font-face {
				font-family: 'ReithSans';
				font-style: normal;
				font-weight: 800;
				font-display: swap;
				src: url("${fontBaseUrl}/ReithSansExtraBold.woff2") format("woff2");
			}
			@font-face {
				font-family: 'ReithSans';
				font-style: italic;
				font-weight: 800;
				font-display: swap;
				src: url("${fontBaseUrl}/ReithSansExtraBoldItalic.woff2") format("woff2");
			}
		`;
	},

	createSubtitleOverlay(this: NMPlayer): void {
		this.subtitleOverlay = this.createElement('div', `${this.playerId}-subtitle-overlay`, true)
			.addClasses(['subtitle-overlay'])
			.appendTo(this.container)
			.get();

		this.subtitleSafeZone = this.createElement('div', `${this.playerId}-subtitle-safezone`, true)
			.addClasses(['subtitle-safezone'])
			.appendTo(this.subtitleOverlay)
			.get();

		this.subtitleArea = this.createElement('div', `${this.playerId}-subtitle-area`, true)
			.addClasses(['subtitle-area'])
			.appendTo(this.subtitleSafeZone)
			.get();

		this.subtitleText = this.createElement('span', `${this.playerId}-subtitle-text`, true)
			.addClasses(['subtitle-text'])
			.appendTo(this.subtitleArea)
			.get();

		this.on('time', this.checkSubtitles.bind(this));

		this.storage.get<SubtitleStyle>('subtitle-style', defaultSubtitleStyles)
			.then((val) => {
				this._subtitleStyle = val;
				this.applySubtitleStyle();
			});
	},

	applySubtitleStyle(this: NMPlayer): void {
		this.storage.set('subtitle-style', this._subtitleStyle).catch(() => {});

		Object.entries(this._subtitleStyle).forEach(([key, value]) => {
			this.emit('set-subtitle-style', {
				property: key,
				value,
			});
		});

		const {
			fontSize,
			fontFamily,
			textColor,
			textOpacity,
			backgroundColor,
			backgroundOpacity,
			edgeStyle,
			areaColor,
			windowOpacity,
		} = this._subtitleStyle;

		const areaElement = this.subtitleArea.style;
		const textElement = this.subtitleText.style;

		this.logger.debug('Applying subtitle style', { style: this._subtitleStyle });

		if (fontSize)
			textElement.fontSize = `calc(100% * ${fontSize / 100})`;
		if (fontFamily)
			textElement.fontFamily = fontFamily;
		if (textColor)
			textElement.color = parseColorToHex(textColor, textOpacity / 100);

		if (edgeStyle)
			textElement.textShadow = getEdgeStyle(edgeStyle, textOpacity / 100);

		if (backgroundColor) {
			textElement.backgroundColor = parseColorToHex(backgroundColor, backgroundOpacity / 100);
		}
		if (areaColor) {
			areaElement.backgroundColor = parseColorToHex(areaColor, windowOpacity / 100);
		}
	},

	computeSubtitlePosition(this: NMPlayer, cue: Cue, videoElement: HTMLVideoElement, subtitleArea: HTMLElement, subtitleText: HTMLElement) {
		if (!videoElement || !subtitleArea || !subtitleText) {
			return;
		}

		const videoHeight = videoElement.clientHeight;
		const subtitleHeight = subtitleArea.clientHeight;

		// Handle vertical positioning
		if (typeof cue.linePosition === 'number') {
			const verticalPos = cue.linePosition === 50
				? `${50 - (subtitleHeight / videoHeight * 50)}%`
				: `${cue.linePosition}%`;

			subtitleArea.style.bottom = '';
			subtitleArea.style.top = verticalPos;
		}
		else {
			subtitleArea.style.top = '';
			subtitleArea.style.bottom = '3%';
		}

		// Handle alignment
		subtitleArea.classList.remove('aligned-start', 'aligned-center', 'aligned-end');
		if (cue.alignment === 'start' || cue.alignment === 'left') {
			subtitleArea.classList.add('aligned-start');
		}
		else if (cue.alignment === 'center') {
			subtitleArea.classList.add('aligned-center');
		}
		else if (cue.alignment === 'end' || cue.alignment === 'right') {
			subtitleArea.classList.add('aligned-end');
		}

		// Handle width
		if (cue.size >= 0 && cue.size <= 100) {
			subtitleArea.style.width = `calc(${cue.size}% - 6%)`;
			subtitleArea.style.left = `calc(${(100 - cue.size) / 2}% + 3%)`;
			subtitleArea.style.right = `calc(${(100 - cue.size) / 2}% + 3%)`;
		}
		else {
			subtitleArea.style.width = '100%';
			subtitleArea.style.left = '3%';
			subtitleArea.style.right = '3%';
		}
	},

	updateDisplayOverlay(this: NMPlayer) {
		const playerWidth = this.videoElement.videoWidth;
		const playerHeight = this.videoElement.videoHeight;
		const playerAspectRatio = playerWidth / playerHeight;
		const videoAspectRatio = this.videoElement.videoWidth / this.videoElement.videoHeight;

		let insetInlineMatch = 0;
		let insetBlockMatch = 0;

		if (Math.abs(playerAspectRatio - videoAspectRatio) > 0.1) {
			if (playerAspectRatio > videoAspectRatio) {
				insetInlineMatch = Math.round((playerWidth - playerHeight * videoAspectRatio) / 2);
			}
			else {
				insetBlockMatch = Math.round((playerHeight - playerWidth / videoAspectRatio) / 2);
			}
		}

		this.subtitleSafeZone.style.insetInline = this.getCSSPositionValue(insetInlineMatch);
		this.subtitleSafeZone.style.insetBlock = this.getCSSPositionValue(insetBlockMatch);
	},

	getCSSPositionValue(this: NMPlayer, position: number): string {
		return position ? `${position}px` : '';
	},

	hdrSupported(this: NMPlayer): boolean {
		return screen.colorDepth > 24 && window.matchMedia('(color-gamut: p3)').matches;
	},

	loadSource(this: NMPlayer, url: string): void {
		this.pause();
		this.videoElement.removeAttribute('src');

		const baseUrl = url.split('?').at(0)?.toLowerCase();
		const isHls = baseUrl?.endsWith('.m3u8');

		// Determine if we should use HLS.js
		const hlsSupported = HLS.isSupported();
		const useHls = !this.options.disableHls && hlsSupported && (this.options.forceHls || isHls);

		this._hlsRecoveryAttempts = 0;
		if (this._hlsRecoveryTimer !== null) {
			clearTimeout(this._hlsRecoveryTimer);
			this._hlsRecoveryTimer = null;
		}

		if (useHls) {
			if (this.hls) {
				this.hls.destroy();
				this.hls = undefined;
			}

			this.hls = new HLS({
				debug: this.options.debug ?? false,
				enableWorker: true,
				lowLatencyMode: false,
				maxBufferHole: 0,
				maxBufferLength: 30,
				maxBufferSize: 0,
				autoStartLoad: true,
				testBandwidth: true,
				videoPreference: {
					preferHDR: this.hdrSupported(),
				},
				xhrSetup: (xhr) => {
					const token = this.getAccessToken();
					if (token) {
						xhr.setRequestHeader('authorization', `Bearer ${token}`);
					}
				},
			});

			this.emit('hls');

			this.hls.loadSource(encodeURI(url));
			this.hls.attachMedia(this.videoElement);
		}
		else {
			this.hls?.destroy();
			this.hls = undefined;
			const token = this.getAccessToken();
			this.videoElement.src = token ? `${url}${url.includes('?') ? '&' : '?'}token=${token}` : url;
		}

		if (this.options.disableAutoPlayback || !this.options.autoPlay)
			return;
		this.play().catch((err) => {
			this.logger.verbose('Autoplay rejected', { reason: String(err) });
		});
	},

	addGainNode(this: NMPlayer): void {
		const audioCtx = new window.AudioContext();
		this._audioContext = audioCtx;
		const source = audioCtx.createMediaElementSource(this.videoElement);

		const gainNode = audioCtx.createGain();
		this.gainNode = gainNode;

		gainNode.gain.value = 1;
		source.connect(gainNode);
		gainNode.connect(audioCtx.destination);

		setTimeout(() => {
			this.emit('gain', this.gain());
		}, 0);
	},

	removeGainNode(this: NMPlayer): void {
		this.gainNode?.disconnect();
		this._audioContext?.close().catch(() => {});
		this._audioContext = undefined;
	},

	resolveImageUrl(this: NMPlayer, image: string | undefined): string | undefined {
		if (!image)
			return undefined;
		if (image.startsWith('http'))
			return image;
		return (this.options.imageBasePath ?? this.options.basePath ?? '') + image;
	},

	setMediaAPI(this: NMPlayer): void {
		const data = this.playlistItem();
		const parsedTitle = data.title
			.replace('%S', this.localize('S'))
			.replace('%E', this.localize('E'));

		this.setTitle(`${data.season ? `${data.show} -` : ''} ${parsedTitle}`);

		const chapters = this.chapters();

		this.mediaSession.setMetadata({
			title: parsedTitle,
			artist: data.show,
			album: data.season ? `S${pad(data.season, 2)}E${pad(data.episode ?? 0, 2)}` : '',
			artwork: this.resolveImageUrl(data.image),
			chapters: chapters.length > 0
				? chapters.map(ch => ({
					title: ch.title,
					startTime: ch.startTime,
				}))
				: undefined,
		});
	},

	/** Fetches file contents from a URL and passes the result to the callback. */
	async getFileContents<T>(this: NMPlayer, { url, options, callback }: {
		url: string;
		options: {
			type?: any;
			anonymous?: boolean;
			language?: string;
		};
		callback: (arg: T) => void;
	}): Promise<void> {
		const headers: { [arg: string]: string } = {
			'Accept-Language': options.language || navigator.language,
		};
		const token = this.getAccessToken();
		if (token && !options.anonymous) {
			headers.Authorization = `Bearer ${token}`;
		}

		let basePath = '';
		if (this.options.basePath && !url.startsWith('http')) {
			basePath = this.options.basePath;
		}

		return await fetch(encodeURI(basePath + url), {
			...options,
			headers,
		})
			.then(async (response) => {
				if (!response.ok) {
					this.logger.warn('Failed to fetch file', { url: basePath + url, status: response.status, statusText: response.statusText });
					this.emit('warning', `HTTP ${response.status} fetching ${url}`);
					return;
				}
				switch (options.type) {
					case 'blob':
						callback(await response.blob() as T);
						break;
					case 'json':
						callback(await response.json() as T);
						break;
					case 'arrayBuffer':
						callback(await response.arrayBuffer() as T);
						break;
					case 'text':
					default:
						callback(await response.text() as T);
						break;
				}
			})
			.catch((reason) => {
				this.logger.error('Failed to fetch file contents', { url: basePath + url, reason: String(reason) });
			});
	},
};
