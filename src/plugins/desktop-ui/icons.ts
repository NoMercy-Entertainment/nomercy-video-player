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

/** Render a Fluent icon to an inline <svg> string with BOTH variants stacked
 *  as `<path class="nm-icon-normal">` + `<path class="nm-icon-hover">`. CSS
 *  toggles which path is visible on `:hover` and on `.nm-btn-active` so every
 *  button inverts its fill state on hover. Honors the icon's declared `classes`
 *  for stroke-only glyphs (e.g. `chapterBack`/`chapterForward`). */
export function svgFromIcon(icon: IconEntry, size = 22): string {
    const isStroke = icon.classes?.includes('fill-none');
    const fillAttrs = isStroke
        ? 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
        : 'fill="currentColor"';
    return `<svg viewBox="0 0 24 24" ${fillAttrs} width="${size}" height="${size}" aria-hidden="true"><path class="nm-icon-normal" d="${icon.normal}"/><path class="nm-icon-hover" d="${icon.hover}"/></svg>`;
}

/** Convenience: render the icon at `name` from the official table. */
export function svgFromIconName(name: IconName, size = 22): string {
    return svgFromIcon(fluentIcons[name], size);
}

export { fluentIcons };
