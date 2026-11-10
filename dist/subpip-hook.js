// Runs inside the page itself (not the extension's sandbox). Players such as ArtPlayer + libass / JASSUB / SubtitlesOctopus
// hand their .ass subtitle file to a Web Worker that draws the captions on a canvas. We cannot see inside that worker,
// but we can see the message that tells it which file to use, and fetch that same file. It is only passed on to the
// extension (as an attribute + event on <html>); nothing is sent anywhere else.
(() => {
  if (window.__subpipHook) return;
  window.__subpipHook = true;

  const LOOKS_LIKE_SUBS = /\[Script Info\]|^\s*Dialogue\s*:|^WEBVTT|-->/m;
  const publish = (text) => {
    try {
      if (typeof text !== 'string' || text.length < 20 || text.length > 8e6 || !LOOKS_LIKE_SUBS.test(text)) return;
      document.documentElement.setAttribute('data-subpip-sub', text);
      window.dispatchEvent(new CustomEvent('subpip-sub'));
    } catch (e) {}
  };
  const load = (u) => {
    try {
      const url = new URL(u, document.baseURI).href;
      fetch(url).then((r) => (r.ok ? r.text() : '')).then(publish).catch(() => {});
    } catch (e) {}
  };
  const inspect = (m) => {
    try {
      if (!m || typeof m !== 'object' || Array.isArray(m)) return;
      const t = String(m.target ?? '');
      if (!/init|track/i.test(t)) return;
      if (typeof m.subContent === 'string') publish(m.subContent);
      else if (typeof m.content === 'string') publish(m.content);
      if (typeof m.subUrl === 'string' && m.subUrl) load(m.subUrl);
      else if (typeof m.url === 'string' && /\.(?:ass|ssa|vtt|srt)(?:[?#]|$)/i.test(m.url)) load(m.url);
    } catch (e) {}
  };

  const original = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (message, ...rest) {
    inspect(message);
    return original.call(this, message, ...rest);
  };
})();
