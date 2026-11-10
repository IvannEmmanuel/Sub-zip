import { sortCues, type Cue } from './cues';
import { parseSubtitles } from './srt';

function toSeconds(stamp: string): number {
  const [h, m, s] = stamp.trim().split(':');
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

function cleanAss(text: string): string {
  return text
    .replace(/\{[^}]*\}/g, '') // override tags: {\an8}{\i1}
    .replace(/\\[Nn]/g, '\n')
    .replace(/\\h/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

/** Plain-text cues from an ASS/SSA script (styling and drawing commands are dropped). */
export function parseAss(input: string): Cue[] {
  const lines = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  let fields: string[] = [];
  const cues: Cue[] = [];
  for (const line of lines) {
    if (/^format\s*:/i.test(line) && /\btext\b/i.test(line)) {
      fields = line.slice(line.indexOf(':') + 1).split(',').map((f) => f.trim().toLowerCase());
    } else if (/^dialogue\s*:/i.test(line) && fields.length) {
      const body = line.slice(line.indexOf(':') + 1);
      const parts = body.split(',');
      const textIdx = fields.indexOf('text');
      const text = parts.slice(textIdx).join(',');
      const start = toSeconds(parts[fields.indexOf('start')] ?? '');
      const end = toSeconds(parts[fields.indexOf('end')] ?? '');
      const clean = /\\p\d/.test(text) ? '' : cleanAss(text); // \p1 = vector drawing, not text
      if (clean && Number.isFinite(start) && Number.isFinite(end) && end > start) cues.push({ start, end, text: clean });
    }
  }
  return sortCues(cues);
}

/** SRT, WebVTT or ASS/SSA, detected from the content. */
export function parseAnySubtitles(text: string): Cue[] {
  return /\[Script Info\]|^\s*Dialogue\s*:/im.test(text) ? parseAss(text) : parseSubtitles(text);
}
