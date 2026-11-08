// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/** The UI's sizes assume border-box, so the plugin sets it inside its own tree instead of relying on the host page. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/plugins/desktop-ui/styles.css'), 'utf8');

describe('desktop-ui box-sizing', () => {
	it('sets border-box on every element inside the player root', () => {
		const rootBlock = css.slice(css.indexOf('.nomercyplayer {'));

		expect(rootBlock).toMatch(/\*\s*,\s*\*::before\s*,\s*\*::after\s*\{\s*box-sizing:\s*border-box;?\s*\}/);
	});
});
