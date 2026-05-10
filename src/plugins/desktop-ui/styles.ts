/**
 * Stylesheet for the desktop UI overlay plugin.
 *
 * Mirrors the v1 plugin DOM tree class-by-class — `bottom-bar`,
 * `bottom-bar-shadow`, `top-row`, `bottom-row`, `slider-bar`,
 * `slider-buffer`, `slider-hover`, `slider-progress`, `chapter-progress`,
 * `chapter-marker` + `chapter-marker-bg` + `chapter-marker-hover` +
 * `chapter-marker-progress`, `slider-nipple`, `slider-pop`, `volume-container`,
 * `current-time`, `divider`, `remaining-time`, `menu-frame`, `main-menu`,
 * `sub-menu`, `language-button`. v1 ships these as Tailwind classes; we
 * translate to vanilla CSS so the testbed doesn't need Tailwind.
 */

export const STYLE_ELEMENT_ID = 'nmplayer-desktop-ui-styles';

export const desktopUiCss = `
.nmplayer-desktop-ui-overlay {
    position: absolute; inset: 0; z-index: 20;
    font-family: system-ui, sans-serif; color: #fff;
    pointer-events: none;
}

/* ── Top bar ──────────────────────────────────────────────────────── */
.nm-top-bar {
    position: absolute; top: 0; left: 0; right: 0;
    padding: 16px 16px 48px 16px;
    display: flex; align-items: flex-start; justify-content: space-between;
    background: linear-gradient(to bottom, rgba(0,0,0,0.85), rgba(0,0,0,0.40), rgba(0,0,0,0));
    pointer-events: none;
    transition: opacity 0.25s ease, transform 0.25s ease;
}
.nm-top-bar-left { display: flex; align-items: center; pointer-events: auto; }
.nm-top-bar-right { display: flex; flex-direction: column; align-items: flex-end; text-align: right; max-width: 60%; }
.nm-show-info { font-size: 0.78rem; font-weight: 600; color: rgba(255,255,255,0.75); margin-bottom: 2px; }
.nm-title { font-size: 1.05rem; font-weight: 700; text-shadow: 0 1px 4px rgba(0,0,0,0.8); }
.nm-back-btn {
    pointer-events: auto; background: rgba(0,0,0,0.35); border: none; color: #fff;
    width: 40px; height: 40px; border-radius: 50%; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.18s ease;
    margin-right: 8px;
}
.nm-back-btn:hover { background: rgba(255,255,255,0.15); }
.nm-back-btn[hidden] { display: none !important; }

/* ── Center play button ──────────────────────────────────────────── */
.nm-center { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.nm-center-btn {
    pointer-events: auto; background: rgba(0,0,0,0.45); border: none; color: #fff;
    width: 80px; height: 80px; border-radius: 50%; cursor: pointer;
    display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px);
    transition: background 0.18s ease, transform 0.18s ease, opacity 0.18s ease;
}
.nm-center-btn:hover { background: rgba(255,255,255,0.15); transform: scale(1.08); }
.nm-center.nm-playing .nm-center-btn { opacity: 0; }
.active:hover .nm-center-btn { opacity: 1; }
.nm-spinner { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; pointer-events: none; }
.nm-spinner svg { width: 56px; height: 56px; animation: nm-spin 0.9s linear infinite; }
.nomercyplayer.buffering .nm-spinner { display: flex; }
@keyframes nm-spin { to { transform: rotate(360deg); } }

/* ── Bottom bar (v1: bottom-bar > bottom-bar-shadow + top-row + bottom-row) ── */
.bottom-bar {
    position: absolute; bottom: 0; left: 0; right: 0;
    display: flex; flex-direction: column;
    gap: 8px;
    align-items: center;
    margin-top: auto;
    width: 100%;
    z-index: 10;
    padding-bottom: 8px;
    pointer-events: none;
    transition: opacity 0.25s ease, transform 0.25s ease;
}
.bottom-bar > * { pointer-events: auto; }
.bottom-bar-shadow {
    position: absolute; left: 0; right: 0; bottom: 0;
    height: calc(100% + 24px);
    pointer-events: none;
    background: linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.40), rgba(0,0,0,0));
    z-index: 0;
}
.top-row {
    position: relative;
    display: flex; gap: 4px; align-items: center;
    height: 8px;
    padding: 0 8px;
    width: 100%;
    margin-top: 16px;
    z-index: 1;
}
.bottom-row {
    position: relative;
    display: flex; align-items: center; gap: 2px;
    height: 40px;
    padding: 4px 16px;
    width: 100%;
    z-index: 1;
}

/* ── slider-bar tree (v1) ────────────────────────────────────────── */
.slider-bar {
    position: relative;
    display: flex;
    height: 8px;
    width: 100%;
    background: rgba(255,255,255,0.20);
    border-radius: 9999px;
    pointer-events: auto;
    cursor: pointer;
}
.slider-bar.has-chapters { background: transparent; }
.slider-buffer {
    position: absolute; left: 0; top: 0;
    height: 100%; width: 0;
    background: rgba(255,255,255,0.40);
    border-radius: 9999px;
    overflow: hidden;
    pointer-events: none;
    z-index: 1;
}
.slider-hover {
    position: absolute; left: 0; top: 0;
    height: 100%; width: 0;
    background: rgba(255,255,255,0.30);
    border-radius: 9999px;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
}
.slider-progress {
    position: absolute; left: 0; top: 0;
    height: 100%; width: 0;
    background: #fff;
    border-radius: 9999px;
    overflow: hidden;
    pointer-events: none;
    z-index: 10;
}
.slider-bar.has-chapters .slider-progress { display: none; }
.slider-bar.has-chapters .slider-hover { display: none; }
.slider-bar.has-chapters .slider-buffer { display: none; }
.chapter-bar {
    position: absolute; inset: 0;
    height: 100%;
    display: flex;
    border-radius: 9999px;
    overflow: visible;
    pointer-events: none;
    z-index: 5;
}
.chapter-marker {
    position: absolute; top: 0;
    height: 100%;
    min-width: 2px;
    overflow: hidden;
    border-radius: 2px;
}
.chapter-marker-bg {
    position: absolute; left: 0;
    width: 100%; height: 100%;
    background: rgba(255,255,255,0.20);
    border-radius: 2px;
    z-index: 0;
}
.chapter-marker-buffer {
    position: absolute; left: 0;
    width: 100%; height: 100%;
    background: rgba(255,255,255,0.40);
    transform-origin: left;
    transform: scaleX(0);
    border-radius: 2px;
    z-index: 5;
    pointer-events: none;
}
.chapter-marker-hover {
    position: absolute; left: 0;
    width: 100%; height: 100%;
    background: rgba(229,231,235,1);
    transform-origin: left;
    transform: scaleX(0);
    border-radius: 2px;
    z-index: 10;
    pointer-events: none;
}
.chapter-marker-progress {
    position: absolute; left: 0;
    width: 100%; height: 100%;
    background: #fff;
    transform-origin: left;
    transform: scaleX(0);
    border-radius: 2px;
    z-index: 20;
    pointer-events: none;
}
.slider-nipple {
    position: absolute; top: 0; left: 0;
    width: 16px; height: 16px;
    background: #fff;
    border-radius: 9999px;
    transform: translate(-50%, -25%);
    display: none;
    z-index: 30;
    pointer-events: none;
}
.slider-bar:hover .slider-nipple,
.slider-bar.slider-scrubbing .slider-nipple { display: block; }
.slider-pop {
    position: absolute; bottom: 16px; left: 0;
    transform: translateX(-50%);
    background: rgba(20, 20, 25, 0.95);
    border-radius: 6px;
    overflow: hidden;
    padding-bottom: 4px;
    display: flex; flex-direction: column; gap: 4px;
    text-align: center;
    pointer-events: none;
    z-index: 30;
    opacity: var(--visibility, 0);
    transition: opacity 0.12s ease;
    font-weight: 600;
    min-width: 60px;
}
.slider-pop-image {
    width: 0; height: 0;
    /* Sprite tiles render at native resolution; the JS sets width/height
     *  per-cue and shifts background-position so only the matching cell
     *  inside the larger sprite is visible. Never use background-size:cover
     *  here — that would squish the whole sprite into the cell. */
    background-repeat: no-repeat;
    background-size: auto auto;
    margin: 0 auto;
}
.slider-pop-image[style*="background-image"] { margin: 4px auto 0; border-radius: 4px; }
.slider-pop-text {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.78rem;
    padding: 0 8px;
    color: #fff;
}
.chapter-text {
    font-size: 0.72rem;
    color: rgba(255,255,255,0.75);
    padding: 0 8px;
}
.chapter-text:empty { display: none; }

/* ── Round 40x40 createUiButton equivalent ───────────────────────── */
.nm-btn {
    cursor: pointer;
    fill: #fff;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 40px;
    width: 40px;
    min-width: 40px;
    padding: 8px;
    border-radius: 9999px;
    background: transparent;
    border: 2px solid transparent;
    pointer-events: auto;
    position: relative;
    transition: background 0.15s ease, transform 0.15s ease;
}
.nm-btn:hover { background: rgba(255,255,255,0.10); }
.nm-btn:hover svg { transform: scale(1.10); }
.nm-btn:focus-visible { outline: 2px solid rgba(255,255,255,0.5); outline-offset: -2px; }
.nm-btn[hidden] { display: none !important; }
.nm-btn[disabled] {
    /* Stay laid out so the bottom-row arrangement doesn't shift, but
     * make it clear the action isn't available right now. */
    opacity: 0.30;
    cursor: not-allowed;
    pointer-events: none;
}
.nm-btn[disabled]:hover { background: transparent; }
.nm-btn[disabled]:hover svg { transform: none; }
.nm-btn svg { transition: transform 0.18s ease; pointer-events: none; }

/* ── Volume container ────────────────────────────────────────────── */
.volume-container {
    display: flex; align-items: center;
    overflow: clip;
    pointer-events: auto;
}
.volume-slider {
    appearance: none;
    width: 0;
    opacity: 0;
    height: 4px;
    background: linear-gradient(to right, #fff 0%, #fff var(--vol-pct, 100%), rgba(255,255,255,0.30) var(--vol-pct, 100%));
    border-radius: 9999px;
    cursor: pointer;
    align-self: center;
    transition: width 0.3s ease, opacity 0.3s ease, margin 0.3s ease;
}
.volume-container:hover .volume-slider,
.volume-container:focus-within .volume-slider { width: 80px; opacity: 1; margin: 0 8px; }
.volume-slider::-webkit-slider-thumb { appearance: none; width: 12px; height: 12px; background: #fff; border-radius: 50%; }

/* ── Time labels ─────────────────────────────────────────────────── */
.time {
    display: flex; align-items: center; justify-content: center;
    pointer-events: none;
    user-select: none;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.82rem;
    color: #ddd;
}
.current-time { margin-left: 8px; }
.remaining-time { margin-right: 8px; pointer-events: auto; cursor: pointer; border-radius: 4px; padding: 0 4px; transition: background 0.15s ease; }
.remaining-time:hover { background: rgba(255,255,255,0.10); }
.divider { display: flex; flex: 1; min-width: 16px; }

/* ── Menu frame (v1) ─────────────────────────────────────────────── */
.menu-frame-dialog {
    position: absolute; inset: 0;
    background: transparent; border: none; padding: 0; margin: 0;
    width: 100%; height: 100%;
    color: inherit;
    pointer-events: none;
    z-index: 50;
}
.menu-frame-dialog[open] { pointer-events: auto; }
.menu-wrapper { position: absolute; inset: 0; pointer-events: none; color: #fff; }
.menu-frame {
    position: absolute;
    top: 16px; 
    right: 16px; 
    bottom: 52px;
    display: none;
    flex-direction: column;
    height: auto;
    max-height: calc(100% - 2rem);
    max-width: min(70rem, calc(100% - 2rem));
    width: fit-content;
    overflow: hidden;
    border-radius: 8px;
    z-index: 50;
}
.menu-frame.open { display: flex; }
.menu-content {
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    height: 100%;
    width: 100%;
    margin-top: auto;
    overflow: hidden;
}

.main-menu {
    background: rgba(20, 20, 25, 0.95);
    display: flex; flex-direction: column; gap: 4px;
    height: auto;
    max-height: 60vh;
    min-width: 16rem;
    margin-top: auto;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 4px 8px 8px;
    border-radius: 8px;
    pointer-events: auto;
}
.menu-content.sub-menu-open .main-menu { display: none; }

.sub-menu {
    background: rgba(20, 20, 25, 0.95);
    display: none;
    flex-direction: column; gap: 4px;
    height: auto;
    max-height: 100%;
    min-width: 16rem;
    margin-top: auto;
    overflow: hidden;
    border-radius: 8px;
    pointer-events: auto;
    width: 100%;
}
.menu-content.sub-menu-open .sub-menu { display: flex; }

.menu-header {
    display: flex; align-items: center;
    min-height: 2.5rem;
    color: #fff;
    border-bottom: 1px solid rgba(209, 213, 219, 0.20);
    width: 100%;
    padding: 6px 6px 6px 6px;
    box-sizing: border-box;
    gap: 4px;
}
.menu-header .menu-button-text { font-weight: 600; flex: 1; }
.menu-header-close, .menu-header-back {
    background: transparent; border: none; color: #fff; cursor: pointer;
    width: 32px; height: 32px; flex: 0 0 32px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 6px;
}
.menu-header-close { margin-left: auto; }
.menu-header-back:hover, .menu-header-close:hover { background: rgba(255,255,255,0.08); }

.language-button {
    width: 100%;
    height: 32px;
    padding: 4px 8px;
    display: flex;
    align-items: center;
    border-radius: 4px;
    background: transparent;
    border: 1px solid transparent;
    color: #fff;
    cursor: pointer;
    transition: background 0.18s ease, outline-color 0.18s ease;
    text-align: left;
    white-space: nowrap;
}
.language-button:hover { background: rgba(115, 115, 115, 0.50); }
.language-button:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
.language-button.is-active { background: rgba(255,255,255,0.20); }
.language-button .menu-button-text {
    color: #fff;
    cursor: pointer;
    font-weight: 600;
    padding-left: 8px;
    display: flex; gap: 8px;
    line-height: normal;
    margin-right: auto;
}
.language-button .menu-button-icon-left { width: 20px; height: 20px; flex: 0 0 20px; display: inline-flex; align-items: center; justify-content: center; }
.language-button .menu-button-chevron { width: 20px; height: 20px; flex: 0 0 20px; display: inline-flex; align-items: center; justify-content: center; }
.language-button .menu-button-check { margin-left: auto; width: 20px; height: 20px; flex: 0 0 20px; display: none; color: #fff; align-items: center; justify-content: center; }
.language-button.is-active .menu-button-check { display: inline-flex; }
.language-button .menu-button-subtext {
    margin-left: auto;
    color: rgba(255, 255, 255, 0.60);
    /* v1 ships these as text-2xs (10px) tight body, with the same 600
     * weight as the label so glyphs read evenly at the smaller size. */
    font-size: 10px;
    font-weight: 600;
    padding-right: 8px;
    white-space: nowrap;
}

.sub-menu-content {
    display: none;
    flex-direction: column;
    max-height: 60vh;
    width: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    /* v1 ships sub-menus at 320px wide (its min-w-52 plus the
     * menu-frame max-width caps it there). Match that so the rows
     * have the same breathing room as the reference UI. */
    min-width: 20rem;
}
.sub-menu-content.is-open { display: flex; }
.scroll-container {
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 8px 0 8px 8px;
    transition: all 0.3s ease;
    width: 100%;
    max-height: 50vh;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.3) transparent;
    scrollbar-gutter: stable;
}

/* ── Playlist sub-menu (two-pane, mirrors v1's createEpisodeMenu) ──────
 *   playlist-menu  (flex-row, gap:0)
 *     ├─ sub-menu-content.seasons-pane  (1/3 width, border-right)
 *     │   ├─ menu-header  (back / "Seasons" / close placeholder)
 *     │   └─ scroll-container  (season buttons; empty for movies)
 *     └─ episode-menu  (much wider — 63rem cap)
 *         ├─ menu-header-main  (close × only)
 *         └─ scroll-container  (rich-card episodes)
 *
 *   playlist-menu-button (each card)
 *     ├─ episode-menu-button-left
 *     │   ├─ episode-menu-button-image
 *     │   ├─ episode-menu-button-shadow
 *     │   └─ episode-menu-progress-container
 *     │       ├─ episode-menu-progress-box  (episode label + duration)
 *     │       └─ slider-container > progress-bar
 *     └─ playlist-card-right (title + overview)
 * ──────────────────────────────────────────────────────────────────── */
#playlist-menu.playlist-menu {
    display: none;
    flex-direction: row;
    gap: 0;
    width: 100%;
}
#playlist-menu.playlist-menu.is-open { display: flex; }
.seasons-pane {
    width: 33%;
    min-width: 13rem;
    flex: 0 0 33%;
    border-right: 2px solid rgba(107, 114, 128, 0.20);
    display: flex; flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    max-height: 60vh;
}
.episode-menu {
    flex: 1;
    min-width: 0;
    width: auto;
    max-width: 63rem;
    display: flex; flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    max-height: 60vh;
}
.episode-menu .scroll-container { max-height: none; flex: 1; }
.seasons-pane .scroll-container { max-height: none; flex: 1; }
.playlist-menu-button {
    display: flex; gap: 8px;
    padding: 8px;
    border-radius: 8px;
    background: transparent;
    border: 1px solid transparent;
    color: #fff;
    cursor: pointer;
    transition: background 0.18s ease;
    text-align: left;
    width: 100%;
}
.playlist-menu-button:hover { background: rgba(115, 115, 115, 0.20); }
.playlist-menu-button:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
.playlist-menu-button.is-active { background: rgba(255,255,255,0.10); }
.playlist-menu-button.is-active::before {
    content: ''; position: absolute;
}
.episode-menu-button-left {
    position: relative;
    height: auto;
    overflow: hidden;
    border-radius: 6px;
    align-self: center;
    width: 30%;
    flex: 0 0 30%;
    aspect-ratio: 16 / 9;
    background: rgba(255,255,255,0.05);
}
.episode-menu-button-image {
    width: 100%; height: 100%;
    object-fit: cover;
    aspect-ratio: 16 / 9;
}
.episode-menu-button-shadow {
    position: absolute; inset: 0;
    background: linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.70) 25%, rgba(0,0,0,0) 50%, rgba(0,0,0,0) 100%);
    box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.24),
        inset 0 -1px 0 rgba(0,0,0,0.24),
        inset 0 -2px 0 rgba(0,0,0,0.24);
    pointer-events: none;
}
.episode-menu-progress-container {
    position: absolute; bottom: 0; left: 0; right: 0;
    display: flex; flex-direction: column;
    padding: 0 12px;
}
.episode-menu-progress-box {
    display: flex; justify-content: space-between;
    height: auto;
    margin-bottom: 4px;
    padding: 0 4px;
}
.progress-item-text, .progress-duration { font-size: 0.7rem; color: rgba(255,255,255,0.85); }
.slider-container {
    background: rgba(107, 114, 128, 0.80);
    height: 4px;
    margin: 0 4px 8px;
    overflow: hidden;
    border-radius: 4px;
    display: none;
}
.slider-container.has-progress { display: flex; }
.slider-container .progress-bar { background: #fff; height: 100%; width: 0; border-radius: 4px; }

.playlist-card-right {
    display: flex; flex-direction: column;
    gap: 4px;
    pointer-events: none;
    text-align: left;
    width: 75%;
    flex: 1;
    min-width: 0;
}
.playlist-menu-button-title {
    font-weight: 700;
    color: #fff;
    line-height: 1.25;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
.playlist-menu-button-overview {
    font-size: 0.7rem;
    line-height: 1rem;
    color: rgba(255,255,255,0.80);
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

/* ── Active / inactive overlay states ─────────────────────────────── */
.active .nm-top-bar, .active .bottom-bar { opacity: 1; transform: translateY(0); }
.inactive .nm-top-bar { opacity: 0; transform: translateY(-100%); pointer-events: none; }
.inactive .bottom-bar { opacity: 0; transform: translateY(100%); pointer-events: none; }

/* ── Button tooltips ──────────────────────────────────────────────── */
.nm-tooltip {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: rgba(20, 22, 30, 0.92);
    color: #fff;
    font-size: 0.75rem;
    line-height: 1.2;
    padding: 4px 8px;
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
    z-index: 100;
    opacity: 0;
    transition: opacity 0.15s ease;
    backdrop-filter: blur(4px);
}
.nm-tooltip.nm-tooltip-visible { opacity: 1; }
`;

export function ensureDesktopUiStyles(): void {
    if (document.getElementById(STYLE_ELEMENT_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    style.textContent = desktopUiCss;
    document.head.appendChild(style);
}
