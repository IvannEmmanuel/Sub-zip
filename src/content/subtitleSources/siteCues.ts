// Captions that the page draws as text are only as exact as the page's own drawing code. When you are on another
// tab the browser stops that code's animation frames, so the page shows each line up to ~0.3 s late, and we copy
// that lateness. Here we find the subtitle file the page itself loaded (.vtt / .srt / .ass), and once its text is
// proven to match what the page shows, we time the lines from the video clock instead. If the file ever stops
// matching (another language, another episode) we go back to copying the page.

import { findActive, type Cue } from '../../lib/cues';
import { parseAnySubtitles } from '../../lib/ass';
import type { BackgroundReply, BackgroundRequest } from '../../lib/messaging';
import { attachDomCaptions } from './domCaptions';

const SUB_URL = /\.(?:vtt|srt|ass|ssa)(?:[?#]|$)/i;
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** For the diagnostics box. */
export const preciseInfo = { files: 0, adopted: false, domText: false, single: null as Cue[] | null };

interface Candidate {
  url: string;
  cues: Cue[];
  hits: number;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const req: BackgroundRequest = { type: 'fetch-subs', url };
    const reply = (await chrome.runtime.sendMessage(req)) as BackgroundReply<string> | undefined;
    return reply?.ok && typeof reply.data === 'string' ? reply.data : null;
  } catch {
    return null;
  }
}

export function attachPreciseDomCaptions(
  video: HTMLVideoElement,
  root: Element,
  onText: (text: string) => void,
  /** Where the video is shown on the page (differs from the video's own box while it lives in the PiP window). */
  area: () => DOMRect | null = () => video.getBoundingClientRect(),
): () => void {
  let stopped = false;
  let domText = '';
  let domSince = performance.now();
  let adopted: Candidate | null = null;
  let misses = 0;
  let lastCue = '\u0000';
  const tried = new Set<string>();
  const candidates: Candidate[] = [];

  const detachDom = attachDomCaptions(
    root,
    (text) => {
    if (text !== domText) {
      domText = text;
      domSince = performance.now();
    }
    if (!adopted) onText(text);
    },
    { area, clock: () => video.currentTime },
  );

  const scan = async () => {
    for (const e of performance.getEntriesByType('resource')) {
      if (stopped) return;
      if (!SUB_URL.test(e.name) || tried.has(e.name) || !/^https?:/i.test(e.name)) continue;
      tried.add(e.name);
      const text = await fetchText(e.name);
      if (!text || stopped) continue;
      const cues = parseAnySubtitles(text);
      if (cues.length >= 3) {
        candidates.push({ url: e.name, cues, hits: 0 });
        preciseInfo.files = candidates.length;
        // Exactly one file: if the page draws its captions on a canvas (no text to compare with), this is the one.
        preciseInfo.single = candidates.length === 1 ? cues : null;
      }
    }
  };

  // Compare only when the page's text has been steady for a moment, so a late update at a boundary is not a mismatch.
  const verify = () => {
    preciseInfo.adopted = adopted !== null;
    preciseInfo.domText = domText !== '';
    if (!domText || performance.now() - domSince < 700) return;
    const want = norm(domText);
    if (!want) return;
    const t = video.currentTime;
    if (adopted) {
      if (norm(findActive(adopted.cues, t)) === want) misses = 0;
      else if (++misses >= 4) {
        adopted = null; // not this file any more: copy the page again
        for (const c of candidates) c.hits = 0;
        onText(domText);
      }
      return;
    }
    for (const c of candidates) {
      if (norm(findActive(c.cues, t)) === want) {
        if (++c.hits >= 3) {
          adopted = c;
          misses = 0;
          lastCue = '\u0000';
          return;
        }
      }
    }
  };

  const tick = () => {
    if (!adopted) return;
    const text = findActive(adopted.cues, video.currentTime);
    if (text !== lastCue) {
      lastCue = text;
      onText(text);
    }
  };

  void scan();
  const scanTimer = window.setInterval(() => void scan(), 3000);
  const verifyTimer = window.setInterval(verify, 500);
  const tickTimer = window.setInterval(tick, 40);

  return () => {
    stopped = true;
    window.clearInterval(scanTimer);
    window.clearInterval(verifyTimer);
    window.clearInterval(tickTimer);
    detachDom();
  };
}
