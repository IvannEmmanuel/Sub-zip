import { applySubtitleVars } from '../lib/subtitleStyle';
import type { HistoryEntry, Line } from '../lib/messaging';
import type { Settings, TranslateMode } from '../lib/settings';
import { iconSvg, type IconName } from './icons';
import { defineWord } from './lookup';

const CSS = /* css */ `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #000; overflow: hidden;
  font-family: system-ui, "Segoe UI", Roboto, sans-serif; }

.stage { position: relative; width: 100%; height: 100%; container-type: size; background: #000; outline: none; }
.stage > video { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important;
  max-width: none !important; max-height: none !important; object-fit: contain !important; transform: none !important; }
.stage.hide-cursor { cursor: none; }

/* Subtitles: sized from the PiP window width so they stay readable when it is resized. */
.stage { --bar-h: 84px; }
.subs { position: absolute; left: 0; right: 0; display: flex; flex-direction: column; align-items: center;
  gap: .14em; padding: 0 5%; pointer-events: none; text-align: center; line-height: 1.32; font-weight: 600;
  font-family: var(--sub-font); font-size: clamp(17px, calc(var(--sub-scale) * 5.6cqw), 84px);
  transition: transform .18s ease; }
.stage.pos-bottom .subs { bottom: var(--sub-offset); }
.stage.pos-top .subs { top: var(--sub-offset); }
.stage.pos-bottom.controls .subs { transform: translateY(calc(var(--bar-h) * -1)); }
.stage.subs-off .subs { display: none; }
.cue.tr { color: #FDE68A; }
.w { pointer-events: auto; cursor: pointer; border-radius: .15em; }
.w:hover { background: rgba(96,165,250,.5); }

/* Word lookup card and history panel. */
.dict { position: absolute; left: 50%; bottom: calc(var(--bar-h) + 10px); z-index: 5; width: min(92%, 420px);
  max-height: 55%; overflow: auto; transform: translateX(-50%); padding: 10px 12px; border-radius: 10px;
  background: rgba(17,24,39,.97); border: 1px solid #1f2937; box-shadow: 0 8px 24px rgba(0,0,0,.5);
  color: #E5E7EB; font-size: 13px; line-height: 1.45; }
.dict[hidden], .hist[hidden] { display: none; }
.dict h3 { margin: 0; padding-right: 28px; font-size: 16px; color: #fff; }
.dict .tr1 { margin: 2px 0 4px; color: #93C5FD; font-size: 14px; }
.dict .pos { margin-top: 6px; color: #9CA3AF; font-style: italic; }
.dict ul { margin: 2px 0 0; padding-left: 18px; }
.dict .x { position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; }
.dict .muted { color: #9CA3AF; }
.hist { position: absolute; inset: 0 0 var(--bar-h) 0; z-index: 4; overflow: auto; padding: 10px;
  background: rgba(3,7,18,.93); }
.hist h3 { margin: 0 0 6px; padding: 0 8px; font-size: 12px; font-weight: 600; letter-spacing: .06em;
  text-transform: uppercase; color: #9CA3AF; }
.hist-row { display: flex; gap: 10px; width: 100%; padding: 6px 8px; border: 0; border-radius: 6px;
  background: transparent; color: #E5E7EB; font: inherit; font-size: 13px; line-height: 1.4; text-align: left;
  cursor: pointer; }
.hist-row:hover, .hist-row:focus-visible { background: rgba(255,255,255,.1); outline: none; }
.hist-row time { flex: none; color: #60A5FA; font-variant-numeric: tabular-nums; }
.hist-row .tr { display: block; color: #FDE68A; }
.hist .empty { padding: 8px; color: #9CA3AF; font-size: 13px; }
.cue { max-width: 100%; padding: .05em .45em; border-radius: .3em; white-space: pre-wrap;
  overflow-wrap: anywhere; background: var(--sub-bg); color: var(--sub-color); text-shadow: var(--sub-shadow);
  -webkit-box-decoration-break: clone; box-decoration-break: clone; }

/* Control bar: seek row on top, buttons below. */
.bar { position: absolute; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; gap: 2px;
  padding: 28px 10px 8px; background: linear-gradient(to top, rgba(11,15,23,.95) 35%, rgba(11,15,23,0));
  opacity: 0; pointer-events: none; transition: opacity .18s ease; }
.stage.controls .bar { opacity: 1; pointer-events: auto; }
.seekrow { display: flex; align-items: center; gap: 10px; padding: 0 4px; }
.time { min-width: 0; color: #E5E7EB; font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.seek { flex: 1; min-width: 0; height: 20px; margin: 0; background: transparent; cursor: pointer;
  -webkit-appearance: none; appearance: none; --p: 0%; }
.seek::-webkit-slider-runnable-track { height: 4px; border-radius: 2px;
  background: linear-gradient(to right, #60A5FA var(--p), rgba(255,255,255,.28) var(--p)); }
.seek::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; margin-top: -4px;
  border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px #2563EB; }
.seek:focus-visible { outline: 2px solid #60A5FA; outline-offset: 2px; border-radius: 4px; }
.row { display: flex; align-items: center; gap: 2px; }
.vol { display: flex; align-items: center; flex: none; border-radius: 8px; }
.volume { width: 0; height: 20px; margin: 0; opacity: 0; background: transparent; cursor: pointer;
  -webkit-appearance: none; appearance: none; --p: 100%;
  transition: width .18s ease, margin .18s ease, opacity .18s ease; }
.vol:hover .volume, .vol:focus-within .volume { width: 76px; margin: 0 8px 0 2px; opacity: 1; }
.volume::-webkit-slider-runnable-track { height: 4px; border-radius: 2px;
  background: linear-gradient(to right, #60A5FA var(--p), rgba(255,255,255,.28) var(--p)); }
.volume::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; margin-top: -4px;
  border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px #2563EB; }
.volume:focus-visible { outline: 2px solid #60A5FA; outline-offset: 2px; border-radius: 4px; }
.spacer { flex: 1; }
.btn { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 36px; height: 36px;
  padding: 0; border: 0; border-radius: 8px; background: transparent; color: #E5E7EB; cursor: pointer;
  transition: background-color .15s ease, color .15s ease; }
.btn:hover { background: rgba(255,255,255,.14); color: #fff; }
.btn:focus-visible { outline: 2px solid #60A5FA; outline-offset: 1px; }
.btn[aria-pressed="false"] { color: #9CA3AF; }
.btn.primary { border-radius: 50%; background: #2563EB; color: #fff; }
.btn.primary:hover { background: #1D4ED8; }
.sep { flex: none; width: 1px; height: 20px; margin: 0 4px; background: rgba(255,255,255,.18); }
@container (max-width: 440px) { .btn.optional, .sep.optional { display: none; } }
@media (prefers-reduced-motion: reduce) { .subs, .bar, .btn, .volume { transition: none; } }
`;

interface ButtonSpec {
  id: string;
  label: string;
  icon: IconName;
  optional?: boolean;
  primary?: boolean;
}

export interface OverlayHandlers {
  update(patch: Partial<Settings>): void;
  close(): void;
  history(): HistoryEntry[];
  seekTo(time: number): void;
}

export interface Overlay {
  stage: HTMLElement;
  setLines(lines: Line[]): void;
  applySettings(settings: Settings): void;
  destroy(): void;
}

const IDLE_MS = 2500;
const MODES: TranslateMode[] = ['off', 'dual', 'translated'];
const MODE_LABEL: Record<TranslateMode, string> = { off: 'off', dual: 'original + translation', translated: 'translation only' };

const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;

function fmtTime(t: number): string {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + `:${String(s).padStart(2, '0')}`;
}

export function buildOverlay(
  win: Window,
  video: HTMLVideoElement,
  initial: Settings,
  handlers: OverlayHandlers,
): Overlay {
  const doc = win.document;
  let settings = initial;

  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.append(style);
  doc.title = 'Sub PiP';

  const stage = doc.createElement('div');
  stage.className = 'stage controls';
  stage.tabIndex = -1;

  const subs = doc.createElement('div');
  subs.className = 'subs';
  subs.setAttribute('aria-hidden', 'true'); // the video's own audio/captions are the source of truth

  const dict = doc.createElement('div');
  dict.className = 'dict';
  dict.hidden = true;
  dict.setAttribute('role', 'dialog');
  dict.setAttribute('aria-label', 'Word lookup');

  const hist = doc.createElement('div');
  hist.className = 'hist';
  hist.hidden = true;
  hist.setAttribute('aria-label', 'Subtitle history');

  const bar = doc.createElement('div');
  bar.className = 'bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Playback and subtitle controls');

  const seekRow = doc.createElement('div');
  seekRow.className = 'seekrow';
  const seekBar = doc.createElement('input');
  seekBar.type = 'range';
  seekBar.className = 'seek';
  seekBar.min = '0';
  seekBar.max = '1000';
  seekBar.step = '1';
  seekBar.setAttribute('aria-label', 'Seek');
  const timeLabel = doc.createElement('span');
  timeLabel.className = 'time';
  seekRow.append(seekBar, timeLabel);

  const row = doc.createElement('div');
  row.className = 'row';
  bar.append(seekRow, row);

  const buttons = new Map<string, HTMLButtonElement>();
  const addButton = (spec: ButtonSpec, onClick: () => void) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = ['btn', spec.optional ? 'optional' : '', spec.primary ? 'primary' : ''].filter(Boolean).join(' ');
    b.setAttribute('aria-label', spec.label);
    b.title = spec.label;
    b.innerHTML = iconSvg(spec.icon);
    b.addEventListener('click', onClick);
    buttons.set(spec.id, b);
    row.append(b);
    return b;
  };
  const addSpacer = () => {
    const s = doc.createElement('span');
    s.className = 'spacer';
    row.append(s);
  };
  const addSep = () => {
    const s = doc.createElement('span');
    s.className = 'sep optional';
    row.append(s);
  };

  const togglePlay = () => (video.paused ? void video.play().catch(() => {}) : video.pause());
  const seek = (delta: number) => {
    video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + delta));
  };
  const toggleMute = () => (video.muted = !video.muted);
  const toggleSubs = () => {
    const off = stage.classList.toggle('subs-off');
    const cc = buttons.get('cc');
    cc?.setAttribute('aria-pressed', String(!off));
  };

  addButton({ id: 'play', label: 'Play / pause', icon: 'pause', primary: true }, togglePlay);
  addButton({ id: 'back', label: 'Back 10 seconds', icon: 'back', optional: true }, () => seek(-10));
  addButton({ id: 'fwd', label: 'Forward 10 seconds', icon: 'forward', optional: true }, () => seek(10));
  const muteBtn = addButton({ id: 'mute', label: 'Mute', icon: 'volume' }, toggleMute);
  const volWrap = doc.createElement('div');
  volWrap.className = 'vol';
  const volume = doc.createElement('input');
  volume.type = 'range';
  volume.className = 'volume';
  volume.min = '0';
  volume.max = '100';
  volume.step = '1';
  volume.setAttribute('aria-label', 'Volume');
  row.insertBefore(volWrap, muteBtn);
  volWrap.append(muteBtn, volume);
  volume.addEventListener('input', () => {
    const level = Number(volume.value) / 100;
    video.volume = level;
    video.muted = level === 0;
    volume.style.setProperty('--p', `${volume.value}%`);
  });
  addSpacer();
  addButton({ id: 'cc', label: 'Show or hide subtitles', icon: 'captions' }, toggleSubs).setAttribute('aria-pressed', 'true');
  addButton({ id: 'translate', label: 'Translation', icon: 'languages', optional: true }, () => cycleTranslate()).setAttribute('aria-pressed', 'false');
  addButton({ id: 'history', label: 'Subtitle history (H)', icon: 'history', optional: true }, () => toggleHistory());
  addSep();
  addButton({ id: 'smaller', label: 'Smaller subtitles', icon: 'smaller', optional: true }, () =>
    handlers.update({ scale: Math.max(0.6, +(settings.scale - 0.1).toFixed(2)) }),
  );
  addButton({ id: 'larger', label: 'Larger subtitles', icon: 'larger', optional: true }, () =>
    handlers.update({ scale: Math.min(2.5, +(settings.scale + 0.1).toFixed(2)) }),
  );
  addButton({ id: 'up', label: 'Move subtitles up', icon: 'up', optional: true }, () =>
    handlers.update(
      settings.position === 'bottom'
        ? { offset: Math.min(40, settings.offset + 2) }
        : { offset: Math.max(0, settings.offset - 2) },
    ),
  );
  addButton({ id: 'down', label: 'Move subtitles down', icon: 'down', optional: true }, () =>
    handlers.update(
      settings.position === 'bottom'
        ? { offset: Math.max(0, settings.offset - 2) }
        : { offset: Math.min(40, settings.offset + 2) },
    ),
  );
  addButton({ id: 'close', label: 'Close Picture-in-Picture', icon: 'close' }, handlers.close);

  stage.append(subs, hist, dict, bar);
  stage.prepend(video);
  doc.body.append(stage);

  // --- state sync -----------------------------------------------------------------------------
  const syncPlayState = () => {
    const play = buttons.get('play');
    if (play) play.innerHTML = iconSvg(video.paused ? 'play' : 'pause');
    if (video.paused) showControls();
  };
  const volumeEl = volume;
  const syncMute = () => {
    const mute = buttons.get('mute');
    if (!mute) return;
    mute.innerHTML = iconSvg(video.muted || video.volume === 0 ? 'muted' : 'volume');
    mute.setAttribute('aria-label', video.muted ? 'Unmute' : 'Mute');
    mute.title = video.muted ? 'Unmute' : 'Mute';
    const level = video.muted ? 0 : Math.round(video.volume * 100);
    volumeEl.value = String(level);
    volumeEl.style.setProperty('--p', `${level}%`);
    volumeEl.setAttribute('aria-valuetext', `${level}%`);
  };

  const fmt = (t: number) => {
    if (!Number.isFinite(t)) return '0:00';
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const sec = Math.floor(t % 60);
    return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(sec).padStart(2, '0')}`;
  };
  let scrubbing = false;
  const syncProgress = () => {
    const live = !Number.isFinite(video.duration) || video.duration === 0;
    seekBar.disabled = live;
    timeLabel.textContent = live ? fmt(video.currentTime) : `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
    if (live || scrubbing) return;
    const frac = video.currentTime / video.duration;
    seekBar.value = String(Math.round(frac * 1000));
    seekBar.style.setProperty('--p', `${(frac * 100).toFixed(2)}%`);
  };
  seekBar.addEventListener('input', () => {
    scrubbing = true;
    const frac = Number(seekBar.value) / 1000;
    seekBar.style.setProperty('--p', `${(frac * 100).toFixed(2)}%`);
    if (Number.isFinite(video.duration)) video.currentTime = frac * video.duration;
  });
  seekBar.addEventListener('change', () => {
    scrubbing = false;
  });
  const progressEvents = ['timeupdate', 'durationchange', 'loadedmetadata', 'seeked'] as const;
  for (const e of progressEvents) video.addEventListener(e, syncProgress);

  let idleTimer = 0;
  function showControls() {
    stage.classList.add('controls');
    stage.classList.remove('hide-cursor');
    win.clearTimeout(idleTimer);
    idleTimer = win.setTimeout(() => {
      if (video.paused || bar.matches(':focus-within')) return;
      stage.classList.remove('controls');
      stage.classList.add('hide-cursor');
    }, IDLE_MS);
  }

  video.addEventListener('play', syncPlayState);
  video.addEventListener('pause', syncPlayState);
  video.addEventListener('volumechange', syncMute);
  stage.addEventListener('pointermove', showControls);
  stage.addEventListener('pointerdown', showControls);
  bar.addEventListener('focusin', showControls);
  video.addEventListener('click', togglePlay);

  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return; // seek slider handles its own keys
    const onButton = (e.target as HTMLElement | null)?.tagName === 'BUTTON';
    switch (e.key) {
      case ' ':
      case 'k':
        if (onButton && e.key === ' ') return; // native button activation handles it
        togglePlay();
        break;
      case 'j': seek(-10); break;
      case 'l': seek(10); break;
      case 'h': toggleHistory(); break;
      case 't': cycleTranslate(); break;
      case '+':
      case '=': handlers.update({ scale: Math.min(2.5, +(settings.scale + 0.1).toFixed(2)) }); break;
      case '-':
      case '_': handlers.update({ scale: Math.max(0.6, +(settings.scale - 0.1).toFixed(2)) }); break;
      case 'Escape':
        if (dict.hidden && hist.hidden) return;
        closeDict();
        hist.hidden = true;
        break;
      case 'ArrowLeft': seek(e.shiftKey ? -10 : -5); break;
      case 'ArrowRight': seek(e.shiftKey ? 10 : 5); break;
      case 'ArrowUp': video.volume = Math.min(1, video.volume + 0.1); break;
      case 'ArrowDown': video.volume = Math.max(0, video.volume - 0.1); break;
      case 'm': toggleMute(); break;
      case 'c': toggleSubs(); break;
      default: return;
    }
    e.preventDefault();
    showControls();
  };
  doc.addEventListener('keydown', onKey);

  const applySettings = (next: Settings) => {
    settings = next;
    applySubtitleVars(stage, next);
    stage.classList.toggle('pos-bottom', next.position === 'bottom');
    stage.classList.toggle('pos-top', next.position === 'top');
    const tr = buttons.get('translate');
    if (tr) {
      tr.setAttribute('aria-pressed', String(next.translateMode !== 'off'));
      tr.title = `Translation: ${MODE_LABEL[next.translateMode]} (T)`;
      tr.setAttribute('aria-label', tr.title);
    }
  };
  applySettings(initial);
  syncPlayState();
  syncMute();
  syncProgress();
  showControls();

  // --- subtitles, word lookup, history -------------------------------------------------------
  const fillWords = (el: HTMLElement, text: string) => {
    // Every word becomes a click target for the dictionary. Intl.Segmenter also splits Japanese / Chinese.
    const parts = segmenter
      ? Array.from(segmenter.segment(text), (s) => ({ text: s.segment, word: Boolean(s.isWordLike) }))
      : text.split(/(s+)/).map((t) => ({ text: t, word: /S/.test(t) }));
    for (const part of parts) {
      if (!part.word) {
        el.append(doc.createTextNode(part.text));
        continue;
      }
      const span = doc.createElement('span');
      span.className = 'w';
      span.textContent = part.text; // textContent — never inject page-provided caption text as HTML
      el.append(span);
    }
  };

  const setLines = (lines: Line[]) => {
    subs.replaceChildren(
      ...lines.map((line) => {
        const span = doc.createElement('span');
        span.className = line.tr ? 'cue tr' : 'cue';
        fillWords(span, line.text);
        return span;
      }),
    );
  };

  let pausedByDict = false;
  let lookupToken = 0;
  const closeDict = () => {
    lookupToken++;
    dict.hidden = true;
    if (pausedByDict) {
      pausedByDict = false;
      void video.play().catch(() => {});
    }
  };
  const textEl = (tag: string, cls: string, text: string) => {
    const el = doc.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = text;
    return el;
  };
  const openDict = async (raw: string) => {
    const word = raw.replace(/^[p{P}p{S}s]+|[p{P}p{S}s]+$/gu, '');
    if (!word) return;
    const token = ++lookupToken;
    if (!video.paused) {
      video.pause();
      pausedByDict = true;
    }
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'btn x';
    close.setAttribute('aria-label', 'Close lookup');
    close.innerHTML = iconSvg('close', 16);
    close.addEventListener('click', closeDict);
    dict.replaceChildren(close, textEl('h3', '', word), textEl('p', 'muted', 'Looking up…'));
    dict.hidden = false;

    const result = await defineWord(word, settings.translateTo);
    if (token !== lookupToken) return; // closed, or another word was clicked meanwhile
    const body: HTMLElement[] = [close, textEl('h3', '', word)];
    if (!result) body.push(textEl('p', 'muted', 'Could not look this up. Check your connection.'));
    else {
      if (result.translation && result.translation.toLowerCase() !== word.toLowerCase())
        body.push(textEl('p', 'tr1', result.translation));
      for (const m of result.meanings) {
        if (m.pos) body.push(textEl('div', 'pos', m.pos));
        const ul = doc.createElement('ul');
        for (const d of m.defs) ul.append(textEl('li', '', d));
        body.push(ul);
      }
      if (body.length === 2) body.push(textEl('p', 'muted', 'No result for this word.'));
    }
    dict.replaceChildren(...body);
  };
  subs.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement | null)?.closest?.('.w');
    if (target) void openDict(target.textContent ?? '');
  });

  let histSig = '';
  const renderHistory = () => {
    const entries = handlers.history();
    const last = entries[entries.length - 1];
    const sig = `${entries.length}|${last?.translated ?? ''}|${settings.translateMode}`;
    if (sig === histSig) return;
    histSig = sig;
    const rows = entries
      .slice()
      .reverse()
      .map((entry) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'hist-row';
        const text = doc.createElement('span');
        text.append(doc.createTextNode(entry.text));
        if (settings.translateMode !== 'off' && entry.translated) text.append(textEl('span', 'tr', entry.translated));
        b.append(textEl('time', '', fmtTime(entry.time)), text);
        b.addEventListener('click', () => handlers.seekTo(Math.max(0, entry.time - 0.5)));
        return b;
      });
    hist.replaceChildren(
      textEl('h3', '', 'Subtitle history — click a line to jump there'),
      ...(rows.length ? rows : [textEl('div', 'empty', 'Nothing yet. Lines appear here as they are shown.')]),
    );
  };
  let histTimer = 0;
  const toggleHistory = () => {
    hist.hidden = !hist.hidden;
    win.clearInterval(histTimer);
    if (hist.hidden) return;
    closeDict();
    histSig = '';
    renderHistory();
    histTimer = win.setInterval(renderHistory, 700);
  };
  const cycleTranslate = () => {
    const next = MODES[(MODES.indexOf(settings.translateMode) + 1) % MODES.length] ?? 'off';
    handlers.update({ translateMode: next });
  };

  return {
    stage,
    setLines,
    applySettings,
    destroy() {
      win.clearTimeout(idleTimer);
      win.clearInterval(histTimer);
      video.removeEventListener('play', syncPlayState);
      video.removeEventListener('pause', syncPlayState);
      video.removeEventListener('volumechange', syncMute);
      for (const e of progressEvents) video.removeEventListener(e, syncProgress);
      video.removeEventListener('click', togglePlay);
      doc.removeEventListener('keydown', onKey);
      // Remove our DOM so a new overlay can be built in the same window (when PiP follows to the next video).
      // The video must already have been handed back to the page by the caller; if not, it goes with the stage.
      stage.remove();
      style.remove();
    },
  };
}
