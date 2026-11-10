import { describe, expect, it } from 'vitest';
import { parseAnySubtitles, parseAss } from '../src/lib/ass';

const ASS = String.raw`[Script Info]
Title: x
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\an8}Hello, world\Nsecond line
Dialogue: 0,0:00:04.00,0:00:05.00,Default,,0,0,0,,{\p1}m 0 0 l 10 10{\p0}
Dialogue: 0,0:01:00.00,0:01:02.00,Default,,0,0,0,,Late`;

describe('ass', () => {
  it('extracts plain text cues', () => {
    expect(parseAss(ASS)).toEqual([
      { start: 1, end: 3.5, text: 'Hello, world\nsecond line' },
      { start: 60, end: 62, text: 'Late' },
    ]);
  });
  it('detects the format', () => {
    expect(parseAnySubtitles(ASS)).toHaveLength(2);
    expect(parseAnySubtitles('WEBVTT\n\n00:01.000 --> 00:02.000\nHi')).toHaveLength(1);
  });
});
