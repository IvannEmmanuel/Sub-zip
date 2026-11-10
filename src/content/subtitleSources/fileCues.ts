import { findActive, type Cue } from '../../lib/cues';

/**
 * Drives subtitle text from parsed cues. Uses media events (not throttled in background tabs) plus
 * the PiP window's rAF for smooth updates while it is visible.
 */
export function attachFileCues(
  video: HTMLVideoElement,
  cues: Cue[],
  win: Window,
  onText: (text: string) => void,
): () => void {
  let last = '\u0000';
  let raf = 0;
  let stopped = false;

  const emit = () => {
    const text = findActive(cues, video.currentTime);
    if (text !== last) {
      last = text;
      onText(text);
    }
  };
  const loop = () => {
    if (stopped) return;
    emit();
    raf = win.requestAnimationFrame(loop);
  };

  const events = ['timeupdate', 'seeked', 'seeking', 'ratechange'] as const;
  for (const e of events) video.addEventListener(e, emit);
  loop();
  // rAF stops while the page is hidden (you are on another tab) and media events only come ~4 times a second, which
  // made captions late by up to 0.3 s. A short timer keeps them exact; the video clock is read directly.
  const timer = window.setInterval(emit, 40);

  return () => {
    stopped = true;
    window.clearInterval(timer);
    win.cancelAnimationFrame(raf);
    for (const e of events) video.removeEventListener(e, emit);
    onText('');
  };
}
