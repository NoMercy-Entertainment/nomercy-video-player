import { describe, expect, it } from 'vitest';
import type { VideoEventMap } from '../types';

// Compile-time assertions: 'waiting' and 'fullscreen' must be present in
// VideoEventMap so DesktopUiPlugin can subscribe to them via Plugin.on().
type _HasWaiting = 'waiting' extends keyof VideoEventMap ? true : never;
type _HasFullscreen = 'fullscreen' extends keyof VideoEventMap ? true : never;
const _w: _HasWaiting = true as const;
const _f: _HasFullscreen = true as const;

describe('VideoEventMap shape', () => {
	it('keeps the `waiting` + `fullscreen` keys consumers depend on', () => {
		expect(_w).toBe(true);
		expect(_f).toBe(true);
	});
});
