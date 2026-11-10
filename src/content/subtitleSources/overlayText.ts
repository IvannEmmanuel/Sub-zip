// Last-resort caption reader for players that nobody has written a selector for.
//
// Instead of looking for class names, it looks at what is on screen: text that sits over the lower part of the video,
// near the middle, outside any button / menu / control bar, and that keeps changing as the video plays. That is what a
// subtitle is, whatever the player calls it. It samples a grid of points over the video with elementsFromPoint, so it
// also sees through overlays, and it needs no knowledge of the player's markup.

const COLS = [0.25, 0.35, 0.45, 0.5, 0.55, 0.65, 0.75];
const ROWS = [0.4, 0.5, 0.6, 0.7, 0.78, 0.85, 0.91];
const MAX_LEN = 220;
const STALE_SECONDS = 25; // text that has not changed for this long (of video time) is a label, not a caption

const INTERACTIVE = 'button,a,select,input,textarea,label,summary,[role="button"],[role="slider"],[role="menu"],[role="menuitem"],[role="tooltip"],[role="listbox"],[role="option"],[role="tab"]';
const CONTROLS = /(^|[-_ ])(controls?|toolbar|menu|tooltip|progress|volume|settings?|timeline|seekbar|title|header|watermark|logo|chat|comment|episode|playlist|next|prev)([-_ ]|$)/i;
const TIMEISH = /^[\s\d:./-]+$/;
const SKIP_TAGS = new Set(['VIDEO', 'CANVAS', 'IMG', 'SVG', 'PICTURE', 'IFRAME', 'HTML', 'BODY']);

function visible(el: HTMLElement): boolean {
  return typeof el.checkVisibility === 'function' ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true;
}

/** For the diagnostics box: what the reader saw on its last pass. */
export const overlayInfo = { texts: 0, rejected: [] as string[], picked: '' };

function inControls(el: HTMLElement, videoArea: number): boolean {
  if (el.closest(INTERACTIVE)) return true;
  for (let n: HTMLElement | null = el, i = 0; n && i < 8; n = n.parentElement, i++) {
    // A wrapper that covers most of the player ("plyr--hide-controls", "player-next-ep") says nothing about this text.
    const nb = n.getBoundingClientRect();
    if (nb.width * nb.height > videoArea * 0.45) continue;
    const cls = typeof n.className === 'string' ? n.className : '';
    if (CONTROLS.test(`${cls} ${n.id}`.replace(/subtitles?|captions?/gi, ''))) return true;
  }
  return false;
}

export function createOverlayReader(area: () => DOMRect | null, clock: () => number): () => string {
  const seen = new WeakMap<Element, { text: string; since: number }>();

  return () => {
    const r = area();
    if (!r || r.width < 160 || r.height < 90) return '';
    const hits = new Set<HTMLElement>();
    for (const row of ROWS) {
      for (const col of COLS) {
        const x = r.left + r.width * col;
        const y = r.top + r.height * row;
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
        for (const el of document.elementsFromPoint(x, y)) {
          if (!(el instanceof HTMLElement)) continue;
          if (el.tagName === 'VIDEO' || el.tagName === 'IFRAME') break; // everything below is the video / the player frame
          if (!SKIP_TAGS.has(el.tagName)) hits.add(el);
        }
      }
    }

    const now = clock();
    const playerArea = r.width * r.height;
    overlayInfo.texts = 0;
    overlayInfo.rejected = [];
    const reject = (why: string, text: string) => {
      if (overlayInfo.rejected.length < 3) overlayInfo.rejected.push(`${why}: ${text.slice(0, 40)}`);
    };
    const picked: { el: HTMLElement; text: string; top: number }[] = [];
    for (const el of hits) {
      const text = (el.innerText ?? '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
      if (!text || text.length > MAX_LEN || TIMEISH.test(text) || !/\p{L}/u.test(text)) continue;
      overlayInfo.texts++;
      const b = el.getBoundingClientRect();
      if (b.height > r.height * 0.3 || b.width > r.width * 1.02) {
        reject('too big', text); // a wrapper around the whole player
        continue;
      }
      const cx = b.left + b.width / 2;
      if (Math.abs(cx - (r.left + r.width / 2)) > r.width * 0.35) {
        reject('off-centre', text); // subtitles are centred
        continue;
      }
      if (!visible(el)) continue;
      if (inControls(el, playerArea)) {
        reject('in controls', text);
        continue;
      }
      const prev = seen.get(el);
      if (!prev || prev.text !== text || now < prev.since) seen.set(el, { text, since: now });
      else if (now - prev.since > STALE_SECONDS) {
        reject('unchanged', text);
        continue;
      }
      picked.push({ el, text, top: b.top });
    }
    // Keep the outermost small block (a wrapper holding the lines), drop blocks nested inside another pick.
    const outer = picked.filter((p) => !picked.some((o) => o !== p && o.el.contains(p.el)));
    const out = outer
      .sort((a, b) => a.top - b.top)
      .map((p) => p.text)
      .join('\n');
    overlayInfo.picked = out.slice(0, 40);
    return out;
  };
}
