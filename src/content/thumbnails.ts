// The little picture a site shows when you hover the seek bar comes from a "thumbnail track": a .vtt file whose lines
// point at a sprite sheet (sprite.jpg#xywh=160,90,160,90) or at one small image per time range. We find that file the
// same way as subtitle files (the page has already requested it), so Picture-in-Picture can show the same preview.

import type { BackgroundReply, BackgroundRequest } from '../lib/messaging';
import { parseSubtitles } from '../lib/srt';

export interface ThumbCue {
  start: number;
  end: number;
  url: string;
  /** Region of the image; w = 0 means "the whole image". */
  x: number;
  y: number;
  w: number;
  h: number;
}

const XYWH = /^(.*?)#xywh=(\d+),(\d+),(\d+),(\d+)\s*$/;
/** A request that may be a thumbnail track: a .vtt file, or (ArtPlayer & co.) an extension-less URL with "thumb" in it. */
export function looksLikeThumbTrack(url: string): boolean {
  if (/\.vtt(?:[?#]|$)/i.test(url)) return true;
  return /thumb|storyboard|sprite|preview/i.test(url) && !/\.(?:jpe?g|png|webp|gif|avif|svg|js|css|json|html|woff2?|ts|m3u8|mp4)(?:[?#]|$)/i.test(url);
}

const IMAGE = /\.(?:jpe?g|png|webp|gif|avif)(?:[?#].*)?$/i;

/** Parses a thumbnail .vtt. Returns [] when the file is not a thumbnail track. */
export function parseThumbs(text: string, vttUrl: string): ThumbCue[] {
  const all = parseSubtitles(text);
  const out: ThumbCue[] = [];
  for (const cue of all) {
    const line = cue.text.split('\n')[0]?.trim() ?? '';
    const m = XYWH.exec(line);
    try {
      if (m) {
        out.push({
          start: cue.start,
          end: cue.end,
          url: new URL(m[1] as string, vttUrl).href,
          x: Number(m[2]),
          y: Number(m[3]),
          w: Number(m[4]),
          h: Number(m[5]),
        });
      } else if (IMAGE.test(line)) {
        out.push({ start: cue.start, end: cue.end, url: new URL(line, vttUrl).href, x: 0, y: 0, w: 0, h: 0 });
      }
    } catch {
      /* not a usable URL: skip the line */
    }
  }
  return out.length >= 3 && out.length >= all.length * 0.8 ? out : [];
}

/** The thumbnail for `time` (cues are in time order). */
export function thumbAt(cues: ThumbCue[], time: number): ThumbCue | null {
  let lo = 0;
  let hi = cues.length - 1;
  let found: ThumbCue | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid] as ThumbCue;
    if (c.start <= time) {
      found = c;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

const short = (u: string) => (u.split('?')[0] ?? u).split('/').slice(-2).join('/').slice(0, 40);

/**
 * Some players write sprite names relative to a different folder than the track file's. If the page has already
 * loaded one of the sprite sheets, take that folder as the truth for sprites whose resolved folder differs.
 */
export function rebaseSprites(cues: ThumbCue[], requested: string[]): ThumbCue[] {
  const dirOf = (u: string) => (u.split(/[?#]/)[0] ?? u).replace(/[^/]*$/, '');
  const known = requested.find((u) => /\/sprite[-_]?\d*\.(?:webp|jpe?g|png|avif)(?:[?#]|$)/i.test(u));
  if (!known) return cues;
  const dir = dirOf(known);
  const asked = new Set(requested.map((u) => u.split(/[?#]/)[0]));
  return cues.map((c) => {
    const bare = c.url.split(/[?#]/)[0] ?? c.url;
    if (asked.has(bare) || dirOf(c.url) === dir) return c;
    const name = bare.split('/').pop() ?? '';
    return /^sprite[-_]?\d*\.(?:webp|jpe?g|png|avif)$/i.test(name) ? { ...c, url: dir + name } : c;
  });
}

/**
 * Loads an image through the background worker, which is not bound by the page's CSP or CORS rules. Used when the page
 * itself refuses to show the picture in our window.
 */
export async function loadBitmap(url: string): Promise<ImageBitmap | null> {
  try {
    const req: BackgroundRequest = { type: 'fetch-image', url };
    const reply = (await chrome.runtime.sendMessage(req)) as BackgroundReply<{ type: string; b64: string }> | undefined;
    if (!reply?.ok || !reply.data) return null;
    const bin = atob(reply.data.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return await createImageBitmap(new Blob([bytes], { type: reply.data.type }));
  } catch {
    return null;
  }
}

async function fetchVtt(url: string): Promise<string | null> {
  try {
    const req: BackgroundRequest = { type: 'fetch-subs', url };
    const reply = (await chrome.runtime.sendMessage(req)) as BackgroundReply<string> | undefined;
    return reply?.ok && typeof reply.data === 'string' ? reply.data : null;
  } catch {
    return null;
  }
}

/** Calls `onFound` once a thumbnail track is found (and again if the page switches to another one). */
export function watchThumbnails(onFound: (cues: ThumbCue[]) => void): () => void {
  let stopped = false;
  const tried = new Set<string>();
  const scan = async () => {
    for (const e of performance.getEntriesByType('resource')) {
      if (stopped) return;
      if (!looksLikeThumbTrack(e.name) || tried.has(e.name) || !/^https?:/i.test(e.name)) continue;
      tried.add(e.name);
      const text = await fetchVtt(e.name);
      if (!text || stopped) continue;
      const parsed = parseThumbs(text, e.name);
      const cues = parsed.length ? rebaseSprites(parsed, performance.getEntriesByType('resource').map((x) => x.name)) : parsed;
      if (cues.length) {
        thumbInfo.cues = cues.length;
        thumbInfo.from = short(e.name);
        onFound(cues);
      }
    }
  };
  void scan();
  const timer = window.setInterval(() => void scan(), 3000);
  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}

/** What the page has loaded that could be a seek preview, for the diagnostics box. */
export const thumbInfo = { cues: 0, from: '' };

export function thumbDiag(root: ParentNode): string {
  const short = (u: string) => (u.split('?')[0] ?? u).split('/').slice(-2).join('/').slice(0, 40);
  const res = performance.getEntriesByType('resource').map((e) => e.name);
  const vtt = res.filter(looksLikeThumbTrack).map(short);
  const imgs = res.filter((u) => /thumb|sprite|storyboard|preview|seek/i.test(u) && !/\.(?:js|css|json)(?:[?#]|$)/i.test(u)).map(short);
  const els = [...root.querySelectorAll<HTMLElement>('[class*="thumb" i],[class*="preview" i],[class*="storyboard" i],[class*="sprite" i]')]
    .map((el) => `${(typeof el.className === 'string' ? el.className : '').split(' ')[0]}${getComputedStyle(el).backgroundImage !== 'none' ? '+bg' : ''}`)
    .slice(0, 3);
  return `seek preview: ${thumbInfo.cues ? `${thumbInfo.cues} pictures from ${thumbInfo.from}` : 'no thumbnail track found'}; vtt files: ${vtt.slice(0, 3).join(', ') || 'none'}; preview images: ${imgs.slice(0, 3).join(', ') || 'none'}; page elements: ${els.join(', ') || 'none'}`;
}
