// Reads captions that players render as DOM nodes (YouTube, Video.js, Plyr, JW Player, Shaka).

import { createOverlayReader } from './overlayText';

const LINE_SELECTORS = [
  '.caption-visual-line', // YouTube: one element per visual line
  '.vjs-text-track-cue',
  '.plyr__caption',
  '.jw-text-track-cue',
  '.shaka-text-container span',
  '.art-subtitle', // Artplayer
  '.dplayer-subtitle', // DPlayer
  '.mejs__captions-text', // MediaElement
  '.vds-captions', // Vidstack
  '.bmpui-subtitle-label', // Bitmovin
  '.fp-captions', // Flowplayer
  '.oplayer-subtitle', // OPlayer
  '.pjs-captions', // Playerjs
];

// Generic fallback for sites with their own player: any element whose class/id says "subtitle"/"caption"/"cue".
const GENERIC =
  '[class*="subtitle" i],[class*="caption" i],[class*="cue" i],[id*="subtitle" i],[id*="caption" i],[data-subtitle],[data-caption]';
// ...minus things that merely mention subtitles: menus, buttons, language pickers, icons, settings.
const NOT_TEXT = /menu|button|btn|setting|toggle|select|option|icon|lang|list|item|picker|control|tooltip|preview/i;
const MAX_LEN = 300;

function isVisible(el: HTMLElement): boolean {
  return typeof el.checkVisibility === 'function'
    ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    : true;
}

function isCaptionNode(el: HTMLElement): boolean {
  if (el.closest('button,a,select,input,[role="menu"],[role="menuitem"],[role="listbox"],[role="option"],[role="button"]')) {
    return false;
  }
  const cls = typeof el.className === 'string' ? el.className : '';
  return !NOT_TEXT.test(`${cls} ${el.id}`.replace(/subtitles?|captions?|cues?/gi, ''));
}

function readGeneric(root: Element): string {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(GENERIC)).filter(isCaptionNode);
  // Only the innermost matches, so a wrapper and its line elements are not counted twice.
  const leaves = nodes.filter((n) => !nodes.some((o) => o !== n && n.contains(o)));
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const n of leaves) {
    if (!isVisible(n)) continue;
    const text = (n.innerText ?? n.textContent ?? '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
    if (!text || text.length > MAX_LEN || seen.has(text)) continue;
    seen.add(text);
    lines.push(text);
  }
  return lines.join('\n');
}

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
  const yt = Array.from(segments)
    .map((n) => (n.textContent ?? '').trim())
    .filter(Boolean)
    .join('\n');
  return yt || readGeneric(root);
}

/** True if the player root currently contains a recognised caption container. */
export function hasDomCaptions(root: Element): boolean {
  return (
    // Unknown players are handled by the on-screen text reader, so the page source is always worth trying.
    true ||
    root.querySelector(
      [...LINE_SELECTORS, YT_SEGMENT, '.ytp-caption-window-container', '.vjs-text-track-display', '.plyr__captions', '.jw-captions', GENERIC].join(','),
    ) !== null
  );
}

export function attachDomCaptions(
  root: Element,
  onText: (text: string) => void,
  /** Where the video is on screen and its clock: enables the player-agnostic on-screen text reader. */
  screen?: { area: () => DOMRect | null; clock: () => number },
): () => void {
  let last = '';
  let scheduled = false;
  const guess = screen ? createOverlayReader(screen.area, screen.clock) : null;

  const emit = () => {
    scheduled = false;
    const text = readCaptions(root) || (guess ? guess() : '');
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
  // Captions can also appear without a DOM change we can see (CSS-only show/hide), and the reader looks at the screen.
  const poll = guess ? window.setInterval(emit, 250) : 0;
  emit();

  return () => {
    observer.disconnect();
    if (poll) window.clearInterval(poll);
    onText('');
  };
}
