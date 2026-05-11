

import { Plugin } from '@nomercy-entertainment/nomercy-player-core';
import type { IRealtimeChannel } from '@nomercy-entertainment/nomercy-player-core';
import type { NMVideoPlayer } from '../index';

/** Options for the video {@link LiveTranscodingPlugin}. */
export interface LiveTranscodingOptions {
	/** Server endpoint that owns the transcoding job lifecycle (typically WebSocket). */
	controlUrl?: string;

	/** Alias of `controlUrl`. Either one works. */
	wsUrl?: string;

	/** Optional polling fallback for environments without WS. */
	pollIntervalMs?: number;

	/** How many seconds of buffer must exist beyond `currentTime` before resuming. */
	resumeAheadSeconds?: number;

	/** When seeking, max seconds we'll wait for the transcoder to reach the target. */
	seekTimeoutMs?: number;

	/** Quality / bitrate preference hint sent to the encoder. */
	preferredHeight?: number;
}

/** Events emitted by the video {@link LiveTranscodingPlugin}. */
export interface LiveTranscodingEvents {
	'job:started': { jobId: string; sourceUrl: string };
	'job:progress': { jobId: string; transcodedSeconds: number; totalSeconds?: number; variantsReady: string[] };
	'job:variant-ready': { jobId: string; variant: string; bandwidth: number };
	'job:ready-to-play': { jobId: string };
	'job:error': { jobId: string; error: Error };
	'job:complete': { jobId: string };
	'backpressure:apply': { reason: 'buffer-full' | 'encoder-stall' };
	'backpressure:release': void;
}

interface ServerStatusMessage {
	type?: string;
	jobId?: string;
	transcodedSeconds?: number;
	target?: number;
	[key: string]: unknown;
}

/**
 * Live-transcoding orchestration plugin for video. Coordinates the player
 * with a server that transcodes video on-demand, segment by segment.
 *
 * Real wiring on the gate side, mocked on the actual transcode server. The
 * plugin opens a WebSocket via `Plugin.websocket()` (auto-closes on dispose)
 * and gates `beforeLoad` / `beforeSeek` until the server reports the
 * requested timestamp is encoded. Without a server URL the plugin is inert.
 */
export class LiveTranscodingPlugin extends Plugin<NMVideoPlayer<any>, LiveTranscodingOptions, LiveTranscodingEvents> {
	static override readonly id: string = 'live-transcoding';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'Server-coordinated live video transcoding — variant gating + loader backpressure';

	private channel: IRealtimeChannel | undefined;
	private _transcodedTo = 0;
	private currentJobId: string | undefined;

	/** Opens the control WebSocket and wires `beforeLoad` / `beforeSeek` transcoder-ready gates. */
	override use(): void {
		const url = this.opts?.wsUrl ?? this.opts?.controlUrl;
		if (!url) return;

		this.channel = this.websocket(url);
		this.channel.on('message', (data: unknown) => {
			this.onServerMessage(data);
		});
		this.channel.on('error', (err: unknown) => {
			this.emit('job:error', {
				jobId: this.currentJobId ?? '',
				error: err instanceof Error ? err : new Error(String(err)),
			});
		});

		this.on('beforeLoad', async (event) => {
			const item = event?.data?.item;
			if (!item) return;
			this._transcodedTo = 0;
			this.currentJobId = String((item as { id?: unknown }).id ?? '');
			// Gate is best-effort — when the server is offline we don't block
			// the player; producers can wire stricter gating downstream.
			await this.waitFor(0);
		});

		this.on('beforeSeek', async (event) => {
			const target = event?.data?.time ?? 0;
			if (target <= this._transcodedTo) return;
			await this.waitFor(target);
		});
	}

	/** Drops the WebSocket channel reference and resets transcoding progress state. */
	override dispose(): void {
		this.channel = undefined;
		this._transcodedTo = 0;
		this.currentJobId = undefined;
	}

	/** Returns the current transcoder write head in seconds. */
	transcodedTo(): number {
		return this._transcodedTo;
	}

	private onServerMessage(raw: unknown): void {
		let msg: ServerStatusMessage | undefined;
		if (typeof raw === 'string') {
			try {
				const parsed: unknown = JSON.parse(raw);
				if (parsed !== null && typeof parsed === 'object') msg = parsed as ServerStatusMessage;
			}
			catch { return; }
		}
		else if (raw !== null && typeof raw === 'object') {
			msg = raw as ServerStatusMessage;
		}
		if (!msg) return;

		switch (msg.type) {
			case 'started':
				this.currentJobId = msg.jobId ?? this.currentJobId;
				this.emit('job:started', { jobId: this.currentJobId ?? '', sourceUrl: String(msg['sourceUrl'] ?? '') });
				break;
			case 'progress':
				if (typeof msg.transcodedSeconds === 'number') {
					this._transcodedTo = msg.transcodedSeconds;
					this.emit('job:progress', {
						jobId: msg.jobId ?? this.currentJobId ?? '',
						transcodedSeconds: msg.transcodedSeconds,
						totalSeconds: msg['totalSeconds'] as number | undefined,
						variantsReady: (msg['variantsReady'] as string[]) ?? [],
					});
				}
				break;
			case 'ready-to-play':
				this.emit('job:ready-to-play', { jobId: msg.jobId ?? this.currentJobId ?? '' });
				break;
			case 'complete':
				this.emit('job:complete', { jobId: msg.jobId ?? this.currentJobId ?? '' });
				break;
			default:
				break;
		}
	}

	private async waitFor(target: number): Promise<void> {
		if (target <= this._transcodedTo) return;
		const timeoutMs = this.opts?.seekTimeoutMs ?? 10_000;
		const start = Date.now();
		// Poll our own transcodedTo state — populated by onServerMessage. Bail
		// when the timeout is reached to avoid hanging the player.
		await new Promise<void>((resolve) => {
			const tick = () => {
				if (target <= this._transcodedTo) return resolve();
				if (Date.now() - start >= timeoutMs) return resolve();
				this.timeout(tick, 100);
			};
			tick();
		});
	}
}

/** Plugin alias for the video {@link LiveTranscodingPlugin}. Pass to `addPlugin(liveTranscodingPlugin)`. */
export const liveTranscodingPlugin = LiveTranscodingPlugin;
