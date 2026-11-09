import type { HistoryEntry, Line } from '../lib/messaging';
import type { Settings, TranslateMode } from '../lib/settings';
import { translateText } from './lookup';

const MAX_HISTORY = 100;
const MAX_CACHE = 500;
const cache = new Map<string, string>();

function toLines(text: string, tr: boolean): Line[] {
  return text
    .split('\n')
    .filter(Boolean)
    .map((t) => ({ text: t, tr }));
}

/** What to display for the current cue, given the translation mode. Falls back to the original while translating. */
export function composeLines(original: string, translated: string, mode: TranslateMode): Line[] {
  if (!original || mode === 'off') return toLines(original, false);
  if (mode === 'translated') return toLines(translated || original, false);
  return [...toLines(original, false), ...toLines(translated, true)];
}

/**
 * Sits between a subtitle source and the PiP window: records history, adds translation / dual subtitles,
 * and hands the final lines to whoever draws them (the overlay or the canvas).
 */
export class SubtitlePipeline {
  private entries: HistoryEntry[] = [];
  private original = '';
  private translated = '';
  private token = 0;

  constructor(
    private video: HTMLVideoElement,
    private settings: Settings,
    private readonly onShow: (lines: Line[]) => void,
  ) {}

  history(): HistoryEntry[] {
    return this.entries;
  }

  /** The PiP followed to another video: start a fresh history. */
  setVideo(video: HTMLVideoElement): void {
    this.video = video;
    this.entries = [];
    this.push('');
  }

  applySettings(next: Settings): void {
    const changed = next.translateMode !== this.settings.translateMode || next.translateTo !== this.settings.translateTo;
    this.settings = next;
    if (changed) this.refresh();
  }

  push(text: string): void {
    this.original = text;
    if (text && text !== this.entries[this.entries.length - 1]?.text) {
      this.entries.push({ time: this.video.currentTime, text, translated: '' });
      if (this.entries.length > MAX_HISTORY) this.entries.shift();
    }
    this.refresh();
  }

  private refresh(): void {
    const token = ++this.token;
    const { translateMode: mode, translateTo: to } = this.settings;
    const text = this.original;
    this.translated = '';
    this.show();
    if (!text || mode === 'off') return;

    const key = `${to}|${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) {
      this.translated = hit;
      this.fillHistory(text, hit);
      this.show();
      return;
    }
    void translateText(text, to).then((tr) => {
      if (!tr) return;
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
      cache.set(key, tr);
      this.fillHistory(text, tr);
      if (token === this.token) {
        this.translated = tr;
        this.show();
      }
    });
  }

  private fillHistory(text: string, translated: string): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i] as HistoryEntry;
      if (entry.text === text) {
        entry.translated = translated;
        return;
      }
    }
  }

  private show(): void {
    this.onShow(composeLines(this.original, this.translated, this.settings.translateMode));
  }
}
