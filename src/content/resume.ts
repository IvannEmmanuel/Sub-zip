// "Continue where you stopped": remembers how far a long video got and offers to jump back there next time.
// Stored on this computer only (chrome.storage.local), keyed by the page address.

import { loadResume, rememberPosition, resumeKey, resumeOffer } from '../lib/study';

interface Playhead {
  paused: boolean;
  currentTime: number;
  readonly duration: number;
}

const SAVE_EVERY_MS = 5000;

/**
 * Saves the position while the video plays, and calls `offer(time, go)` once if an earlier position is worth offering.
 * Returns a function that stops it.
 */
export function watchResume(video: Playhead, offer: (time: number, go: () => void) => void): () => void {
  let stopped = false;
  let asked = false;

  // The offer needs the duration, which can arrive a little after the window opens.
  let tries = 0;
  const ask = window.setInterval(() => {
    if (stopped || asked || ++tries > 20) return void window.clearInterval(ask);
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    asked = true;
    window.clearInterval(ask);
    void loadResume().then((map) => {
      if (stopped) return;
      const at = resumeOffer(map[resumeKey(location.href)], video.currentTime, video.duration);
      if (at !== null) offer(at, () => (video.currentTime = at));
    });
  }, 500);

  const save = window.setInterval(() => {
    if (stopped || video.paused || !Number.isFinite(video.duration)) return;
    void rememberPosition(resumeKey(location.href), video.currentTime, video.duration);
  }, SAVE_EVERY_MS);

  return () => {
    stopped = true;
    window.clearInterval(ask);
    window.clearInterval(save);
  };
}
