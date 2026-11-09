import type { ActionResult, BackgroundReply, BackgroundRequest, DefineResult } from '../lib/messaging';
import { sendToTab } from '../lib/messaging';

function flashBadge(tabId: number, text: string): void {
  void chrome.action.setBadgeBackgroundColor({ color: '#F97316', tabId });
  void chrome.action.setBadgeText({ text, tabId });
  setTimeout(() => void chrome.action.setBadgeText({ text: '', tabId }), 3500);
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-pip') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;

  const result = await sendToTab<ActionResult>(tab.id, { type: 'toggle-pip' });
  // "!" = no video found, or Chrome refused to open the window without a user gesture on the page.
  if (!result || !result.ok) flashBadge(tab.id, '!');
});

// --- translation / dictionary ------------------------------------------------------------------
// Done here (not in the page) because the worker has host access and is not bound by the page's CORS or CSP.
// Only text the user chose to translate (or a single clicked word) is sent: to Google Translate, then MyMemory if Google
// refuses (it rate-limits this unofficial endpoint), and to dictionaryapi.dev for English words.

type GtResponse = [Array<[string, ...unknown[]]> | null, Array<[string, string[], ...unknown[]]> | null, string?];

const cache = new Map<string, unknown>();
function remember<T>(key: string, value: T): T {
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  cache.set(key, value);
  return value;
}

async function gt(q: string, to: string, extra = ''): Promise<GtResponse> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(to)}&dt=t${extra}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`translate ${res.status}`);
  return (await res.json()) as GtResponse;
}

/** Fallback translator: free, no key, detects the source language itself. */
async function mymemory(q: string, to: string): Promise<{ text: string; from: string }> {
  const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${encodeURIComponent(`Autodetect|${to}`)}`);
  if (!res.ok) throw new Error(`mymemory ${res.status}`);
  const json = (await res.json()) as { responseStatus?: number | string; responseData?: { translatedText?: string; detectedLanguage?: string } };
  const text = json.responseData?.translatedText?.trim();
  if (Number(json.responseStatus) !== 200 || !text) throw new Error('mymemory refused');
  return { text, from: json.responseData?.detectedLanguage ?? '' };
}

async function translate(text: string, to: string): Promise<string> {
  const q = text.slice(0, 1000);
  const key = `t|${to}|${q}`;
  if (cache.has(key)) return cache.get(key) as string;
  let out: string;
  try {
    out = ((await gt(q, to))[0] ?? []).map((s) => s[0]).join('').trim();
    if (!out) throw new Error('empty');
  } catch {
    out = (await mymemory(q.slice(0, 480), to)).text; // MyMemory caps a request at ~500 characters
  }
  return remember(key, out);
}

interface DictApiEntry {
  meanings?: { partOfSpeech?: string; definitions?: { definition?: string }[] }[];
}

async function define(word: string, to: string): Promise<DefineResult> {
  const key = `d|${to}|${word}`;
  if (cache.has(key)) return cache.get(key) as DefineResult;

  let result: DefineResult;
  try {
    const json = await gt(word, to, '&dt=bd');
    result = {
      word,
      translation: (json[0] ?? []).map((s) => s[0]).join('').trim(),
      from: json[2] ?? '',
      // Other translations grouped by part of speech (works for any language pair).
      meanings: (json[1] ?? []).slice(0, 3).map(([pos, terms]) => ({ pos, defs: terms.slice(0, 5) })),
    };
  } catch {
    const fallback = await mymemory(word, to);
    result = { word, translation: fallback.text, from: fallback.from, meanings: [] };
  }
  const from = result.from;

  if (from === 'en') {
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`);
      if (res.ok) {
        const entries = (await res.json()) as DictApiEntry[];
        const meanings = (entries[0]?.meanings ?? []).slice(0, 3).map((m) => ({
          pos: m.partOfSpeech ?? '',
          defs: (m.definitions ?? []).slice(0, 2).map((d) => d.definition ?? '').filter(Boolean),
        }));
        if (meanings.length) result.meanings = meanings;
      }
    } catch {
      /* dictionary site unreachable: keep the translation-only result */
    }
  }
  return remember(key, result);
}

chrome.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse: (r: BackgroundReply) => void) => {
  if (message?.type === 'translate') {
    translate(message.text, message.to).then(
      (data) => sendResponse({ ok: true, data }),
      () => sendResponse({ ok: false }),
    );
    return true;
  }
  if (message?.type === 'define') {
    define(message.word, message.to).then(
      (data) => sendResponse({ ok: true, data }),
      () => sendResponse({ ok: false }),
    );
    return true;
  }
  return false;
});
