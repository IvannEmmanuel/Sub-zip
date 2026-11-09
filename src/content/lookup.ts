import type { BackgroundReply, BackgroundRequest, DefineResult } from '../lib/messaging';

/** Asks the background worker; resolves to null on any failure (offline, extension reloaded, blocked). */
async function ask<T>(request: BackgroundRequest): Promise<T | null> {
  try {
    const reply = (await chrome.runtime.sendMessage(request)) as BackgroundReply<T> | undefined;
    return reply?.ok ? (reply.data ?? null) : null;
  } catch {
    return null;
  }
}

export const translateText = (text: string, to: string) => ask<string>({ type: 'translate', text, to });
export const defineWord = (word: string, to: string) => ask<DefineResult>({ type: 'define', word, to });
