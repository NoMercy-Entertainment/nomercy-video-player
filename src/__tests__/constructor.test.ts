/**
 * Real-behavior constructor tests for NMVideoPlayer. Mirrors the music
 * player's three-form factory contract. Same registry pattern, same error
 * codes, same `id` getter.
 *
 * The music + video registries are independent — same string id can be in use
 * by both libraries simultaneously without collision.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlayerError, ResourceError, StateError } from '@nomercy-entertainment/nomercy-player-core';
import { NMVideoPlayer, nmplayer } from '../index';

const catchError = (fn: () => unknown): PlayerError => {
	try { fn(); }
	catch (e) { return e as PlayerError; }
	throw new Error('catchError: fn did not throw');
};

describe('NMVideoPlayer constructor', () => {
	beforeEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	afterEach(() => {
		document.body.innerHTML = '';
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	describe('three-form signature', () => {
		it('string form: nmplayer("divId") mounts to the matching div', () => {
			const div = document.createElement('div');
			div.id = 'test-video-1';
			document.body.appendChild(div);
			const player = nmplayer('test-video-1');
			expect(player.id).toBe('test-video-1');
			expect(player.container).toBe(div);
		});

		it('no-arg form: nmplayer() returns first registered instance', () => {
			const div = document.createElement('div');
			div.id = 'first-video';
			document.body.appendChild(div);
			const first = nmplayer('first-video');
			expect(nmplayer()).toBe(first);
		});

		it('numeric form: nmplayer(0) returns first registered instance', () => {
			const a = document.createElement('div'); a.id = 'vidx-a'; document.body.appendChild(a);
			const b = document.createElement('div'); b.id = 'vidx-b'; document.body.appendChild(b);
			const first = nmplayer('vidx-a');
			nmplayer('vidx-b');
			expect(nmplayer(0)).toBe(first);
		});

		it('new NMVideoPlayer(stringId) mounts the same way', () => {
			const div = document.createElement('div');
			div.id = 'test-video-class';
			document.body.appendChild(div);
			const player = new NMVideoPlayer('test-video-class');
			expect(player.id).toBe('test-video-class');
			expect(player.container).toBe(div);
		});
	});

	describe('error codes', () => {
		it('no instances + no arg → core:player/no-element', () => {
			expect(() => nmplayer()).toThrow(/core:player\/no-element/);
		});

		it('numeric arg with no matching instance → core:player/not-found', () => {
			expect(() => nmplayer(999)).toThrow(/core:player\/not-found/);
		});

		it('string arg with no matching DOM element → core:player/element-missing', () => {
			expect(() => nmplayer('absent-div')).toThrow(/core:player\/element-missing/);
		});

		it('string arg pointing at a non-div element → core:player/element-not-div', () => {
			const span = document.createElement('span');
			span.id = 'span-not-div-video';
			document.body.appendChild(span);
			expect(() => nmplayer('span-not-div-video')).toThrow(/core:player\/element-not-div/);
		});

		it('non-string-non-number arg → core:player/invalid-id-type', () => {
			expect(() => nmplayer(true as any)).toThrow(/core:player\/invalid-id-type/);
		});
	});

	describe('error spec adherence', () => {
		it('thrown errors are real PlayerError subclasses, never raw Error', () => {
			const err = catchError(() => nmplayer());
			expect(err).toBeInstanceOf(PlayerError);
			expect(err).toBeInstanceOf(StateError);
		});

		it('no-element error carries spec fields: code, severity, scope', () => {
			const err = catchError(() => nmplayer());
			expect(err.code).toBe('core:player/no-element');
			expect(err.severity).toBe('error');
			expect(err.scope).toEqual({ kind: 'core' });
		});

		it('not-found error carries spec fields', () => {
			const err = catchError(() => nmplayer(999));
			expect(err.code).toBe('core:player/not-found');
			expect(err.severity).toBe('error');
			expect(err.scope).toEqual({ kind: 'core' });
		});

		it('element-missing error is a ResourceError (not StateError)', () => {
			const err = catchError(() => nmplayer('absent-div'));
			expect(err).toBeInstanceOf(ResourceError);
			expect(err.code).toBe('core:player/element-missing');
		});

		it('element-not-div error is a StateError', () => {
			const span = document.createElement('span');
			span.id = 'spec-span-not-div-video';
			document.body.appendChild(span);
			const err = catchError(() => nmplayer('spec-span-not-div-video'));
			expect(err).toBeInstanceOf(StateError);
			expect(err.code).toBe('core:player/element-not-div');
		});

		it('invalid-id-type error is a StateError', () => {
			const err = catchError(() => nmplayer(true as any));
			expect(err).toBeInstanceOf(StateError);
			expect(err.code).toBe('core:player/invalid-id-type');
		});
	});

	describe('registry pattern', () => {
		it('idempotent: calling nmplayer("x") twice returns the SAME instance', () => {
			const div = document.createElement('div');
			div.id = 'idempotent-v';
			document.body.appendChild(div);

			const first = nmplayer('idempotent-v');
			const second = nmplayer('idempotent-v');
			expect(first).toBe(second);
		});

		it('different ids produce different instances', () => {
			const a = document.createElement('div'); a.id = 'va'; document.body.appendChild(a);
			const b = document.createElement('div'); b.id = 'vb'; document.body.appendChild(b);

			const first = nmplayer('va');
			const second = nmplayer('vb');
			expect(first).not.toBe(second);
		});

		it('registry survives constructor return-override (instanceof still works)', () => {
			const div = document.createElement('div');
			div.id = 'video-instanceof-check';
			document.body.appendChild(div);

			const first = nmplayer('video-instanceof-check');
			const second = new NMVideoPlayer('video-instanceof-check');
			expect(second).toBe(first);
			expect(second).toBeInstanceOf(NMVideoPlayer);
		});
	});

	describe('id getter', () => {
		it('reads back the constructor id and mirrors playerId', () => {
			const div = document.createElement('div'); div.id = 'video-getter'; document.body.appendChild(div);

			const player = nmplayer('video-getter');
			expect(player.id).toBe('video-getter');
			expect(player.playerId).toBe('video-getter');
			expect(player.id).toBe(player.playerId);
		});
	});
});
