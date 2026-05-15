import { Plugin } from '@nomercy-entertainment/nomercy-player-core';

import type { NMVideoPlayer } from '../../index';
import type { VideoPlaylistItem } from '../../types';

/** Options for {@link AutoAdvancePlugin}. */
export interface AutoAdvanceOptions {
    /** Master toggle. Default `true`. */
    enabled?: boolean;
    /**
     * Seconds before natural end at which the player should begin loading the
     * next item in the background. `0` disables preload. Default `0`.
     */
    preloadLeadSeconds?: number;
}

/**
 * Auto-advance plugin for `NMVideoPlayer`.
 *
 * Listens to the player's `ended` event and calls `next()` so the queue
 * advances automatically when each item finishes. Don't register this plugin
 * when an external orchestrator (Cast sync, websocket) drives `next()` —
 * duplicate advances would result.
 *
 * The `enabled` option is a runtime toggle: setting it to `false` suspends
 * advance without unregistering the plugin, so it can be re-enabled later.
 */
export class AutoAdvancePlugin extends Plugin<NMVideoPlayer<VideoPlaylistItem>, AutoAdvanceOptions> {
    static override readonly id: string = 'auto-advance';
    static override readonly version: string = '2.0.0';
    static override readonly description: string = 'Advance to the next queue item on natural end';
    static override readonly moduleUrl: string = import.meta.url;

    override use(): void {
        this.on('ended', () => {
            if (this.opts?.enabled === false) return;
            void this.onEnded();
        });
    }

    /** Force-advance to the next item immediately, regardless of `ended` state. */
    advance(): Promise<void> {
        return this.player.next({ source: 'auto-advance' });
    }

    private async onEnded(): Promise<void> {
        try {
            await this.player.next({ source: 'auto-advance' });
        }
        catch (err) {
            this.logger.warn('next() failed on ended', err);
        }
    }
}

/** Plugin alias for {@link AutoAdvancePlugin}. Pass to `addPlugin(autoAdvancePlugin)`. */
export const autoAdvancePlugin = AutoAdvancePlugin;
