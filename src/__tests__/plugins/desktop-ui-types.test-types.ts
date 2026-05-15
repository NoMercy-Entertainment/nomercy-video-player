/**
 * Type-level proof that `this.on(DesktopUiPlugin, 'layout:breakpoint', ...)` is
 * fully typed — payload is `LayoutBreakpointPayload`, not `any` or `unknown`.
 *
 * Pure tsc check file — no runtime assertions.
 * Run: cd packages/nomercy-video-player-v2 && npx tsc --noEmit
 *
 * Lines with `@ts-expect-error` are intentional: the type system correctly
 * rejects the expression. If the error stops firing, the guard is broken.
 */

import type { BaseEventMap, IPlayer } from '@nomercy-entertainment/nomercy-player-core';
import { Plugin } from '@nomercy-entertainment/nomercy-player-core';
import { DesktopUiPlugin } from '../../plugins/desktop-ui';
import type { LayoutBreakpointPayload } from '../../plugins/desktop-ui';

// ── Fixture consumer plugin ────────────────────────────────────────────────────

class ConsumerPlugin extends Plugin<IPlayer<BaseEventMap>> {
    static override readonly id = 'consumer-type-test';
    static override readonly description = 'type-level proof consumer';

    probeCorrect(): void {
        // Correctly typed — payload is LayoutBreakpointPayload
        this.on(DesktopUiPlugin, 'layout:breakpoint', (data) => {
            // These fields MUST exist on LayoutBreakpointPayload
            const _from: string = data.from;
            const _to: string = data.to;
            const _visible: ReadonlyArray<string> = data.visibleButtons;
            const _hidden: ReadonlyArray<string> = data.hiddenButtons;
            void _from;
            void _to;
            void _visible;
            void _hidden;
        });
    }

    probeMisspelledEvent(): void {
        // 'layout:breakpoit' is misspelled — TS must reject it.
        // @ts-expect-error — 'layout:breakpoit' is not a key of DesktopUiEvents
        this.on(DesktopUiPlugin, 'layout:breakpoit', (_data: unknown) => {});
    }

    probeWrongPayloadShape(): void {
        // Accessing a field that does not exist on LayoutBreakpointPayload
        this.on(DesktopUiPlugin, 'layout:breakpoint', (data) => {
            // @ts-expect-error — 'nonExistentField' does not exist on LayoutBreakpointPayload
            void data.nonExistentField;
        });
    }
}

// ── Structural proof: LayoutBreakpointPayload has the required shape ───────────

declare const _payload: LayoutBreakpointPayload;

// These must compile — they exist on the type.
const _fromStr: string = _payload.from;
const _toStr: string = _payload.to;
const _visArr: ReadonlyArray<string> = _payload.visibleButtons;
const _hidArr: ReadonlyArray<string> = _payload.hiddenButtons;

// Incorrect shape must NOT be assignable to LayoutBreakpointPayload.
declare const _badPayload: { from: number };
// @ts-expect-error — { from: number } is not assignable to LayoutBreakpointPayload
const _payloadProof: LayoutBreakpointPayload = _badPayload;

// ── Silence unused-variable noise ─────────────────────────────────────────────

void (ConsumerPlugin as unknown);
void _fromStr;
void _toStr;
void _visArr;
void _hidArr;
void _payloadProof;
