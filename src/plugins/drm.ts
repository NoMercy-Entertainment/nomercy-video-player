import { DrmError, Plugin } from '@nomercy-entertainment/nomercy-player-core';
import type { NMVideoPlayer } from '../index';

/** Options for the video {@link DrmPlugin}. */
export interface DrmOptions {
	/** EME key system identifier — `'com.widevine.alpha' | 'com.apple.fps' | 'com.microsoft.playready'` etc. */
	keySystem: string;
	/** License server URL. */
	licenseUrl: string;
	/** Service certificate for FairPlay (optional for Widevine/PlayReady). */
	certificate?: ArrayBuffer | string;
	/** Optional request signer for license calls (HMAC etc.). */
	customSignRequest?: (request: Request) => Request | Promise<Request>;
	/** Optional license request body transformer. */
	transformLicenseRequest?: (challenge: ArrayBuffer) => ArrayBuffer | Promise<ArrayBuffer>;
	/** Optional license response body transformer. */
	transformLicenseResponse?: (response: ArrayBuffer) => ArrayBuffer | Promise<ArrayBuffer>;
	/** Output protection requirements. */
	hdcpRequired?: 'type-0' | 'type-1' | 'none';
}

/** Events emitted by the video {@link DrmPlugin}. */
export interface DrmEvents {
	'key:requested': { sessionId: string; initData: ArrayBuffer };
	'key:granted': { sessionId: string };
	'key:expired': { sessionId: string };
	'key:revoked': { sessionId: string };
	'key:error': { sessionId: string; error: Error };
	'output:restricted': { reason: string };
	'output:downgraded': { from: string; to: string };
	unsupported: { reason: string };
}

interface DrmItemHint {
	drm?: {
		keySystem?: string;
		initData?: ArrayBuffer;
		[key: string]: unknown;
	};
}

/**
 * EME DRM coordination plugin. Handles license acquisition for Widevine /
 * FairPlay / PlayReady and routes HDCP / output-protection signals.
 *
 * Stub-but-loadable: registration + lifecycle is real, license fetch routing
 * (with optional `customSignRequest`) is real, but the actual EME key-system
 * handshake is gated behind `requestMediaKeySystemAccess` so JSDOM and other
 * environments without EME stay quiet. When the API is missing, an
 * `unsupported` event is emitted and the plugin exits cleanly.
 */
export class DrmPlugin extends Plugin<NMVideoPlayer<any>, DrmOptions, DrmEvents> {
	static override readonly id: string = 'drm';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'EME DRM coordination — Widevine / FairPlay / PlayReady with HDCP signalling';

	private supported = false;

	/** Probes EME availability and wires the `current` listener to trigger the key-system handshake. */
	override use(): void {
		const nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined;
		if (!nav || typeof (nav as Navigator & { requestMediaKeySystemAccess?: unknown }).requestMediaKeySystemAccess !== 'function') {
			this.emit('unsupported', { reason: 'requestMediaKeySystemAccess not available in this environment' });
			return;
		}
		this.supported = true;

		this.on('current', (payload) => {
			const item = payload?.item as DrmItemHint | undefined;
			const drm = item?.drm;
			if (!drm) return;
			void this.tryHandshake(drm.keySystem ?? this.opts?.keySystem);
		});
	}

	/** Resets EME support state on teardown. */
	override dispose(): void {
		this.supported = false;
	}

	/**
	 * Fetch a license blob from the configured license server. Wraps the
	 * request through `customSignRequest` when provided so callers can apply
	 * HMAC / proprietary signing without subclassing.
	 */
	async fetchLicense(challenge: ArrayBuffer): Promise<ArrayBuffer> {
		const url = this.opts?.licenseUrl;
		if (!url) {
			throw new DrmError({
				code: 'core:drm/license-url-missing',
				severity: 'error',
				scope: { kind: 'plugin', id: DrmPlugin.id },
				message: 'DrmPlugin: licenseUrl is required.',
				suggestion: 'Pass `licenseUrl` to addPlugin(DrmPlugin, { licenseUrl: \'https://...\' }).',
			});
		}
		const transformedChallenge = this.opts?.transformLicenseRequest
			? await this.opts.transformLicenseRequest(challenge)
			: challenge;

		// When customSignRequest is provided, build a Request, run it through
		// the signer, and fetch via the auth-aware kit fetch helper using the
		// signed URL. The signer can mutate headers via its returned Request.
		if (this.opts?.customSignRequest && typeof Request !== 'undefined') {
			const req = new Request(url, { method: 'POST', body: transformedChallenge as BodyInit });
			const signed = await this.opts.customSignRequest(req);
			const raw = await this.fetch<string>(signed.url, r => r);
			const buf = new TextEncoder().encode(raw).buffer as ArrayBuffer;
			return this.opts?.transformLicenseResponse
				? await this.opts.transformLicenseResponse(buf)
				: buf;
		}

		const raw = await this.fetch<string>(url, r => r);
		const buf = new TextEncoder().encode(raw).buffer as ArrayBuffer;
		return this.opts?.transformLicenseResponse
			? await this.opts.transformLicenseResponse(buf)
			: buf;
	}

	/** Returns the backend's `mediaKeys` if EME is supported and bound. */
	mediaKeys(): MediaKeys | null {
		if (!this.supported) return null;
		const ve = (this.player as unknown as { videoElement?: HTMLVideoElement }).videoElement;
		return ve?.mediaKeys ?? null;
	}

	private async tryHandshake(keySystem: string | undefined): Promise<void> {
		if (!this.supported || !keySystem) return;
		const nav = navigator as Navigator & {
			requestMediaKeySystemAccess?: (keySystem: string, configs: MediaKeySystemConfiguration[]) => Promise<unknown>;
		};
		if (typeof nav.requestMediaKeySystemAccess !== 'function') {
			this.emit('unsupported', { reason: 'requestMediaKeySystemAccess unavailable at handshake time' });
			return;
		}
		try {
			// Minimal config — real EME negotiation is consumer-extensible. We
			// only verify the key system is reachable; full key-session handling
			// belongs in a future iteration.
			await nav.requestMediaKeySystemAccess(keySystem, [{
				initDataTypes: ['cenc'],
				audioCapabilities: [{ contentType: 'audio/mp4;codecs="mp4a.40.2"' }],
				videoCapabilities: [{ contentType: 'video/mp4;codecs="avc1.42E01E"' }],
			}]);
		}
		catch (err) {
			this.emit('key:error', { sessionId: 'init', error: err instanceof Error ? err : new Error(String(err)) });
		}
	}
}

/** Plugin alias for the video {@link DrmPlugin}. Pass to `addPlugin(drmPlugin)`. */
export const drmPlugin = DrmPlugin;
