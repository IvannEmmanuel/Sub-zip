// Receives the subtitle file that the page's own caption renderer (libass / JASSUB / SubtitlesOctopus) was given.
// public/subpip-hook.js runs in the page and leaves it as an attribute on <html>, plus an event.

import { parseAnySubtitles } from '../../lib/ass';
import type { Cue } from '../../lib/cues';

const ATTR = 'data-subpip-sub';
const EVENT = 'subpip-sub';

function read(): Cue[] | null {
  const text = document.documentElement.getAttribute(ATTR);
  if (!text) return null;
  const cues = parseAnySubtitles(text);
  return cues.length >= 3 ? cues : null;
}

/** Calls `onCues` now (if a file is already known) and whenever the page switches to another file. */
export function watchSiteSubs(onCues: (cues: Cue[]) => void): () => void {
  const emit = () => {
    const cues = read();
    if (cues) onCues(cues);
  };
  window.addEventListener(EVENT, emit);
  emit();
  return () => window.removeEventListener(EVENT, emit);
}
