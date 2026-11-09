const MIN_WIDTH = 120;
const MIN_HEIGHT = 68;

/** All <video> elements under root, including ones inside open shadow roots. */
export function collectVideos(root: ParentNode = document): HTMLVideoElement[] {
  const found: HTMLVideoElement[] = Array.from(root.querySelectorAll('video'));
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) found.push(...collectVideos(el.shadowRoot));
  }
  return found;
}

function boxArea(video: HTMLVideoElement): number {
  const rect = video.getBoundingClientRect();
  if (rect.width < MIN_WIDTH || rect.height < MIN_HEIGHT) return 0;
  return rect.width * rect.height;
}

function onScreenArea(video: HTMLVideoElement): number {
  const rect = video.getBoundingClientRect();
  const w = Math.min(rect.right, innerWidth) - Math.max(rect.left, 0);
  const h = Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Picks the video the user most likely means: playing first, then largest, preferring what is on screen.
 * Falls back to any sized (even scrolled-off) video, then to a loaded-but-unsized one, so a player that
 * hides or resizes its <video> still gets found.
 */
export function findBestVideo(root: ParentNode = document): HTMLVideoElement | null {
  const videos = collectVideos(root);
  let best: HTMLVideoElement | null = null;
  let bestScore = 0;

  for (const video of videos) {
    const box = boxArea(video);
    if (box === 0) continue;
    const visible = onScreenArea(video);
    const score = (visible > 0 ? visible * 4 : box) * (video.paused ? 1 : 4);
    if (score > bestScore) {
      best = video;
      bestScore = score;
    }
  }
  if (best) return best;

  // Last resort: something that is actually playing or has loaded media, even if its box is tiny/hidden.
  return (
    videos.find((v) => !v.paused && v.readyState > 0) ??
    videos.find((v) => v.readyState > 0 && (v.currentSrc || v.srcObject)) ??
    null
  );
}

/**
 * Grows `el` to the outermost ancestor that is still about the size of the video: custom players put their
 * caption layer next to the <video>, not inside whatever element happened to match a class name.
 */
function widen(el: Element, video: HTMLVideoElement): Element {
  const v = video.getBoundingClientRect();
  if (!v.width || !v.height) return el;
  let best = el;
  for (
    let p = el.parentElement, i = 0;
    p && p !== document.body && p !== document.documentElement && i < 6;
    p = p.parentElement, i++
  ) {
    const r = p.getBoundingClientRect();
    if (r.width > v.width * 1.25 || r.height > v.height * 1.25) break;
    best = p;
  }
  return best;
}

/** Nearest known player wrapper — used to scope caption observers. Call BEFORE moving the video. */
export function findPlayerRoot(video: HTMLVideoElement): Element {
  const root =
    video.closest(
      '.html5-video-player, .video-js, .plyr, .jwplayer, .jw-wrapper, .shaka-video-container, .vjs-tech, [class*="player" i]',
    ) ??
    video.parentElement ??
    document.body;
  return root === document.body ? root : widen(root, video);
}
