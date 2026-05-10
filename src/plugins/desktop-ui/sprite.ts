/**
 * Sprite thumbnail loader for the slider-pop preview.
 *
 * Mirrors v1's `fetchPreviewTime` + `loadSliderPopImage`: parses a sprite
 * VTT (cue body = `image.webp#xywh=x,y,w,h`), preloads the sprite image,
 * and exposes a `lookup(time)` that returns the cue covering that time.
 */

export interface SpriteCue {
    start: number;
    end: number;
    url: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface SpriteSet {
    cues: SpriteCue[];
    /** Sprite image URL — same for every cue in NoMercy's tooling. */
    spriteUrl: string;
}

const SPRITE_FRAGMENT_RE = /^([^#\s]+)#xywh=(\d+),(\d+),(\d+),(\d+)$/;

/** Parse a sprite VTT into cues. Resolves relative sprite URLs against
 *  `baseUrl` (the URL of the VTT file itself). */
export function parseSpriteVtt(text: string, baseUrl: string): SpriteCue[] {
    if (!text) return [];
    const stripped = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
    const blocks = stripped.replace(/\r\n|\r/g, '\n').split(/\n{2,}/);
    const cues: SpriteCue[] = [];

    for (const block of blocks) {
        const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) continue;
        const timingIdx = lines.findIndex(l => l.includes('-->'));
        if (timingIdx < 0) continue;

        const [startStr, endStr] = lines[timingIdx]!.split('-->').map(s => s.trim());
        const start = parseTimestamp(startStr ?? '');
        const end = parseTimestamp(endStr ?? '');
        if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

        const body = lines.slice(timingIdx + 1).join(' ').trim();
        const m = body.match(SPRITE_FRAGMENT_RE);
        if (!m) continue;

        const url = m[1]!;
        const absUrl = /^https?:\/\//i.test(url) ? url : new URL(url, baseUrl).href;
        cues.push({
            start,
            end,
            url: absUrl,
            x: Number.parseInt(m[2]!, 10),
            y: Number.parseInt(m[3]!, 10),
            w: Number.parseInt(m[4]!, 10),
            h: Number.parseInt(m[5]!, 10),
        });
    }
    return cues;
}

function parseTimestamp(s: string): number {
    const m = s.match(/(?:(\d+):)?(\d+):(\d+)\.(\d{1,3})/);
    if (!m) return Number.NaN;
    const h = m[1] ? Number(m[1]) : 0;
    const min = Number(m[2]);
    const sec = Number(m[3]);
    const ms = Number(m[4]!.padEnd(3, '0'));
    return h * 3600 + min * 60 + sec + ms / 1000;
}

/** Load + parse a sprite VTT, then preload its sprite image. */
export async function loadSpriteSet(vttUrl: string): Promise<SpriteSet | null> {
    try {
        const r = await fetch(vttUrl);
        if (!r.ok) return null;
        const text = await r.text();
        const cues = parseSpriteVtt(text, vttUrl);
        if (cues.length === 0) return null;
        const spriteUrl = cues[0]!.url;
        // Preload the sprite so the first hover paints instantly.
        await new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = spriteUrl;
        });
        return { cues, spriteUrl };
    }
    catch {
        return null;
    }
}

/** Find the cue whose [start, end) covers the given time, or the last
 *  cue if time falls past the end of the table. */
export function lookupCue(set: SpriteSet, time: number): SpriteCue | null {
    if (set.cues.length === 0) return null;
    const found = set.cues.find(c => time >= c.start && time < c.end);
    return found ?? set.cues.at(-1) ?? null;
}
