/**
 * Render official Fluent UI icons (from `./buttons.ts`) into SVG markup.
 *
 * Why this exists: the v1 player drew each icon as two stacked <path>s
 * (`normal` + `hover`) and toggled them via CSS `group-hover` classes.
 * The v2 testbed UI uses a flat hover style (color shift) so a single
 * path is enough — but we still pull the path data verbatim from the
 * official fluentIcons table so nothing diverges from the canonical
 * design system.
 */

import { fluentIcons, type Icon } from './buttons';

export type IconName = keyof typeof fluentIcons;
export type IconEntry = Icon[string];

/** Render a Fluent icon to an inline <svg> string. Honors the icon's
 *  declared `classes` for the few entries that ship as stroke-only
 *  glyphs (e.g. `chapterBack`/`chapterForward` which are open chevrons,
 *  not filled shapes). */
export function svgFromIcon(icon: IconEntry, size = 22): string {
    const isStroke = icon.classes?.includes('fill-none');
    const fillAttrs = isStroke
        ? 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
        : 'fill="currentColor"';
    return `<svg viewBox="0 0 24 24" ${fillAttrs} width="${size}" height="${size}" aria-hidden="true"><path d="${icon.normal}"/></svg>`;
}

/** Convenience: render the icon at `name` from the official table. */
export function svgFromIconName(name: IconName, size = 22): string {
    return svgFromIcon(fluentIcons[name], size);
}

export { fluentIcons };
