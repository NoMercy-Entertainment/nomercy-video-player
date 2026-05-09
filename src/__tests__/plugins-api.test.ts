/**
 * Plugin-registration API tests for NMVideoPlayer. Mirrors music.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Plugin } from '@nomercy-entertainment/nomercy-player-core';
import { NMVideoPlayer } from '../index';

class HelloPlugin extends Plugin {
	static override readonly id = 'hello';
	static override readonly version = '0.1.0';
	static override readonly translations = { en: { 'plugin.hello.greet': 'hi' } };

	used = false;
	disposed = false;

	override use(): void {
		this.used = true;
	}

	override dispose(): void {
		this.disposed = true;
	}
}

class NeedsHelloPlugin extends Plugin {
	static override readonly id = 'needs-hello';
	static override readonly requires = [HelloPlugin];
}

describe('NMVideoPlayer — plugin registration', () => {
	beforeEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	const setup = (): NMVideoPlayer => new NMVideoPlayer('test').setup({});

	it('addPlugin returns this for chaining and instantiates+uses the plugin', async () => {
		const p = setup();
		expect(p.addPlugin(HelloPlugin)).toBe(p);
		await p.ready();
		expect(p.getPlugin(HelloPlugin)?.used).toBe(true);
	});

	it('emits plugin:installed with id and version', async () => {
		const p = setup();
		let payload: { id: string; version: string } | undefined;
		p.on('plugin:installed' as any, (data: any) => { payload = data; });
		p.addPlugin(HelloPlugin);
		await p.ready();
		expect(payload?.id).toBe('hello');
	});

	it('static translations are merged on register and stripped on dispose', async () => {
		const p = setup();
		p.addPlugin(HelloPlugin);
		await p.ready();
		expect(p.t('plugin.hello.greet')).toBe('hi');
		p.removePlugin(HelloPlugin);
		expect(p.t('plugin.hello.greet')).toBe('plugin.hello.greet');
	});

	it('throws core:plugin/duplicate-id on second add', () => {
		const p = setup();
		p.addPlugin(HelloPlugin);
		expect(() => p.addPlugin(HelloPlugin)).toThrow(/core:plugin\/duplicate-id/);
	});

	it('throws core:plugin/missing-dep when a required plugin is absent', () => {
		const p = setup();
		expect(() => p.addPlugin(NeedsHelloPlugin)).toThrow(/core:plugin\/missing-dep/);
	});

	it('removePlugin disposes the instance and emits plugin:disposed', async () => {
		const p = setup();
		p.addPlugin(HelloPlugin);
		await p.ready();
		const instance = p.getPlugin(HelloPlugin);
		let disposedId: string | undefined;
		p.on('plugin:disposed' as any, (data: any) => { disposedId = data.id; });
		p.removePlugin(HelloPlugin);
		expect(instance?.disposed).toBe(true);
		expect(disposedId).toBe('hello');
	});

	it('plugins() lists every registered plugin', async () => {
		const p = setup();
		p.addPlugin(HelloPlugin);
		await p.ready();
		expect(p.plugins().length).toBe(1);
	});
});
