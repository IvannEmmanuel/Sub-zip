// "Next episode" for any site. Order of attempts:
//   1. the player's own "Next episode" button (see skipIntro.ts)
//   2. <link rel="next"> / <a rel="next">
//   3. an episode list on the page: find the entry marked as current (class active / current / playing / selected,
//      or aria-current) and click the entry after it. If the current entry is the last one, there is no next episode.

import { findNextButton } from './skipIntro';

export interface NextTarget {
  click(): void;
}

const CURRENT_SELECTOR = [
  '[aria-current]:not([aria-current="false"])',
  '[class*="active" i]',
  '[class*="current" i]',
  '[class*="playing" i]',
  '[class*="selected" i]',
  '[class*="watching" i]',
].join(',');

const EP_HINT = /(^|[^a-z])(ep|eps|episode|episodes|eplist|ep-list|playlist)([^a-z]|$)/i;
const EP_TEXT = /\b(?:ep(?:isode)?\.?\s*[-_#:=]?\s*\d+)\b|[?&/_-]ep(?:isode)?[-_=/]?\d+/i;
const SKIP_CLASS = /(tab|nav|menu|server|filter|btn-group|pagination|dropdown|season)/i;

function attrs(el: Element): string {
  return `${typeof el.className === 'string' ? el.className : ''} ${el.id}`;
}

function clickable(el: HTMLElement): HTMLElement {
  if (el.matches('a[href],button,[role="button"]')) return el;
  return el.querySelector<HTMLElement>('a[href],button,[role="button"]') ?? el;
}

function looksLikeEpisode(el: HTMLElement): boolean {
  const link = clickable(el);
  const href = link instanceof HTMLAnchorElement ? link.getAttribute('href') ?? '' : '';
  return EP_TEXT.test(`${(el.innerText ?? el.textContent ?? '').slice(0, 80)} ${href} ${el.dataset.number ?? ''} ${el.dataset.ep ?? ''}`);
}

function inEpisodeContainer(el: HTMLElement): boolean {
  for (let n: HTMLElement | null = el, i = 0; n && i < 6; n = n.parentElement, i++) {
    if (EP_HINT.test(attrs(n))) return true;
  }
  return false;
}

/** Returns the next entry of an episode list after the current one, or null. */
function listNext(doc: Document): NextTarget | null {
  for (const cur of doc.querySelectorAll<HTMLElement>(CURRENT_SELECTOR)) {
    if (SKIP_CLASS.test(attrs(cur))) continue;
    // Climb to the list entry: the nearest ancestor-or-self that has same-tag siblings.
    let entry: HTMLElement | null = cur;
    for (let i = 0; i < 4 && entry; i++) {
      const parent: HTMLElement | null = entry.parentElement;
      if (parent && parent.children.length >= 2 && [...parent.children].some((c) => c !== entry && c.tagName === entry!.tagName)) break;
      entry = parent;
    }
    if (!entry?.parentElement) continue;
    const siblings = [...entry.parentElement.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.tagName === entry!.tagName);
    if (siblings.length < 2) continue;
    // It must really be an episode list, not a tab strip or a server picker.
    const isList = inEpisodeContainer(entry) || (looksLikeEpisode(entry) && looksLikeEpisode(siblings[siblings.length - 1]!));
    if (!isList) continue;
    const next = siblings[siblings.indexOf(entry) + 1];
    if (!next) continue; // last episode: nothing left
    const target = clickable(next);
    return { click: () => target.click() };
  }
  return null;
}

function relNext(doc: Document): NextTarget | null {
  const a = doc.querySelector<HTMLAnchorElement>('a[rel~="next"][href]');
  if (a && /ep|episode/i.test(`${a.textContent} ${a.href} ${a.getAttribute('aria-label') ?? ''}`)) return { click: () => a.click() };
  return null;
}

export function findNextEpisode(doc: Document): NextTarget | null {
  return findNextButton(doc) ?? relNext(doc) ?? listNext(doc);
}

/** Calls `onChange(true/false)` whenever a next episode becomes (un)available. The target is looked up again on click. */
export function watchNextEpisode(doc: Document, onChange: (available: boolean) => void): { click(): void; stop(): void } {
  let last: boolean | null = null;
  let debounce = 0;
  const check = () => {
    const found = !!findNextEpisode(doc);
    if (found === last) return;
    last = found;
    onChange(found);
  };
  const observer = new MutationObserver(() => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(check, 400);
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-current'] });
  const poll = window.setInterval(check, 2000);
  check();
  return {
    click: () => findNextEpisode(doc)?.click(),
    stop: () => {
      observer.disconnect();
      window.clearTimeout(debounce);
      window.clearInterval(poll);
    },
  };
}
