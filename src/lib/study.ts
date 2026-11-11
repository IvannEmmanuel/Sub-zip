// Things that outlive one Picture-in-Picture window: saved words, "continue where you stopped", transcript export.
// The pure parts (text building, picking what to offer) are separate from the storage calls so they can be unit-tested.

import type { HistoryEntry } from './messaging';

// ---- transcript -------------------------------------------------------------------------------

function srtTime(t: number): string {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

/**
 * The lines shown so far as an .srt file. History only knows when a line appeared, so a line ends when the next one
 * starts (at most `maxLen` seconds later).
 */
export function toSrt(entries: HistoryEntry[], withTranslation = false, maxLen = 6): string {
  const rows = entries.filter((e) => e.text.trim());
  return rows
    .map((e, i) => {
      const next = rows[i + 1];
      const end = Math.max(e.time + 0.8, Math.min(next ? next.time : Infinity, e.time + maxLen));
      const text = withTranslation && e.translated ? `${e.text}\n${e.translated}` : e.text;
      return `${i + 1}\n${srtTime(e.time)} --> ${srtTime(end)}\n${text}\n`;
    })
    .join('\n');
}

// ---- saved words ------------------------------------------------------------------------------

export interface SavedWord {
  word: string;
  translation: string;
  /** Short dictionary text, one entry per part of speech. */
  meaning: string;
  /** The subtitle line the word was in. */
  sentence: string;
  /** Page title and address, so the word can be traced back to where it was heard. */
  source: string;
  url: string;
  /** Video time of the line, seconds. */
  time: number;
  savedAt: number;
  /** Small JPEG of the video frame (data URL), when the site allowed capturing it. */
  shot?: string;
}

const WORDS_KEY = 'savedWords';
const MAX_WORDS = 2000;
const MAX_SHOTS = 200;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function loadWords(): Promise<SavedWord[]> {
  try {
    const got = (await chrome.storage.local.get(WORDS_KEY)) as { [WORDS_KEY]?: SavedWord[] };
    return Array.isArray(got[WORDS_KEY]) ? (got[WORDS_KEY] as SavedWord[]) : [];
  } catch {
    return [];
  }
}

async function storeWords(words: SavedWord[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [WORDS_KEY]: words.slice(-MAX_WORDS) });
  } catch {
    /* extension was reloaded under this page: nothing to save to */
  }
}

/** Saves (or refreshes) a word. Returns the new list. */
export async function saveWord(entry: SavedWord): Promise<SavedWord[]> {
  const words = (await loadWords()).filter((w) => !same(w.word, entry.word));
  words.push(entry);
  // Pictures are big: keep them only on the newest words so the storage quota is never hit.
  words.forEach((w, i) => {
    if (i < words.length - MAX_SHOTS) delete w.shot;
  });
  await storeWords(words);
  return words;
}

export async function removeWord(word: string): Promise<SavedWord[]> {
  const words = (await loadWords()).filter((w) => !same(w.word, word));
  await storeWords(words);
  return words;
}

export async function clearWords(): Promise<void> {
  await storeWords([]);
}

function csvCell(value: string | number): string {
  const text = String(value).replace(/\r?\n/g, ' ');
  return /[",;\t]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Words as CSV: opens in Excel and imports into Anki (Front = word, Back = the rest). */
export function wordsToCsv(words: SavedWord[]): string {
  const head = ['Word', 'Translation', 'Meaning', 'Sentence', 'Source', 'Link'];
  const rows = words.map((w) => [w.word, w.translation, w.meaning, w.sentence, w.source, w.url].map(csvCell).join(','));
  return [head.join(','), ...rows].join('\r\n');
}

// ---- continue where you stopped ---------------------------------------------------------------

export interface ResumePoint {
  t: number;
  duration: number;
  at: number;
}

export type ResumeMap = Record<string, ResumePoint>;

/** Only long videos are worth remembering (not shorts / reels), and not the last minute (the credits). */
export const RESUME_MIN_DURATION = 600;
const RESUME_MIN_TIME = 30;
const RESUME_TAIL = 60;
const MAX_RESUME = 150;

/** The place to offer, or null when there is nothing to offer. */
export function resumeOffer(saved: ResumePoint | undefined, now: number, duration: number): number | null {
  if (!saved || !Number.isFinite(duration) || duration < RESUME_MIN_DURATION) return null;
  if (saved.t < RESUME_MIN_TIME || saved.t > duration - RESUME_TAIL) return null;
  if (now > saved.t - 20) return null; // the site already resumed, or the viewer is past that point
  return saved.t;
}

/** Records a position (or forgets the video when it is nearly over). Returns the new map, trimmed to the newest entries. */
export function withResume(map: ResumeMap, key: string, t: number, duration: number, at = Date.now()): ResumeMap {
  const next: ResumeMap = { ...map };
  if (!Number.isFinite(duration) || duration < RESUME_MIN_DURATION || t < RESUME_MIN_TIME) return next;
  if (t > duration - RESUME_TAIL) delete next[key];
  else next[key] = { t: Math.floor(t), duration: Math.floor(duration), at };
  const keys = Object.keys(next);
  if (keys.length > MAX_RESUME) {
    keys.sort((a, b) => (next[a]?.at ?? 0) - (next[b]?.at ?? 0));
    for (const k of keys.slice(0, keys.length - MAX_RESUME)) delete next[k];
  }
  return next;
}

const RESUME_KEY = 'resumePoints';

/** The address without #fragment: the same episode, however the viewer arrived. */
export function resumeKey(href: string): string {
  return href.split('#')[0] ?? href;
}

export async function loadResume(): Promise<ResumeMap> {
  try {
    const got = (await chrome.storage.local.get(RESUME_KEY)) as { [RESUME_KEY]?: ResumeMap };
    return got[RESUME_KEY] && typeof got[RESUME_KEY] === 'object' ? (got[RESUME_KEY] as ResumeMap) : {};
  } catch {
    return {};
  }
}

export async function rememberPosition(key: string, t: number, duration: number): Promise<void> {
  try {
    await chrome.storage.local.set({ [RESUME_KEY]: withResume(await loadResume(), key, t, duration) });
  } catch {
    /* see storeWords */
  }
}

// ---- saving a file ----------------------------------------------------------------------------

/** Downloads text as a file. `doc` is the document the click happened in (the PiP window has the user activation). */
export function downloadText(doc: Document, name: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: `${mime};charset=utf-8` }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeName(title: string, fallback: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return cleaned || fallback;
}

/** Downloads a picture or other binary blob. */
export function downloadBlob(doc: Document, name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
