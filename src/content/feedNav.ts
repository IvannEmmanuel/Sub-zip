// Up / down for feeds of short videos (Facebook Reels, YouTube Shorts, Instagram Reels, TikTok).
// The video lives in the Picture-in-Picture window, so the person cannot scroll the page. Instead we do what a
// scroll would do, in the page: press the site's own "next / previous" arrow if it has one, otherwise scroll the
// feed by one screen. The session already follows whichever video starts playing, so the window switches by itself.

export type Direction = 1 | -1;

/** True on pages that are a feed of videos, where "next video" means scrolling. */
export function isFeedPage(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.hostname.replace(/^www\.|^m\.|^web\./, '');
  const path = u.pathname.toLowerCase();
  if (host === 'facebook.com' || host === 'fb.watch') return true; // reels, watch, and videos in the home feed
  if (host === 'youtube.com') return path.startsWith('/shorts');
  if (host === 'instagram.com') return path.startsWith('/reel');
  if (host === 'tiktok.com') return true;
  return false;
}

/** The site's own arrows, tried before scrolling. Selector lists are per direction: [next, previous]. */
const SITE_BUTTONS: Record<string, [string, string]> = {
  'facebook.com': ['[aria-label="Next card" i]', '[aria-label="Previous card" i]'],
  'youtube.com': ['#navigation-button-down button', '#navigation-button-up button'],
  'instagram.com': ['[aria-label="Navigate down" i]', '[aria-label="Navigate up" i]'],
  'tiktok.com': ['button[data-e2e="arrow-right"]', 'button[data-e2e="arrow-left"]'],
};

function siteButton(doc: Document, dir: Direction): HTMLElement | null {
  const host = doc.location.hostname.replace(/^www\.|^m\.|^web\./, '');
  const pair = SITE_BUTTONS[host];
  if (!pair) return null;
  const el = doc.querySelector<HTMLElement>(pair[dir === 1 ? 0 : 1]);
  if (!el || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return null;
  return el;
}

function scrollParent(from: Element | null): Element {
  for (let el = from; el; el = el.parentElement) {
    const overflow = getComputedStyle(el).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight + 4) return el;
  }
  return document.scrollingElement ?? document.documentElement;
}

/** Moves the feed to the next (1) or previous (-1) video. `anchor` is where the video used to sit in the page. */
export function stepFeed(doc: Document, anchor: Node | null, dir: Direction): void {
  const button = siteButton(doc, dir);
  if (button) {
    button.click();
    return;
  }
  const scroller = scrollParent(anchor instanceof Element ? anchor : anchor?.parentElement ?? null);
  const page = Math.max(240, scroller === doc.scrollingElement || scroller === doc.documentElement ? window.innerHeight : scroller.clientHeight);
  scroller.scrollBy({ top: dir * page, behavior: 'smooth' });
}
