import type { Cue } from 'webvtt-parser';

export interface NMPlayerCore {
	/**
	 * Applies base styles to the player container element.
	 */
	styleContainer(): void;

	/**
	 * Creates the `<video>` element and appends it to the container.
	 */
	createVideoElement(): void;

	/**
	 * Configures attributes on the video element (crossOrigin, playsInline, etc.).
	 */
	setupVideoElementAttributes(): void;

	/**
	 * Attaches all native video event listeners (play, pause, timeupdate, etc.).
	 */
	setupVideoElementEventListeners(): void;

	/**
	 * Creates the overlay `<div>` that sits on top of the video element.
	 */
	createOverlayElement(): void;

	/**
	 * Injects the base CSS styles needed by the player into the document.
	 */
	createBaseStyles(): void;

	/**
	 * Injects `@font-face` declarations for subtitle fonts into the document.
	 */
	createSubtitleFontFamily(): void;

	/**
	 * Creates the subtitle overlay container and text elements.
	 */
	createSubtitleOverlay(): void;

	/**
	 * Applies the current subtitle style to the subtitle overlay elements.
	 */
	applySubtitleStyle(): void;

	/**
	 * Computes and applies CSS positioning for a subtitle cue based on its VTT position/line settings.
	 * @param cue - The VTT cue with positioning data.
	 * @param videoElement - The video element for dimension reference.
	 * @param subtitleArea - The subtitle area container element.
	 * @param subtitleText - The subtitle text element.
	 */
	computeSubtitlePosition(cue: Cue, videoElement: HTMLVideoElement, subtitleArea: HTMLElement, subtitleText: HTMLElement): void;

	/**
	 * Updates the display overlay with the current subtitle cue text.
	 */
	updateDisplayOverlay(): void;

	/**
	 * Converts a VTT position percentage to a CSS position value string.
	 * @param position - The position percentage (0–100).
	 * @returns The CSS position value.
	 */
	getCSSPositionValue(position: number): string;

	/**
	 * Checks whether the current display supports HDR content.
	 * @returns `true` if HDR is supported.
	 */
	hdrSupported(): boolean;

	/**
	 * Returns the cached HEVC decode support result. Synchronous; safe to call
	 * before {@link probeHevcSupport} resolves — falls back to a trust of
	 * `MediaSource.isTypeSupported` until the asynchronous MediaCapabilities
	 * probe lands.
	 * @returns `true` when HEVC can be decoded smoothly + power-efficiently.
	 */
	hevcSupported(): boolean;

	/**
	 * Runs the MediaCapabilities `decodingInfo` probe for HEVC Main10 and caches
	 * the result for subsequent {@link hevcSupported} calls. Distinguishes
	 * "browser advertises HEVC support" (`MediaSource.isTypeSupported` returns
	 * true) from "browser can actually decode it" (`smooth` + `powerEfficient`).
	 * Desktop Chrome on machines without an HEVC hardware decoder lies on the
	 * former but tells the truth on the latter.
	 * @returns `true` when HEVC decode is supported AND the decode is reported
	 *          smooth + power-efficient.
	 */
	probeHevcSupport(): Promise<boolean>;

	/**
	 * Loads a video source URL, setting up HLS.js for `.m3u8` streams or native playback otherwise.
	 * @param url - The video source URL.
	 */
	loadSource(url: string): void;

	/**
	 * Creates a Web Audio API AudioContext and connects a GainNode to the video element.
	 * This enables volume amplification beyond the normal 0–100% range.
	 * Emits a `'gain'` event with the initial gain state.
	 */
	addGainNode(): void;

	/**
	 * Disconnects and removes the GainNode from the audio pipeline.
	 * After calling this, `gain()` will throw until `addGainNode()` is called again.
	 */
	removeGainNode(): void;

	/**
	 * Resolves a relative image URL to an absolute URL using the configured `basePath`.
	 * @param image - The image URL to resolve.
	 * @returns The resolved URL, or `undefined` if input is `undefined`.
	 */
	resolveImageUrl(image: string | undefined): string | undefined;

	/**
	 * Sets up the Media Session API with metadata and action handlers for system media controls.
	 */
	setMediaAPI(): void;
}
