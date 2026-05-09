import { afterEach, beforeEach } from 'vitest';
import { runIPlayerContract } from '@nomercy-entertainment/nomercy-player-core/testing';
import { NMVideoPlayer, nmplayer } from '../../index';

/**
 * Validates that `NMVideoPlayer` satisfies the `IPlayer` **behavior** contract.
 * Same suite `StubPlayer` and `NMMusicPlayer` run against themselves.
 */
beforeEach(() => {
	(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	const div = document.createElement('div');
	div.id = 'contract-video';
	document.body.appendChild(div);
});

afterEach(() => {
	document.body.innerHTML = '';
	(NMVideoPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
});

runIPlayerContract({
	create: () => nmplayer('contract-video').setup({}),
	label: 'NMVideoPlayer',
});
