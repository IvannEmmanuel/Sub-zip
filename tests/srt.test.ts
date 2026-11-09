import { describe, expect, it } from 'vitest';
import { parseSubtitles } from '../src/lib/srt';
import { findActive, type Cue } from '../src/lib/cues';

describe('parseSubtitles', () => {
  it('parses SRT with CRLF, BOM, numbering, tags and ASS overrides', () => {
    const srt =
      '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\n<i>Hello</i> {\\an8}world\r\n\r\n' +
      '2\r\n00:01:00,250 --> 00:01:02,000\r\nLine one\r\nLine two\r\n';
    expect(parseSubtitles(srt)).toEqual([
      { start: 1, end: 3.5, text: 'Hello world' },
      { start: 60.25, end: 62, text: 'Line one\nLine two' },
    ]);
  });

  it('parses WebVTT, skipping header/NOTE blocks and short timestamps', () => {
    const vtt =
      'WEBVTT\n\nNOTE a comment\n\ncue-1\n00:01.000 --> 00:02.000 align:start\n&lt;ok&gt; &amp; fine\n\n' +
      '01:00:00.000 --> 01:00:01.000\nHour mark';
    expect(parseSubtitles(vtt)).toEqual([
      { start: 1, end: 2, text: '<ok> & fine' },
      { start: 3600, end: 3601, text: 'Hour mark' },
    ]);
  });

  it('sorts out-of-order cues and drops empty or inverted ones', () => {
    const srt =
      '1\n00:00:10,000 --> 00:00:11,000\nlate\n\n2\n00:00:01,000 --> 00:00:02,000\nearly\n\n' +
      '3\n00:00:05,000 --> 00:00:04,000\ninverted\n\n4\n00:00:06,000 --> 00:00:07,000\n<i></i>\n';
    expect(parseSubtitles(srt).map((c) => c.text)).toEqual(['early', 'late']);
  });
});

describe('findActive', () => {
  const cues: Cue[] = [
    { start: 1, end: 4, text: 'A' },
    { start: 2, end: 3, text: 'B' },
    { start: 6, end: 8, text: 'C' },
  ];

  it('returns empty before, between and after cues', () => {
    expect(findActive(cues, 0.5)).toBe('');
    expect(findActive(cues, 5)).toBe('');
    expect(findActive(cues, 9)).toBe('');
  });

  it('returns overlapping cues in start order', () => {
    expect(findActive(cues, 2.5)).toBe('A\nB');
    expect(findActive(cues, 3.5)).toBe('A');
  });

  it('treats start as inclusive and end as exclusive', () => {
    expect(findActive(cues, 6)).toBe('C');
    expect(findActive(cues, 8)).toBe('');
  });

  it('handles an empty list', () => {
    expect(findActive([], 1)).toBe('');
  });
});
