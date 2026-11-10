import { describe, expect, it } from 'vitest';
import { nextLabel, skipLabel } from '../src/content/skipIntro';

describe('nextLabel', () => {
  it('recognises next-episode buttons', () => {
    expect(nextLabel('Next Episode')).toBe('Next episode');
    expect(nextLabel('NEXT EP »')).toBe('Next episode');
    expect(nextLabel('Play next episode')).toBe('Next episode');
    expect(nextLabel('Next episode 23')).toBe('Next episode');
  });
  it('ignores bare "Next" and unrelated text', () => {
    expect(nextLabel('Next')).toBeNull();
    expect(nextLabel('Next page')).toBeNull();
    expect(nextLabel('Next episode will start after the credits roll in a moment')).toBeNull();
  });
});

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
