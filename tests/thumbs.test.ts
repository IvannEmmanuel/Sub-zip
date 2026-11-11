import { describe, expect, it } from 'vitest';
import { parseThumbs, rebaseSprites, thumbAt } from '../src/content/thumbnails';

const SPRITE = `WEBVTT

00:00:00.000 --> 00:00:05.000
sprite.jpg#xywh=0,0,160,90

00:00:05.000 --> 00:00:10.000
sprite.jpg#xywh=160,0,160,90

00:00:10.000 --> 00:00:15.000
sprite.jpg#xywh=320,0,160,90
`;

describe('thumbnails', () => {
  it('parses sprite-sheet tracks and resolves the image against the file URL', () => {
    const cues = parseThumbs(SPRITE, 'https://cdn.example.com/v/1/thumbs.vtt');
    expect(cues).toHaveLength(3);
    expect(cues[1]).toMatchObject({ url: 'https://cdn.example.com/v/1/sprite.jpg', x: 160, y: 0, w: 160, h: 90 });
  });

  it('parses one-image-per-cue tracks', () => {
    const vtt = 'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\n/t/001.jpg\n\n00:00:05.000 --> 00:00:10.000\n/t/002.jpg\n\n00:00:10.000 --> 00:00:15.000\n/t/003.jpg\n';
    const cues = parseThumbs(vtt, 'https://cdn.example.com/a/thumbs.vtt');
    expect(cues.map((c) => c.url)).toEqual(['https://cdn.example.com/t/001.jpg', 'https://cdn.example.com/t/002.jpg', 'https://cdn.example.com/t/003.jpg']);
    expect(cues[0]?.w).toBe(0);
  });

  it('ignores ordinary subtitle files', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n\n00:00:03.000 --> 00:00:04.000\nWorld\n\n00:00:05.000 --> 00:00:06.000\nAgain\n';
    expect(parseThumbs(vtt, 'https://x.test/en.vtt')).toEqual([]);
  });

  it('finds the thumbnail for a time', () => {
    const cues = parseThumbs(SPRITE, 'https://x.test/t.vtt');
    expect(thumbAt(cues, 7)?.x).toBe(160);
    expect(thumbAt(cues, 0)?.x).toBe(0);
    expect(thumbAt(cues, 14.9)?.x).toBe(320);
  });

  it('points sprites at the folder the page really loaded them from', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:05.000
sprite_0.webp#xywh=0,0,160,90

00:00:05.000 --> 00:00:10.000
sprite_0.webp#xywh=160,0,160,90

00:00:10.000 --> 00:00:15.000
sprite_1.webp#xywh=0,0,160,90
`;
    const cues = parseThumbs(vtt, 'https://cdn.test/thumbnails_vtt/abc-0');
    expect(cues[0]?.url).toBe('https://cdn.test/thumbnails_vtt/sprite_0.webp');
    const fixed = rebaseSprites(cues, ['https://cdn.test/thumbnails/abc/sprite_2.webp?x=1']);
    expect(fixed.map((c) => c.url)).toEqual([
      'https://cdn.test/thumbnails/abc/sprite_0.webp',
      'https://cdn.test/thumbnails/abc/sprite_0.webp',
      'https://cdn.test/thumbnails/abc/sprite_1.webp',
    ]);
    // nothing to rebase when the page loaded no sprite yet
    expect(rebaseSprites(cues, [])).toEqual(cues);
  });
});
