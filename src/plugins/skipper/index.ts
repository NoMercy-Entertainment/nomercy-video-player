import { Plugin } from '@nomercy-entertainment/nomercy-player-core';
import type { NMVideoPlayer } from '../../index';
import type { VideoPlaylistItem } from '../../types';

/** Identifies which segment type the skipper acts on. */
export type SkipperKind = 'intro' | 'recap' | 'credits';

/** Start and end timestamps (in seconds) of a skippable segment. */
export interface SkipperRange {
	start: number;
	end: number;
}

/** A single skippable segment resolved from the playlist item. */
export interface SkipperEntry {
	kind: SkipperKind;
	range: SkipperRange;
}

/** Options for {@link SkipperPlugin}. */
export interface SkipperOptions {
	/** Auto-skip these kinds without user intervention. */
	autoSkip?: ReadonlyArray<SkipperKind>;
	/** Show "Skip Intro" button N seconds after the range starts. Default 0. */
	revealAfterMs?: number;
}

/** Events emitted by {@link SkipperPlugin}. */
export interface SkipperEvents {
	'skipper:available': { kind: SkipperKind; range: SkipperRange };
	'skipper:hidden': { kind: SkipperKind };
	'skipper:skipped': { kind: SkipperKind; range: SkipperRange; auto: boolean };
}

const KINDS: ReadonlyArray<SkipperKind> = ['intro', 'recap', 'credits'];

/**
 * Skip-intro / skip-recap / skip-credits plugin.
 *
 * Reads `currentItem.skippers?: { intro?, recap?, credits? }` from the active
 * playlist item, emits `skipper:available` so UI can render the "Skip" button,
 * and exposes `skip(kind)` to jump the player past the range. Auto-skip kicks
 * in for any kinds listed in `options.autoSkip`.
 */
export class SkipperPlugin extends Plugin<NMVideoPlayer<VideoPlaylistItem>, SkipperOptions, SkipperEvents> {
	static override readonly id: string = 'skipper';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'Skip-intro / skip-recap / skip-credits with auto-skip + UI prompts';

	private active: SkipperKind | null = null;
	private _revealTimer: ReturnType<typeof setTimeout> | null = null;

	/** Attaches `current` and `time` listeners to track which skipper range is active. */
	override use(): void {
		this.on('current', () => {
			this.active = null;
			this._cancelRevealTimer();
		});

		this.on('time', (data) => {
			this.onTimeUpdate(data?.time ?? 0);
		});
	}

	private _cancelRevealTimer(): void {
		if (this._revealTimer !== null) {
			clearTimeout(this._revealTimer);
			this._revealTimer = null;
		}
	}

	/** Returns the current item's skipper list. */
	skippers(): SkipperEntry[] {
		const item = this.currentItem();
		const data = item?.skippers;
		if (!data) return [];
		const out: SkipperEntry[] = [];
		for (const kind of KINDS) {
			const range = data[kind];
			if (range && typeof range.start === 'number' && typeof range.end === 'number') {
				out.push({ kind, range: { start: range.start, end: range.end } });
			}
		}
		return out;
	}

	/** Jump the player past the named skipper range, or the active one if no kind given. */
	skip(kind?: SkipperKind): void {
		const target = kind ?? this.active;
		if (!target) return;
		const entry = this.skippers().find(e => e.kind === target);
		if (!entry) return;
		void this.player.currentTime(entry.range.end);
		this.emit('skipper:skipped', { kind: entry.kind, range: entry.range, auto: false });
		if (this.active === target) {
			this.active = null;
			this.emit('skipper:hidden', { kind: target });
		}
	}

	/** Fetch a JSON skip file and parse into entries. */
	async fetchSkipFile(url: string): Promise<SkipperEntry[]> {
		const raw = await this.fetch<string>(url);
		const body: unknown = JSON.parse(raw);
		const entries = Array.isArray(body) ? (body as Array<{ type: SkipperKind; start: number; end: number }>) : [];
		return entries
			.filter(entry => entry && KINDS.includes(entry.type) && typeof entry.start === 'number' && typeof entry.end === 'number')
			.map(entry => ({ kind: entry.type, range: { start: entry.start, end: entry.end } }));
	}

	private currentItem(): VideoPlaylistItem | undefined {
		try {
			return this.player.current();
		}
		catch {
			return undefined;
		}
	}

	private onTimeUpdate(time: number): void {
		const list = this.skippers();
		const matching = list.find(entry => time >= entry.range.start && time <= entry.range.end);

		if (!matching) {
			if (this.active) {
				const prev = this.active;
				this.active = null;
				this._cancelRevealTimer();
				this.emit('skipper:hidden', { kind: prev });
			}
			return;
		}

		if (this.active === matching.kind) return;

		this.active = matching.kind;
		const auto = (this.opts?.autoSkip ?? []).includes(matching.kind);

		if (auto) {
			void this.player.currentTime(matching.range.end);
			this.emit('skipper:skipped', { kind: matching.kind, range: matching.range, auto: true });
			this.active = null;
			return;
		}

		const delayMs = this.opts?.revealAfterMs ?? 0;
		if (delayMs > 0) {
			this._cancelRevealTimer();
			const kind = matching.kind;
			const range = matching.range;
			this._revealTimer = setTimeout(() => {
				this._revealTimer = null;
				if (this.active === kind) {
					this.emit('skipper:available', { kind, range });
				}
			}, delayMs);
		}
		else {
			this.emit('skipper:available', { kind: matching.kind, range: matching.range });
		}
	}
}

/** Plugin alias for {@link SkipperPlugin}. Pass to `addPlugin(skipperPlugin)`. */
export const skipperPlugin = SkipperPlugin;
