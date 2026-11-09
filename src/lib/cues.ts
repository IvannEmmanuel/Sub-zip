export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** Sorts cues by start time (stable) — required before calling findActive. */
export function sortCues(cues: Cue[]): Cue[] {
  return [...cues].sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * Returns the text of every cue active at `time` (seconds), joined by newlines.
 * `cues` must be sorted by start. O(log n) lookup plus a short backwards scan
 * to cover overlapping cues.
 */
export function findActive(cues: Cue[], time: number): string {
  let lo = 0;
  let hi = cues.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((cues[mid] as Cue).start <= time) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (idx < 0) return '';

  const active: string[] = [];
  for (let i = idx, scanned = 0; i >= 0 && scanned < 12; i--, scanned++) {
    const cue = cues[i] as Cue;
    if (cue.end > time) active.unshift(cue.text);
  }
  return active.join('\n');
}
