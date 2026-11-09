import { sortCues, type Cue } from '../../lib/cues';

export function getSubtitleTracks(video: HTMLVideoElement): TextTrack[] {
  return Array.from(video.textTracks).filter(
    (t) => t.kind === 'subtitles' || t.kind === 'captions',
  );
}

/** Prefer what the user already selected, then the default track, then browser language, then first. */
function pickTrack(tracks: TextTrack[]): TextTrack | undefined {
  const lang = navigator.language.toLowerCase().split('-')[0];
  return (
    tracks.find((t) => t.mode === 'showing') ??
    tracks.find((t) => (t as TextTrack & { default?: boolean }).default) ??
    tracks.find((t) => t.language.toLowerCase().startsWith(lang ?? '')) ??
    tracks[0]
  );
}

function cueText(cue: TextTrackCue): string {
  const raw = (cue as VTTCue).text ?? '';
  return raw
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Attaches to the best native text track. The track is set to "hidden" while attached so the browser
 * does not render the same cues a second time inside the video; its previous mode is restored on detach.
 */
export function attachTextTrack(video: HTMLVideoElement, onText: (text: string) => void): () => void {
  const track = pickTrack(getSubtitleTracks(video));
  if (!track) return () => {};

  const previousMode = track.mode;
  track.mode = 'hidden';

  const emit = () => {
    onText(Array.from(track.activeCues ?? []).map(cueText).filter(Boolean).join('\n'));
  };
  track.addEventListener('cuechange', emit);
  emit();

  return () => {
    track.removeEventListener('cuechange', emit);
    track.mode = previousMode;
    onText('');
  };
}

/** Test helper / future use: snapshot of a loaded track as plain cues. */
export function trackToCues(track: TextTrack): Cue[] {
  return sortCues(
    Array.from(track.cues ?? []).map((c) => ({ start: c.startTime, end: c.endTime, text: cueText(c) })),
  );
}
