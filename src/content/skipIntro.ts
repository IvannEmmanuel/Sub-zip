// Finds the "Skip intro / Skip opening / Skip recap / Skip credits" button that anime and streaming players show
// over the video, so Picture-in-Picture can offer the same button. Clicking it just clicks the site's own button.

export interface SkipTarget {
  /** Normalised text for our own button, e.g. "Skip intro". */
  label: string;
  click(): void;
}

const WORDS = 'intro|opening|op|recap|credits|ending|ed|outro|preview|ads?';
// Anchored on purpose: "AUTO SKIP" (a settings toggle) and "Skip to content" must not match.
// Trailing arrows, icon glyphs and punctuation are ignored: "Skip Intro »", "Skip Intro ⏭", "Skip intro >>".
const SKIP_RE = new RegExp(`^skip(?:\\s+(?:the\\s+)?(${WORDS}))?[^\\p{L}\\p{N}]*$`, 'iu');
const CLASS_RE = /skip[-_ ]?(intro|opening|op|recap|credits|ending|outro)/i;
const CLICKABLE = 'button,[role="button"],a';
const SELECTOR = `${CLICKABLE},[class*="skip" i],[id*="skip" i],[data-skip]`;

/** "SKIP INTRO »" -> "Skip intro". Returns null when the text is not a skip button label. */
export function skipLabel(raw: string): string | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text || text.length > 28) return null;
  const m = SKIP_RE.exec(text);
  if (!m) return null;
  const what = m[1]?.toLowerCase();
  if (!what) return 'Skip';
  return `Skip ${what === 'op' ? 'opening' : what === 'ed' ? 'ending' : what}`;
}

function classLabel(el: HTMLElement): string | null {
  const cls = typeof el.className === 'string' ? el.className : '';
  const m = CLASS_RE.exec(`${cls} ${el.id}`);
  if (!m) return null;
  const what = (m[1] ?? 'intro').toLowerCase();
  return `Skip ${what === 'op' ? 'opening' : what}`;
}

function isVisible(el: HTMLElement): boolean {
  if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
    return false;
  }
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// "Next episode", "Next Ep", "Play next episode", "Next episode 23". A bare "Next" is ignored: it is usually a carousel.
const NEXT_RE = /^(?:play\s+)?next\s+(?:episode|ep)\b[^\p{L}\p{N}]*(?:\d+)?[^\p{L}\p{N}]*$/iu;
const NEXT_CLASS_RE = /next[-_ ]?(?:ep|episode)/i;

/** "NEXT EPISODE »" -> "Next episode". Returns null when the text is not a next-episode button label. */
export function nextLabel(raw: string): string | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text || text.length > 28) return null;
  return NEXT_RE.test(text) ? 'Next episode' : null;
}

function clickTarget(el: HTMLElement): HTMLElement {
  // A wrapper div with a "skip" / "next" class: click the real button inside it.
  return el.matches(CLICKABLE) ? el : (el.querySelector<HTMLElement>(CLICKABLE) ?? el.closest<HTMLElement>(CLICKABLE) ?? el);
}

function firstVisible(root: ParentNode, selector: string, labelOf: (el: HTMLElement) => string | null): SkipTarget | null {
  for (const el of root.querySelectorAll<HTMLElement>(selector)) {
    const label = labelOf(el);
    if (!label || !isVisible(el)) continue;
    const target = clickTarget(el);
    return { label, click: () => target.click() };
  }
  return null;
}

const NEXT_SELECTOR = `${CLICKABLE},[class*="next" i],[id*="next" i]`;

/** The first visible skip button inside `root`, or null. */
export function findSkip(root: ParentNode): SkipTarget | null {
  return firstVisible(
    root,
    SELECTOR,
    (el) =>
      skipLabel(el.innerText ?? el.textContent ?? '') ??
      skipLabel(el.getAttribute('aria-label') ?? '') ??
      skipLabel(el.title ?? '') ??
      classLabel(el),
  );
}

/** The site's own visible "Next episode" button inside `root`, or null. */
export function findNextButton(root: ParentNode): SkipTarget | null {
  return firstVisible(root, NEXT_SELECTOR, (el) => {
    const cls = typeof el.className === 'string' ? el.className : '';
    return (
      nextLabel(el.innerText ?? el.textContent ?? '') ??
      nextLabel(el.getAttribute('aria-label') ?? '') ??
      nextLabel(el.title ?? '') ??
      (NEXT_CLASS_RE.test(`${cls} ${el.id}`) ? 'Next episode' : null)
    );
  });
}

/**
 * Calls `onChange` whenever a skip button appears or disappears in `root`. The returned target looks the button up
 * again at click time, so it still works if the site re-rendered the element in between.
 */
export function watchSkip(root: Element, onChange: (target: SkipTarget | null) => void): () => void {
  let last: string | null = null;
  let debounce = 0;

  const check = () => {
    const found = findSkip(root);
    const label = found?.label ?? null;
    if (label === last) return;
    last = label;
    onChange(label ? { label, click: () => findSkip(root)?.click() } : null);
  };

  const observer = new MutationObserver(() => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(check, 200);
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  const poll = window.setInterval(check, 1000); // covers buttons shown by CSS animation / timers without DOM changes
  check();

  return () => {
    observer.disconnect();
    window.clearTimeout(debounce);
    window.clearInterval(poll);
  };
}
