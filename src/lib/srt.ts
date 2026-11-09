import { sortCues, type Cue } from './cues';

const TIMING =
  /((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/;

function toSeconds(stamp: string): number {
  const parts = stamp.replace(',', '.').split(':').map(Number);
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + (part || 0);
  return seconds;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
  '&lrm;': '',
  '&rlm;': '',
};

function cleanText(raw: string): string {
  return raw
    .replace(/\{\\[^}]*\}/g, '') // ASS-style overrides sometimes found in SRT: {\an8}
    .replace(/<[^>]+>/g, '') // <i>, <b>, <c.color>, <00:00:01.000>
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp|lrm|rlm);/g, (m) => ENTITIES[m] ?? m)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

/** Parses SRT or WebVTT text into sorted cues. Unknown/garbled blocks are skipped. */
export function parseSubtitles(input: string): Cue[] {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const blocks = text.split(/\n{2,}/);
  const cues: Cue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    const timingIndex = lines.findIndex((line) => TIMING.test(line));
    if (timingIndex === -1) continue; // header, NOTE, STYLE, or junk

    const match = TIMING.exec(lines[timingIndex] as string);
    if (!match) continue;

    const start = toSeconds(match[1] as string);
    const end = toSeconds(match[2] as string);
    const body = cleanText(lines.slice(timingIndex + 1).join('\n'));
    if (body && end > start) cues.push({ start, end, text: body });
  }

  return sortCues(cues);
}
