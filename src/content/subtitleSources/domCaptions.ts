// Reads captions that players render as DOM nodes (YouTube, Video.js, Plyr, JW Player, Shaka).

const LINE_SELECTORS = [
  '.caption-visual-line', // YouTube: one element per visual line
  '.vjs-text-track-cue',
  '.plyr__caption',
  '.jw-text-track-cue',
  '.shaka-text-container span',
];

const YT_SEGMENT = '.ytp-caption-segment';

function readCaptions(root: Element): string {
  for (const selector of LINE_SELECTORS) {
    const nodes = root.querySelectorAll<HTMLElement>(selector);
    if (nodes.length) {
      return Array.from(nodes)
        .map((n) => (n.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
    }
  }
  const segments = root.querySelectorAll<HTMLElement>(YT_SEGMENT);
  return Array.from(segments)
    .map((n) => (n.textContent ?? '').trim())
    .filter(Boolean)
    .join('\n');
}

/** True if the player root currently contains a recognised caption container. */
export function hasDomCaptions(root: Element): boolean {
  return (
    root.querySelector(
      [...LINE_SELECTORS, YT_SEGMENT, '.ytp-caption-window-container', '.vjs-text-track-display', '.plyr__captions', '.jw-captions'].join(','),
    ) !== null
  );
}

export function attachDomCaptions(root: Element, onText: (text: string) => void): () => void {
  let last = '';
  let scheduled = false;

  const emit = () => {
    scheduled = false;
    const text = readCaptions(root);
    if (text !== last) {
      last = text;
      onText(text);
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(emit); // coalesce bursts of mutations from one caption change
  };

  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  emit();

  return () => {
    observer.disconnect();
    onText('');
  };
}
