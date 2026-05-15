
import type { IStorage, SubtitleStyle } from '@nomercy-entertainment/nomercy-player-core';

import type { ISubtitleStyleStore } from './ISubtitleStyleStore';

const STORAGE_KEY = 'subtitle-style';

/**
 * Default subtitle style store. Persists the user's subtitle preferences
 * via the kit's `IStorage` adapter (defaults to `LocalStorageBackend`).
 *
 * The storage key is `'subtitle-style'`. When the player is set up with a
 * namespaced storage backend (e.g. `new LocalStorageBackend('player:')`),
 * the effective key becomes `'player:subtitle-style'` automatically.
 */
export class StorageBackedSubtitleStyleStore implements ISubtitleStyleStore {
	private readonly _storage: IStorage;

	constructor(storage: IStorage) {
		this._storage = storage;
	}

	async load(): Promise<Partial<SubtitleStyle> | null> {
		const raw = await this._storage.getJSON<Partial<SubtitleStyle>>(STORAGE_KEY);
		return raw ?? null;
	}

	async save(style: SubtitleStyle): Promise<void> {
		await this._storage.setJSON(STORAGE_KEY, style);
	}

	async clear(): Promise<void> {
		await this._storage.remove(STORAGE_KEY);
	}
}
