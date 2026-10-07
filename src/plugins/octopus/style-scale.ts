// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

const STYLES_SECTION = /^\[V4\+? Styles\]$/iu;
const ANY_SECTION = /^\[.+\]$/u;

/**
 * Multiply the `Fontsize` of every style in an ASS/SSA script by `scale`.
 *
 * The shipped libass worker exposes no font-scale call, so the size the viewer
 * picked is baked into the style table the renderer is handed. Inline `\fs`
 * overrides inside dialogue are left as the author wrote them.
 */
export function scaleAssFontSize(content: string, scale: number): string {
	if (scale === 1)
		return content;

	let inStyles = false;
	let sizeColumn = -1;

	return content.split('\n').map((line) => {
		const trimmed = line.trim();
		if (ANY_SECTION.test(trimmed)) {
			inStyles = STYLES_SECTION.test(trimmed);
			sizeColumn = -1;
			return line;
		}
		if (!inStyles)
			return line;

		if (/^Format:/iu.test(trimmed)) {
			sizeColumn = trimmed.slice('Format:'.length).split(',').findIndex(name => name.trim().toLowerCase() === 'fontsize');
			return line;
		}
		if (sizeColumn < 0 || !/^Style:/iu.test(trimmed))
			return line;

		const prefixLength = line.indexOf(':') + 1;
		const fields = line.slice(prefixLength).split(',');
		const size = Number.parseFloat(fields[sizeColumn] ?? '');
		if (Number.isNaN(size))
			return line;
		const indent = /^\s*/u.exec(fields[sizeColumn]!)![0];
		fields[sizeColumn] = `${indent}${Math.round(size * scale * 100) / 100}`;
		return `${line.slice(0, prefixLength)}${fields.join(',')}`;
	}).join('\n');
}
