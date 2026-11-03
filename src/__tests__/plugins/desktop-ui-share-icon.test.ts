import { describe, expect, it } from 'vitest';

import { fluentIcons } from '../../plugins/desktop-ui/data/buttons';

describe('desktop-ui share icon', () => {
	it('closes the hover path at its starting point', () => {
		expect(fluentIcons.share.hover).toMatch(/L14\.107 6\.7887C14\.0386 6\.5374 14\.0021 6\.2729 14\.0021 6\.00003C14\.0021 4\.34424 15\.3444 3\.00195 17\.0002 3\.00195Z$/);
	});
});
