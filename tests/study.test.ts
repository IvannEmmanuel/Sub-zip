import { describe, expect, it } from 'vitest';
import { resumeOffer, safeName, toSrt, withResume, wordsToCsv, type SavedWord } from '../src/lib/study';

describe('transcript export', () => {
  it('writes an .srt where each line ends when the next starts', () => {
    const srt = toSrt([
      { time: 1, text: 'Hello', translated: '' },
      { time: 4.5, text: 'World', translated: 'Mundo' },
    ]);
    expect(srt).toBe('1\n00:00:01,000 --> 00:00:04,500\nHello\n\n2\n00:00:04,500 --> 00:00:10,500\nWorld\n');
  });

  it('adds the translation only when asked', () => {
    const entries = [{ time: 0, text: 'Hi', translated: 'Hola' }];
    expect(toSrt(entries)).not.toContain('Hola');
    expect(toSrt(entries, true)).toContain('Hi\nHola');
  });

  it('caps long gaps and skips empty lines', () => {
    const srt = toSrt([
      { time: 10, text: 'a', translated: '' },
      { time: 12, text: '  ', translated: '' },
      { time: 100, text: 'b', translated: '' },
    ]);
    expect(srt).toContain('00:00:10,000 --> 00:00:16,000');
    expect(srt.match(/-->/g)).toHaveLength(2);
  });
});

describe('saved words', () => {
  const word: SavedWord = {
    word: 'hola',
    translation: 'hello',
    meaning: 'interjection: a greeting',
    sentence: 'Hola, "amigo"\nhow are you?',
    source: 'Some show, ep 1',
    url: 'https://x.test/watch?v=1',
    time: 12,
    savedAt: 0,
  };
  it('quotes CSV cells that contain commas, quotes or line breaks', () => {
    const csv = wordsToCsv([word]);
    expect(csv.split('\r\n')).toHaveLength(2);
    expect(csv).toContain('"Hola, ""amigo"" how are you?"');
    expect(csv).toContain('"Some show, ep 1"');
  });
});

describe('continue where you stopped', () => {
  const hour = 3600;
  it('offers a saved spot only for long videos the viewer is not already past', () => {
    const saved = { t: 1200, duration: hour, at: 0 };
    expect(resumeOffer(saved, 0, hour)).toBe(1200);
    expect(resumeOffer(saved, 1190, hour)).toBeNull(); // site resumed by itself
    expect(resumeOffer(saved, 0, 200)).toBeNull(); // a short clip
    expect(resumeOffer({ ...saved, t: 10 }, 0, hour)).toBeNull(); // barely started
    expect(resumeOffer({ ...saved, t: hour - 20 }, 0, hour)).toBeNull(); // the credits
    expect(resumeOffer(undefined, 0, hour)).toBeNull();
  });

  it('records positions, forgets finished videos, ignores shorts', () => {
    let map = withResume({}, 'a', 500, hour, 1);
    expect(map.a?.t).toBe(500);
    expect(withResume(map, 'b', 500, 120)).toEqual(map); // short
    map = withResume(map, 'a', hour - 10, hour);
    expect(map.a).toBeUndefined();
  });

  it('keeps only the newest entries', () => {
    let map = {};
    for (let i = 0; i < 160; i++) map = withResume(map, `k${i}`, 100, hour, i);
    expect(Object.keys(map)).toHaveLength(150);
    expect('k0' in map).toBe(false);
    expect('k159' in map).toBe(true);
  });
});

describe('file names', () => {
  it('removes characters Windows does not allow', () => {
    expect(safeName('Show: Ep 1 / "Pilot"?', 'x')).toBe('Show Ep 1 Pilot');
    expect(safeName('   ', 'fallback')).toBe('fallback');
  });
});
