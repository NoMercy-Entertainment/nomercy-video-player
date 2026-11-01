import type { BasePlaylistItem } from '@nomercy-entertainment/nomercy-player-core';
import type { NextItemWarmupDeps } from '../player/next-item-warmup';
import { describe, expect, it, vi } from 'vitest';
import { NextItemWarmup } from '../player/next-item-warmup';

const NEXT: BasePlaylistItem = { id: 'ep2', url: '/ep2/master.m3u8' };

function harness(overrides: Partial<NextItemWarmupDeps> = {}) {
	const warm = vi.fn(async () => {});
	const cancelWarm = vi.fn();
	const deps: NextItemWarmupDeps = {
		leadSeconds: () => 60,
		segments: () => 3,
		next: () => NEXT,
		resolveUrl: async item => `https://media.example.test${item.url}`,
		backend: () => ({ warm, cancelWarm }),
		bufferedAhead: () => 30,
		environment: () => ({ online: true, saveData: false }),
		...overrides,
	};
	return { warmup: new NextItemWarmup(deps), warm, cancelWarm };
}

async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe('NextItemWarmup', () => {
	it('stays idle until the remaining time reaches the lead', async () => {
		const { warmup, warm } = harness();
		warmup.onTime(100, 1500);
		await flush();
		expect(warm).not.toHaveBeenCalled();
	});

	it('warms the next item once at the threshold and not again on later ticks', async () => {
		const { warmup, warm } = harness();
		warmup.onTime(1440, 1500);
		warmup.onTime(1441, 1500);
		warmup.onTime(1442, 1500);
		await flush();
		expect(warm).toHaveBeenCalledTimes(1);
		expect(warm).toHaveBeenCalledWith('https://media.example.test/ep2/master.m3u8', { segments: 3 });
	});

	it('does nothing when the queue has no next item', async () => {
		const { warmup, warm } = harness({ next: () => undefined });
		warmup.onTime(1450, 1500);
		await flush();
		expect(warm).not.toHaveBeenCalled();
	});

	it('does nothing when the lead is 0 (disabled)', async () => {
		const { warmup, warm } = harness({ leadSeconds: () => 0 });
		warmup.onTime(1499, 1500);
		await flush();
		expect(warm).not.toHaveBeenCalled();
	});

	it('cancels when the viewer seeks back out of the window, and warms again on re-entry', async () => {
		const { warmup, warm, cancelWarm } = harness();
		warmup.onTime(1440, 1500);
		await flush();
		warmup.onTime(600, 1500);
		expect(cancelWarm).toHaveBeenCalledTimes(1);
		warmup.onTime(1445, 1500);
		await flush();
		expect(warm).toHaveBeenCalledTimes(2);
	});

	it('cancels when the current item changes to something other than the warmed item', async () => {
		const { warmup, cancelWarm } = harness();
		warmup.onTime(1440, 1500);
		await flush();
		warmup.onItemChange('ep0');
		expect(cancelWarm).toHaveBeenCalledTimes(1);
	});

	it('keeps the warm data when the item that becomes current is the warmed one', async () => {
		const { warmup, cancelWarm } = harness();
		warmup.onTime(1440, 1500);
		await flush();
		warmup.onItemChange('ep2');
		expect(cancelWarm).not.toHaveBeenCalled();
	});

	it('cancels on dispose', async () => {
		const { warmup, cancelWarm } = harness();
		warmup.onTime(1440, 1500);
		await flush();
		warmup.dispose();
		expect(cancelWarm).toHaveBeenCalledTimes(1);
	});

	it('skips while offline', async () => {
		const { warmup, warm } = harness({ environment: () => ({ online: false, saveData: false }) });
		warmup.onTime(1450, 1500);
		await flush();
		expect(warm).not.toHaveBeenCalled();
	});

	it('skips on data saver', async () => {
		const { warmup, warm } = harness({ environment: () => ({ online: true, saveData: true }) });
		warmup.onTime(1450, 1500);
		await flush();
		expect(warm).not.toHaveBeenCalled();
	});

	it('skips while the current item has little buffer, then warms once the buffer recovers', async () => {
		let ahead = 3;
		const { warmup, warm } = harness({ bufferedAhead: () => ahead });
		warmup.onTime(1450, 1500);
		await flush();
		expect(warm).not.toHaveBeenCalled();
		ahead = 25;
		warmup.onTime(1451, 1500);
		await flush();
		expect(warm).toHaveBeenCalledTimes(1);
	});

	it('warms close to the end when the whole remainder is buffered', async () => {
		const { warmup, warm } = harness({ leadSeconds: () => 10, bufferedAhead: () => 7.5 });
		warmup.onTime(1492.5, 1500);
		await flush();
		expect(warm).toHaveBeenCalledTimes(1);
	});

	it('does not warm when the backend has no warm support', async () => {
		const resolveUrl = vi.fn(async () => 'https://media.example.test/ep2/master.m3u8');
		const { warmup } = harness({ backend: () => ({}), resolveUrl });
		expect(() => warmup.onTime(1450, 1500)).not.toThrow();
		await flush();
		expect(resolveUrl).not.toHaveBeenCalled();
	});

	it('drops a resolve that finishes after the warm was canceled', async () => {
		let release: (url: string) => void = () => {};
		const { warmup, warm } = harness({ resolveUrl: () => new Promise<string>((resolve) => { release = resolve; }) });
		warmup.onTime(1450, 1500);
		warmup.dispose();
		release('https://media.example.test/ep2/master.m3u8');
		await flush();
		expect(warm).not.toHaveBeenCalled();
	});
});
