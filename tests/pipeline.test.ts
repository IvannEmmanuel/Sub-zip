import { afterEach, describe, expect, it, vi } from 'vitest';
import { composeLines, SubtitlePipeline } from '../src/content/subtitlePipeline';
import { DEFAULT_SETTINGS, type Settings } from '../src/lib/settings';
import type { Line } from '../src/lib/messaging';

afterEach(() => vi.unstubAllGlobals());

describe('composeLines', () => {
  it('shows only the original when translation is off', () => {
    expect(composeLines('Hi\nthere', 'Hola', 'off')).toEqual([
      { text: 'Hi', tr: false },
      { text: 'there', tr: false },
    ]);
  });

  it('replaces the original in translated mode, and falls back while the translation is pending', () => {
    expect(composeLines('Hi', 'Hola', 'translated')).toEqual([{ text: 'Hola', tr: false }]);
    expect(composeLines('Hi', '', 'translated')).toEqual([{ text: 'Hi', tr: false }]);
  });

  it('stacks original then translation in dual mode', () => {
    expect(composeLines('Hi', 'Hola', 'dual')).toEqual([
      { text: 'Hi', tr: false },
      { text: 'Hola', tr: true },
    ]);
  });

  it('shows nothing for an empty cue', () => {
    expect(composeLines('', 'x', 'dual')).toEqual([]);
  });
});

describe('SubtitlePipeline', () => {
  const video = { currentTime: 12 } as HTMLVideoElement;
  const settings = (patch: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

  it('records history without consecutive duplicates', () => {
    const shown: Line[][] = [];
    const p = new SubtitlePipeline(video, settings({}), (l) => shown.push(l));
    p.push('One');
    p.push('');
    p.push('One');
    p.push('Two');
    expect(p.history().map((h) => h.text)).toEqual(['One', 'Two']);
    expect(p.history()[0]?.time).toBe(12);
  });

  it('adds the translation to the display and to history', async () => {
    const send = vi.fn(async () => ({ ok: true, data: 'Hola' }));
    vi.stubGlobal('chrome', { runtime: { sendMessage: send } });
    let last: Line[] = [];
    const p = new SubtitlePipeline(video, settings({ translateMode: 'dual', translateTo: 'es' }), (l) => (last = l));
    p.push('Hello');
    expect(last).toEqual([{ text: 'Hello', tr: false }]); // original first, never blank
    await vi.waitFor(() => expect(last).toEqual([{ text: 'Hello', tr: false }, { text: 'Hola', tr: true }]));
    expect(p.history()[0]?.translated).toBe('Hola');
    expect(send).toHaveBeenCalledWith({ type: 'translate', text: 'Hello', to: 'es' });
  });

  it('does not call the translator while off', () => {
    const send = vi.fn();
    vi.stubGlobal('chrome', { runtime: { sendMessage: send } });
    new SubtitlePipeline(video, settings({ translateMode: 'off' }), () => {}).push('Hello');
    expect(send).not.toHaveBeenCalled();
  });

  it('forgets history when the video changes', () => {
    const p = new SubtitlePipeline(video, settings({}), () => {});
    p.push('One');
    p.setVideo({ currentTime: 0 } as HTMLVideoElement);
    expect(p.history()).toEqual([]);
  });
});
