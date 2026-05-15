
import type { SubtitleStyle } from '@nomercy-entertainment/nomercy-player-core';

/**
 * Contract for anything that can persist and restore the user's subtitle
 * style preferences across sessions.
 *
 * The player class calls `load()` once during `setup()` and `save(style)`
 * whenever `player.subtitleStyle(patch)` is called. The default
 * implementation (`StorageBackedSubtitleStyleStore`) uses the kit's
 * `IStorage` adapter so the storage backend is swappable at setup time.
 */
export interface ISubtitleStyleStore {
	/**
	 * Load and return the persisted subtitle style, or `null` when no
	 * preference has been saved yet. The player applies the returned style
	 * as the initial `SubtitleStyle` state.
	 */
	load(): Promise<Partial<SubtitleStyle> | null>;

	/**
	 * Persist `style` so it survives page reloads. Called with the full
	 * merged style after each `player.subtitleStyle(patch)` call.
	 */
	save(style: SubtitleStyle): Promise<void>;

	/** Clear any persisted preference (e.g. "reset to defaults" action). */
	clear(): Promise<void>;
}
