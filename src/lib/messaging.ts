import type { Cue } from './cues';

export type SourceId = 'tracks' | 'dom' | 'file' | 'off';

export type Message =
  | { type: 'status' }
  | { type: 'toggle-pip' }
  | { type: 'set-source'; source: SourceId | 'auto' }
  | { type: 'load-cues'; name: string; cues: Cue[] }
  | { type: 'history' }
  | { type: 'seek'; time: number };

/** One subtitle line as shown: `tr` marks a translated line (shown in a different color in dual mode). */
export interface Line {
  text: string;
  tr: boolean;
}

export interface HistoryEntry {
  /** Video time (seconds) when the line appeared. */
  time: number;
  text: string;
  translated: string;
}

export interface HistoryReply {
  entries: HistoryEntry[];
}

/** Requests the content script sends to the background worker (it can reach the translate / dictionary sites). */
export type BackgroundRequest =
  | { type: 'translate'; text: string; to: string }
  | { type: 'define'; word: string; to: string };

export interface BackgroundReply<T = unknown> {
  ok: boolean;
  data?: T;
}

export interface DefineResult {
  word: string;
  /** The word translated into the chosen language. */
  translation: string;
  /** Detected language of the word. */
  from: string;
  meanings: { pos: string; defs: string[] }[];
}

export interface Status {
  hasVideo: boolean;
  pipOpen: boolean;
  /** Document PiP API present in this frame. */
  supported: boolean;
  available: SourceId[];
  active: SourceId;
  fileName: string | null;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  status: Status;
}

/**
 * Re-injects the content script into a tab (all frames). Needed for pages that were already open when the extension
 * was installed or reloaded: Chrome does not add scripts to them until they are refreshed. Safe to call repeatedly,
 * the script ignores a second injection into a frame where it is already running.
 */
export async function ensureContentScript(tabId: number): Promise<void> {
  const files = chrome.runtime.getManifest().content_scripts?.[0]?.js;
  if (!files?.length) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files });
  } catch {
    /* restricted page (chrome://, web store) or no access: nothing to do */
  }
}

/** Sends a message to the tab; resolves to the answering frame's reply (the one that has a video). */
export async function sendToTab<T>(tabId: number, message: Message): Promise<T | null> {
  try {
    return ((await chrome.tabs.sendMessage(tabId, message)) as T | undefined) ?? null;
  } catch {
    return null; // no content script / no frame with a video answered
  }
}
