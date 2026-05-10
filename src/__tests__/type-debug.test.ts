import type { VideoEventMap } from '../types';

// Compile-time assertions: 'waiting' and 'fullscreen' must be present in
// VideoEventMap so DesktopUiPlugin can subscribe to them via Plugin.on().
type _HasWaiting = 'waiting' extends keyof VideoEventMap ? true : never;
type _HasFullscreen = 'fullscreen' extends keyof VideoEventMap ? true : never;
const _w: _HasWaiting = true as const;
const _f: _HasFullscreen = true as const;
void _w;
void _f;

export {};
