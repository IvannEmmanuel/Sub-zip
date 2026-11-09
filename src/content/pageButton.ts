import { iconSvg } from './icons';
import { collectVideos } from './videoDetector';

const CSS = /* css */ `
:host { all: initial; }
button { position: fixed; z-index: 2147483647; display: none; align-items: center; gap: 6px; height: 36px;
  padding: 0 12px 0 10px; border: 1px solid #1F2937; border-radius: 10px; background: rgba(11,15,23,.92);
  color: #E5E7EB; font: 600 12px/1 system-ui, "Segoe UI", Roboto, sans-serif; cursor: pointer;
  box-shadow: 0 4px 16px rgba(0,0,0,.45); transition: background-color .15s ease, opacity .15s ease; opacity: 0; }
button.visible { display: inline-flex; opacity: 1; }
.toast { position: fixed; z-index: 2147483647; left: 50%; bottom: 24px; max-width: min(92vw, 420px); transform: translateX(-50%);
  padding: 10px 14px; border: 1px solid rgba(249,115,22,.5); border-radius: 10px; background: rgba(11,15,23,.96);
  color: #E5E7EB; font: 500 13px/1.4 system-ui, "Segoe UI", Roboto, sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,.5);
  display: none; }
.toast.visible { display: block; }
button:hover { background: #1D4ED8; border-color: #2563EB; color: #fff; }
button:focus-visible { outline: 2px solid #60A5FA; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { button { transition: none; } }
`;

/**
 * Floating "PiP + subs" button shown over the hovered video. Its click is a real user gesture,
 * which Document Picture-in-Picture requires — the handler is called synchronously from it.
 */
let toastEl: HTMLElement | null = null;
let toastTimer = 0;

/** Small in-page message, used when Picture-in-Picture cannot open (otherwise failures are silent). */
export function showToast(message: string): void {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl?.classList.remove('visible'), 7000);
}

export function initPageButton(isEnabled: () => boolean, onActivate: (video: HTMLVideoElement) => void): void {
  const host = document.createElement('div');
  document.querySelectorAll('[data-sub-pip-host]').forEach((n) => n.remove()); // leftover from a dead copy
  host.setAttribute('data-sub-pip-host', '');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = CSS;
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Open video in Picture-in-Picture with subtitles');
  button.innerHTML = `${iconSvg('pip', 16)}<span>PiP + subs</span>`;
  toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  shadow.append(style, button, toastEl);

  let target: HTMLVideoElement | null = null;
  let hideTimer = 0;
  let frame = 0;

  const mount = () => {
    if (!host.isConnected) (document.fullscreenElement ?? document.documentElement).append(host);
    const parent = document.fullscreenElement ?? document.documentElement;
    if (host.parentNode !== parent) parent.append(host);
  };

  const hide = () => {
    button.classList.remove('visible');
    target = null;
  };
  const armHide = () => {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hide, 2200);
  };

  // Sites like Facebook cover videos with transparent layers or set pointer-events:none on the <video>, so
  // hit-testing (elementsFromPoint) misses them. Match the pointer against video boxes instead (cached: cheap).
  let cache: HTMLVideoElement[] = [];
  let cacheAt = 0;
  const videoAt = (x: number, y: number): HTMLVideoElement | null => {
    const now = performance.now();
    if (now - cacheAt > 1000) {
      cache = collectVideos();
      cacheAt = now;
    }
    let best: HTMLVideoElement | null = null;
    let bestArea = Infinity;
    for (const v of cache) {
      const r = v.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const area = r.width * r.height;
      if (area < bestArea) {
        best = v;
        bestArea = area; // smallest box under the pointer = the innermost player
      }
    }
    return best;
  };

  const onMove = (e: PointerEvent) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!isEnabled()) return hide();
      const video = videoAt(e.clientX, e.clientY);
      const rect = video?.getBoundingClientRect();
      if (!video || !rect || rect.width < 200 || rect.height < 110) return;
      mount();
      target = video;
      button.style.top = `${Math.max(8, rect.top + 10)}px`;
      button.style.left = `${Math.max(8, Math.min(innerWidth - 130, rect.right - 130))}px`;
      button.classList.add('visible');
      armHide();
    });
  };

  button.addEventListener('pointerenter', () => window.clearTimeout(hideTimer));
  button.addEventListener('pointerleave', armHide);
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    const video = target;
    hide();
    if (video) onActivate(video);
  });

  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('fullscreenchange', () => {
    hide();
    mount();
  });
}
