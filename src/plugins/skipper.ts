import { Plugin } from '@nomercy-entertainment/nomercy-player-core';
import type { NMVideoPlayer } from '../index';
import type { VideoPlaylistItem } from '../types';

export type SkipperKind = 'intro' | 'recap' | 'credits';

export interface SkipperRange {
	start: number;
	end: number;
}

export interface SkipperEntry {
	kind: SkipperKind;
	range: SkipperRange;
}

export interface SkipperOptions {
	/** Auto-skip these kinds without user intervention. */
	autoSkip?: ReadonlyArray<SkipperKind>;
	/** Show "Skip Intro" button N seconds after the range starts. Default 0. */
	revealAfterMs?: number;
}

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
export class SkipperPlugin extends Plugin<NMVideoPlayer<any>, SkipperOptions, SkipperEvents> {
	static override readonly id: string = 'skipper';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'Skip-intro / skip-recap / skip-credits with auto-skip + UI prompts';

	private active: SkipperKind | null = null;

	override use(): void {
		this.on('current' as any, () => {
			this.active = null;
		});

		this.on('time' as any, (data: { time: number }) => {
			this.onTimeUpdate(data?.time ?? 0);
		});
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
		const parsed = JSON.parse(raw) as Array<{ type: SkipperKind; start: number; end: number }>;
		return parsed
			.filter(p => p && KINDS.includes(p.type) && typeof p.start === 'number' && typeof p.end === 'number')
			.map(p => ({ kind: p.type, range: { start: p.start, end: p.end } }));
	}

	private currentItem(): VideoPlaylistItem | undefined {
		try {
			return this.player.current() as VideoPlaylistItem | undefined;
		}
		catch {
			return undefined;
		}
	}

	private onTimeUpdate(time: number): void {
		const list = this.skippers();
		const matching = list.find(e => time >= e.range.start && time <= e.range.end);

		if (!matching) {
			if (this.active) {
				const prev = this.active;
				this.active = null;
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

		this.emit('skipper:available', { kind: matching.kind, range: matching.range });
	}
}

export const skipperPlugin = SkipperPlugin;
