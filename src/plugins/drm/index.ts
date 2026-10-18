// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { NMVideoPlayer } from '../../index';
import type { VideoPlaylistItem } from '../../types';
import { DrmError, Plugin } from '@nomercy-entertainment/nomercy-player-core';

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
	'key:error': { sessionId: string; error: Error };
	'unsupported': { reason: string };
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
 * On an item with `drm`, it creates MediaKeys, binds them to the video element
 * and answers each `encrypted` event with a license exchange. Failures emit
 * `key:error`. Without EME it emits `unsupported` and exits cleanly.
 */
export class DrmPlugin<T extends VideoPlaylistItem = VideoPlaylistItem> extends Plugin<NMVideoPlayer<T>, DrmOptions, DrmEvents> {
	static override readonly id: string = 'drm';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'EME DRM coordination — Widevine / FairPlay / PlayReady with HDCP signalling';

	private supported = false;
	private listening = false;

	/** Probes EME availability and wires the `current` listener to trigger the key-system handshake. */
	override use(): void {
		const nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined;
		if (!nav || typeof (nav as Navigator & { requestMediaKeySystemAccess?: unknown }).requestMediaKeySystemAccess !== 'function') {
			this.emit('unsupported', { reason: 'requestMediaKeySystemAccess not available in this environment' });
			return;
		}
		this.supported = true;

		this.on('item', (payload) => {
			const item = payload?.item as DrmItemHint | undefined;
			const drm = item?.drm;
			if (!drm)
				return;
			void this.tryHandshake(drm.keySystem ?? this.opts?.keySystem);
		});
	}

	/** Resets EME support state on teardown. */
	override dispose(): void {
		this.supported = false;
		this.listening = false;
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
		// the signer, and forward the signer's URL + headers to the kit fetch
		// helper. License servers expect POST with the challenge as the body.
		if (this.opts?.customSignRequest && typeof Request !== 'undefined') {
			const req = new Request(url, { method: 'POST', body: transformedChallenge as BodyInit });
			const signed = await this.opts.customSignRequest(req);
			const signedHeaders: Record<string, string> = {};
			signed.headers.forEach((value, name) => { signedHeaders[name] = value; });
			const buf = await this.fetch<ArrayBuffer>(signed.url, {
				responseType: 'arrayBuffer',
				method: 'POST',
				body: transformedChallenge as BodyInit,
				headers: signedHeaders,
			});
			return this.opts?.transformLicenseResponse
				? await this.opts.transformLicenseResponse(buf)
				: buf;
		}

		const buf = await this.fetch<ArrayBuffer>(url, {
			responseType: 'arrayBuffer',
			method: 'POST',
			body: transformedChallenge as BodyInit,
		});
		return this.opts?.transformLicenseResponse
			? await this.opts.transformLicenseResponse(buf)
			: buf;
	}

	/** Returns the backend's `mediaKeys` if EME is supported and bound. */
	mediaKeys(): MediaKeys | null {
		if (!this.supported)
			return null;
		const ve = this.player.videoElement;
		return ve?.mediaKeys ?? null;
	}

	private openSession(keys: MediaKeys, event: MediaEncryptedEvent): void {
		const session = keys.createSession();
		const fail = (err: unknown): void => {
			this.emit('key:error', { sessionId: session.sessionId, error: err instanceof Error ? err : new Error(String(err)) });
		};
		this.listen(session, 'message', (message) => {
			this.exchangeLicense(session, (message as MediaKeyMessageEvent).message).catch(fail);
		});
		session.generateRequest(event.initDataType, event.initData as BufferSource).catch(fail);
	}

	private async exchangeLicense(session: MediaKeySession, challenge: ArrayBuffer): Promise<void> {
		await session.update(await this.fetchLicense(challenge));
	}

	private async tryHandshake(keySystem: string | undefined): Promise<void> {
		if (!this.supported || !keySystem)
			return;
		const nav = navigator as Navigator & {
			requestMediaKeySystemAccess?: (keySystem: string, configs: MediaKeySystemConfiguration[]) => Promise<MediaKeySystemAccess>;
		};
		if (typeof nav.requestMediaKeySystemAccess !== 'function') {
			this.emit('unsupported', {
				reason: 'requestMediaKeySystemAccess unavailable at handshake time',
			});
			return;
		}
		try {
			const isFairPlay = keySystem.startsWith('com.apple.fps');
			const config: MediaKeySystemConfiguration = isFairPlay
				? {
						initDataTypes: ['skd'],
						audioCapabilities: [{ contentType: 'audio/mp4;codecs="mp4a.40.2"' }],
						videoCapabilities: [{ contentType: 'video/mp4;codecs="avc1.42E01E"' }],
					}
				: {
						initDataTypes: ['cenc'],
						audioCapabilities: [{ contentType: 'audio/mp4;codecs="mp4a.40.2"' }],
						videoCapabilities: [{ contentType: 'video/mp4;codecs="avc1.42E01E"' }],
					};
			const access = await nav.requestMediaKeySystemAccess(keySystem, [config]);
			const keys = await access.createMediaKeys();
			const video = this.player.videoElement;
			if (!video)
				return;
			await video.setMediaKeys(keys);
			if (!this.listening) {
				this.listening = true;
				this.listen(video, 'encrypted', (event) => { this.openSession(keys, event as MediaEncryptedEvent); });
			}
		}
		catch (err) {
			this.emit('key:error', {
				sessionId: 'init',
				error: err instanceof Error
					? err
					: new Error(String(err)),
			});
		}
	}
}

/** Plugin alias for the video {@link DrmPlugin}. Pass to `addPlugin(drmPlugin)`. */
export const drmPlugin = DrmPlugin;
