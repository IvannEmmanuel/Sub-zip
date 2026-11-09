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

  return () => {
    stopped = true;
    win.cancelAnimationFrame(raf);
    for (const e of events) video.removeEventListener(e, emit);
    onText('');
  };
}
