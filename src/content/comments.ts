// Reads the comments (and live chat) the page already shows, so they can be read inside the Picture-in-Picture window.
// Nothing is fetched: this only copies text the page has rendered. YouTube only for now.

export interface CommentEntry {
  author: string;
  text: string;
}

export interface CommentsSnapshot {
  kind: 'live' | 'comments';
  entries: CommentEntry[];
  /** Shown instead of the empty list: why there is nothing to read yet. */
  note?: string;
}

const MAX = 150;
const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export function isYouTube(url: string): boolean {
  try {
    return /(^|\.)youtube\.com$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function chatDocument(doc: Document): Document | null {
  const frame = doc.querySelector<HTMLIFrameElement>('iframe#chatframe, iframe[src*="live_chat"]');
  try {
    return frame?.contentDocument ?? null; // same origin on youtube.com; null when blocked
  } catch {
    return null;
  }
}

function liveChat(chat: Document): CommentEntry[] {
  const out: CommentEntry[] = [];
  for (const el of chat.querySelectorAll('yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer, yt-live-chat-membership-item-renderer')) {
    const text = clean(el.querySelector('#message')?.textContent);
    if (text) out.push({ author: clean(el.querySelector('#author-name')?.textContent), text });
  }
  return out.slice(-MAX);
}

function pageComments(doc: Document): CommentEntry[] {
  const out: CommentEntry[] = [];
  for (const el of doc.querySelectorAll('ytd-comment-thread-renderer, ytd-comment-view-model')) {
    const text = clean(el.querySelector('#content-text')?.textContent);
    if (text) out.push({ author: clean(el.querySelector('#author-text')?.textContent), text });
    if (out.length >= MAX) break;
  }
  return out;
}

// ---- any other site: find a list of comment-like items by their class names -------------------

const COMMENT_HINT = /comment|chat-?message|disqus|reply/i;
const NOT_ITEM = /form|input|editor|textarea|compose|btn|button|count|header|title|toolbar|avatar|login|empty|loading|placeholder|wrapper-?all|container-?all/i;
const AUTHOR_HINT = /author|user-?name|nick|display-?name|poster|commenter|name/i;
const BODY_HINT = /(?:^|[-_ ])(?:text|content|body|message|msg)(?:$|[-_ ])/i;

const cls = (el: Element) => `${typeof el.className === 'string' ? el.className : ''} ${el.id}`;

function genericComments(doc: Document): CommentEntry[] {
  // List items: elements with a comment-ish class that have same-tag, same-class siblings (a repeated row).
  const items: Element[] = [];
  for (const el of doc.querySelectorAll('[class*="comment" i], [id*="comment" i], [class*="disqus" i]')) {
    const c = cls(el);
    if (!COMMENT_HINT.test(c) || NOT_ITEM.test(c) || el.closest('form, textarea')) continue;
    const parent = el.parentElement;
    if (!parent) continue;
    const same = [...parent.children].filter((n) => n.tagName === el.tagName && n.className === el.className);
    if (same.length < 2) continue;
    if (items.some((i) => i.contains(el))) continue; // replies live inside their thread: keep the outer one
    items.push(el);
    if (items.length >= MAX) break;
  }
  const out: CommentEntry[] = [];
  for (const el of items) {
    const authorEl = [...el.querySelectorAll('*')].find((n) => AUTHOR_HINT.test(cls(n)) && clean(n.textContent).length > 0 && clean(n.textContent).length < 60);
    const bodyEl = [...el.querySelectorAll('*')].find((n) => BODY_HINT.test(cls(n)) && !n.contains(authorEl ?? el) && clean(n.textContent).length > 0);
    const author = clean(authorEl?.textContent);
    let text = clean(bodyEl?.textContent);
    if (!text) text = clean(el.textContent).replace(author, '').trim();
    if (text && text.length <= 2000) out.push({ author, text });
  }
  return out;
}

/** What is readable on the page right now: live chat when there is one, otherwise the comments under the video. */
export function readComments(doc: Document): CommentsSnapshot {
  if (!isYouTube(doc.location.href)) return { kind: 'comments', entries: genericComments(doc) };
  const chat = chatDocument(doc);
  if (chat && chat.querySelector('yt-live-chat-item-list-renderer')) {
    const entries = liveChat(chat);
    return { kind: 'live', entries, note: entries.length ? undefined : 'Waiting for chat messages…' };
  }
  if (isLiveStream(doc)) {
    return { kind: 'live', entries: [], note: 'The live chat is closed on the page. Opening it for you… if nothing appears, press "Show chat" on the YouTube page.' };
  }
  return { kind: 'comments', entries: pageComments(doc) };
}

function isLiveStream(doc: Document): boolean {
  return !!doc.querySelector('.html5-video-player.ytp-live, ytd-live-chat-frame');
}

/** YouTube loads comments only after the section scrolls into view; nudge it once so they appear. */
export function loadComments(doc: Document): void {
  // A live stream whose chat is folded away: unfold it so the messages start coming.
  const frame = doc.querySelector('ytd-live-chat-frame');
  if (frame?.hasAttribute('collapsed')) frame.querySelector<HTMLElement>('#show-hide-button button')?.click();
  const section = doc.querySelector('ytd-comments#comments, #comments');
  if (section && !section.querySelector('ytd-comment-thread-renderer')) section.scrollIntoView({ block: 'nearest' });
}
