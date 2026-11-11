import type { BackgroundReply, BackgroundRequest, DefineResult } from '../lib/messaging';

let problem = '';

/** Why the last lookup failed, in words a viewer can act on. */
export function lookupProblem(): string {
  return problem;
}

/** Asks the background worker; resolves to null on any failure (offline, extension reloaded, blocked). */
async function ask<T>(request: BackgroundRequest): Promise<T | null> {
  problem = '';
  try {
    const reply = (await chrome.runtime.sendMessage(request)) as BackgroundReply<T> | undefined;
    if (reply?.ok) return reply.data ?? null;
    problem = 'The translation services did not answer. A content blocker (Brave Shields, an ad blocker, a VPN or firewall) may be blocking translate.googleapis.com, or they are busy: try again in a moment.';
    return null;
  } catch {
    // sendMessage throws when this page still runs the code of an extension that has since been reloaded or updated.
    problem = 'Sub PiP was updated or reloaded. Close this Picture-in-Picture window, refresh the page, and open it again.';
    return null;
  }
}

export const translateText = (text: string, to: string) => ask<string>({ type: 'translate', text, to });
export const defineWord = (word: string, to: string) => ask<DefineResult>({ type: 'define', word, to });
