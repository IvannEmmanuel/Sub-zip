import { describe, expect, it } from 'vitest';
import { skipLabel } from '../src/content/skipIntro';

describe('skipLabel', () => {
  it('recognises skip buttons in common spellings', () => {
    expect(skipLabel('Skip Intro')).toBe('Skip intro');
    expect(skipLabel('SKIP INTRO »')).toBe('Skip intro');
    expect(skipLabel('  skip   the   opening ')).toBe('Skip opening');
    expect(skipLabel('Skip OP')).toBe('Skip opening');
    expect(skipLabel('Skip ED')).toBe('Skip ending');
    expect(skipLabel('Skip Recap')).toBe('Skip recap');
    expect(skipLabel('Skip Credits')).toBe('Skip credits');
    expect(skipLabel('Skip Ads')).toBe('Skip ads');
    expect(skipLabel('Skip')).toBe('Skip');
    expect(skipLabel('Skip Intro ⏭')).toBe('Skip intro');
    expect(skipLabel('Skip Intro >>')).toBe('Skip intro');
    expect(skipLabel('Skip intro →')).toBe('Skip intro');
  });

  it('ignores toggles, links and ordinary text that merely contain "skip"', () => {
    expect(skipLabel('AUTO SKIP')).toBeNull();
    expect(skipLabel('Auto skip intro')).toBeNull();
    expect(skipLabel('Skip to main content')).toBeNull();
    expect(skipLabel('Skipping rope tutorial')).toBeNull();
    expect(skipLabel('')).toBeNull();
    expect(skipLabel('This is a very long caption that mentions skip intro somewhere')).toBeNull();
  });
});
