import { describe, expect, it } from 'vitest';
import { findActive } from '../src/lib/cues';
import { fmtDelay } from '../src/lib/delay';

describe('subtitle delay', () => {
  const cues = [{ start: 10, end: 12, text: 'hello' }];
  it('a later delay shows the line later', () => {
    expect(findActive(cues, 10.5 - 1)).toBe('');
    expect(findActive(cues, 11.5 - 1)).toBe('hello');
  });
  it('an earlier delay shows the line sooner', () => {
    expect(findActive(cues, 9.5 + 1)).toBe('hello');
  });
  it('formats with a sign', () => {
    expect(fmtDelay(0)).toBe('0.0s');
    expect(fmtDelay(0.5)).toBe('+0.5s');
    expect(fmtDelay(-1.2)).toBe("-1.2s");
  });
});
