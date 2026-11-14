import { DEFAULT_SETTINGS } from '../lib/settings';
import { T } from '../lib/tokens';
import { fmtDelay } from '../lib/delay';
import { applySubtitleVars } from '../lib/subtitleStyle';
import type { HistoryEntry, Line } from '../lib/messaging';
import type { Settings, TranslateMode } from '../lib/settings';
import { iconSvg, type IconName } from './icons';
import { defineWord, lookupProblem } from './lookup';
import { loadBitmap, thumbAt, type ThumbCue } from './thumbnails';
import { downloadBlob, downloadText, loadWords, safeName, saveWord, removeWord, toSrt, type SavedWord } from '../lib/study';
import { watchResume } from './resume';

const CSS = /* css */ `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #000; overflow: hidden;
  font-family: system-ui, "Segoe UI", Roboto, sans-serif; }

.stage { position: relative; width: 100%; height: 100%; container-type: size; background: #000; outline: none; }
.stage > video, .stage > canvas.surface { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important;
  max-width: none !important; max-height: none !important; object-fit: contain !important; transform: none !important; }
/* Captions the site draws on its own canvas arrive as a separate transparent layer, so the subtitle controls
   (size, up/down, hide) work on them too. The layer is anchored near the bottom, where such captions sit. */
.stage > canvas.layer { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none;
  transform-origin: 50% 92%; transform: translateY(var(--layer-y, 0%)) scale(var(--sub-scale, 1)); transition: transform .18s ease; }
.stage.pos-bottom.controls > canvas.layer { transform: translateY(calc(var(--layer-y, 0%) - var(--bar-h))) scale(var(--sub-scale, 1)); }
.stage.subs-off > canvas.layer { display: none; }
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
.cue.tr { color: ${T.translation}; }
.w { pointer-events: auto; cursor: pointer; border-radius: .15em; }
.w:hover { background: rgba(96,165,250,.5); }

/* Skip intro: stays visible even when the controls are hidden, like on streaming sites. */
.skip { position: absolute; right: 12px; bottom: 14px; z-index: 3; display: inline-flex; align-items: center; gap: 6px;
  height: 36px; padding: 0 14px 0 12px; border: 1px solid rgba(255,255,255,.28); border-radius: 18px;
  background: rgba(11,15,23,.88); color: #fff; font: 600 13px/1 system-ui, "Segoe UI", Roboto, sans-serif; cursor: pointer;
  transition: bottom .18s ease, background-color .15s ease; }
.skip[hidden] { display: none; }
.skip:hover { background: ${T.primary}; border-color: ${T.primary}; }
.skip:focus-visible { outline: 2px solid ${T['primary-soft']}; outline-offset: 2px; }
.stage.controls .skip { bottom: calc(var(--bar-h) + 10px); }

/* Word lookup card and history panel. */
.dict { position: absolute; left: 50%; bottom: calc(var(--bar-h) + 10px); z-index: 5; width: min(92%, 420px);
  max-height: 55%; overflow: auto; transform: translateX(-50%); padding: 10px 12px; border-radius: 10px;
  background: rgba(17,24,39,.97); border: 1px solid ${T.line}; box-shadow: 0 8px 24px rgba(0,0,0,.5);
  color: ${T.ink}; font-size: 13px; line-height: 1.45; }
.dict[hidden], .hist[hidden] { display: none; }
.dict { animation: dict-in .16s ease; }
@keyframes dict-in { from { opacity: 0; transform: translateX(-50%) translateY(6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
.dict .tr1 { font-weight: 600; }
.dict li { margin: 2px 0; }
.dict h3 { margin: 0; padding-right: 60px; font-size: 16px; color: #fff; }
.dict .tr1 { margin: 2px 0 4px; color: #93C5FD; font-size: 15px; }
.dict .pos { margin-top: 6px; color: ${T.mute}; font-style: italic; }
.dict ul { margin: 2px 0 0; padding-left: 18px; }
.dict .x { position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; }
.dict .muted { color: ${T.mute}; }
.diag { position: absolute; left: 8px; top: 8px; z-index: 6; max-width: calc(100% - 16px); padding: 6px 8px; border-radius: 6px; background: rgba(0,0,0,.78);
  color: ${T.ink}; font: 11px/1.4 ui-monospace, Consolas, monospace; white-space: pre-wrap; pointer-events: none; }
.diag[hidden] { display: none; }
.hist { position: absolute; inset: 0 0 var(--bar-h) 0; z-index: 4; overflow: auto; padding: 10px;
  background: rgba(3,7,18,.93); }
.hist h3 { margin: 0 0 6px; padding: 0 8px; font-size: 12px; font-weight: 600; letter-spacing: .06em;
  text-transform: uppercase; color: ${T.mute}; }
.hist-row { display: flex; gap: 10px; width: 100%; padding: 6px 8px; border: 0; border-radius: 6px;
  background: transparent; color: ${T.ink}; font: inherit; font-size: 13px; line-height: 1.4; text-align: left;
  cursor: pointer; }
.hist-row:hover, .hist-row:focus-visible { background: rgba(255,255,255,.1); outline: none; }
.hist-row time { flex: none; color: ${T['primary-soft']}; font-variant-numeric: tabular-nums; }
.hist-row .tr { display: block; color: ${T.translation}; }
.hist .empty { padding: 8px; color: ${T.mute}; font-size: 13px; }
.cue { max-width: 100%; padding: .05em .45em; border-radius: .3em; white-space: pre-wrap;
  overflow-wrap: anywhere; background: var(--sub-bg); color: var(--sub-color); text-shadow: var(--sub-shadow);
  -webkit-box-decoration-break: clone; box-decoration-break: clone; }

/* Control bar: seek row on top, buttons below. */
.bar { position: absolute; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; gap: 2px;
  padding: 28px 10px 8px; background: linear-gradient(to top, rgba(11,15,23,.95) 35%, rgba(11,15,23,0));
  opacity: 0; pointer-events: none; transition: opacity .18s ease; }
.stage.controls .bar { opacity: 1; pointer-events: auto; }
.seekrow { position: relative; display: flex; align-items: center; gap: 10px; padding: 0 4px; }
.pv { position: absolute; bottom: 26px; left: 0; z-index: 5; display: flex; flex-direction: column; align-items: center; gap: 3px; pointer-events: none; transform: translateX(-50%); }
.pv[hidden] { display: none; }
.pv canvas { display: block; width: 160px; border-radius: 6px; border: 1px solid rgba(255,255,255,.25); background: #000; box-shadow: 0 4px 14px rgba(0,0,0,.5); }
.pv canvas[hidden] { display: none; }
.pv span { padding: 1px 6px; border-radius: 4px; background: rgba(0,0,0,.85); color: #fff; font-size: 11px; font-variant-numeric: tabular-nums; }
.time { min-width: 0; color: ${T.ink}; font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.seek { flex: 1; min-width: 0; height: 20px; margin: 0; background: transparent; cursor: pointer;
  -webkit-appearance: none; appearance: none; --p: 0%; }
.seek::-webkit-slider-runnable-track { height: 4px; border-radius: 2px;
  background: linear-gradient(to right, ${T['primary-soft']} var(--p), rgba(255,255,255,.28) var(--p)); }
.seek::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; margin-top: -4px;
  border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px ${T.primary}; }
.seek:focus-visible { outline: 2px solid ${T['primary-soft']}; outline-offset: 2px; border-radius: 4px; }
.row { display: flex; align-items: center; gap: 2px; }
.vol { display: flex; align-items: center; flex: none; border-radius: 8px; }
.volume { width: 0; height: 20px; margin: 0; opacity: 0; background: transparent; cursor: pointer;
  -webkit-appearance: none; appearance: none; --p: 100%;
  transition: width .18s ease, margin .18s ease, opacity .18s ease; }
.vol:hover .volume, .vol:focus-within .volume { width: 76px; margin: 0 8px 0 2px; opacity: 1; }
.volume::-webkit-slider-runnable-track { height: 4px; border-radius: 2px;
  background: linear-gradient(to right, ${T['primary-soft']} var(--p), rgba(255,255,255,.28) var(--p)); }
.volume::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; margin-top: -4px;
  border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px ${T.primary}; }
.volume:focus-visible { outline: 2px solid ${T['primary-soft']}; outline-offset: 2px; border-radius: 4px; }
.spacer { flex: 1; }
.btn { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 36px; height: 36px;
  padding: 0; border: 0; border-radius: 8px; background: transparent; color: ${T.ink}; cursor: pointer;
  transition: background-color .15s ease, color .15s ease; }
.btn:hover { background: rgba(255,255,255,.14); color: #fff; }
.btn:focus-visible { outline: 2px solid ${T['primary-soft']}; outline-offset: 1px; }
.btn[hidden] { display: none; }
.btn[aria-pressed="false"] { color: ${T.mute}; }
.btn.primary { border-radius: 50%; background: ${T.primary}; color: #fff; }
.btn.primary:hover { background: ${T['primary-hover']}; }
.sep { flex: none; width: 1px; height: 20px; margin: 0 4px; background: rgba(255,255,255,.18); }
.btn[data-tip] { position: relative; }
.btn[data-tip]::after { content: attr(data-tip); position: absolute; bottom: calc(100% + 8px); left: 50%; z-index: 8; transform: translateX(-50%) translateY(3px);
  padding: 4px 8px; border-radius: 6px; background: rgba(3,7,18,.96); border: 1px solid ${T.line}; color: ${T.ink}; font: 500 11px/1.3 system-ui, "Segoe UI", sans-serif;
  white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity .12s ease .35s, transform .12s ease .35s; }
.btn[data-tip]:hover::after, .btn[data-tip]:focus-visible::after { opacity: 1; transform: translateX(-50%) translateY(0); }
.row > .btn[data-tip]:first-child::after, .vol .btn[data-tip]::after { left: 0; transform: translateY(3px); }
.row > .btn[data-tip]:first-child:hover::after { transform: translateY(0); }
.row > .btn[data-tip]:last-child::after { left: auto; right: 0; transform: translateY(3px); }
.row > .btn[data-tip]:last-child:hover::after { transform: translateY(0); }
.vol .btn[data-tip]:hover::after { transform: translateY(0); }
@container (max-width: 440px) { .btn.optional, .sep.optional { display: none; } }

/* Study tools: dim while nobody talks, hidden lines, short messages, the "more" panel, the star in the word card. */
.stage > video, .stage > canvas.surface { transition: opacity .6s ease; }
.stage.quiet > video, .stage.quiet > canvas.surface { opacity: .22; }
.stage.study:not(.revealed) .subs { visibility: hidden; }
.reveal { position: absolute; left: 50%; z-index: 3; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 6px;
  height: 34px; padding: 0 14px; border: 1px solid rgba(255,255,255,.28); border-radius: 17px; background: rgba(11,15,23,.88);
  color: #fff; font: 600 13px/1 system-ui, "Segoe UI", Roboto, sans-serif; cursor: pointer; }
.stage.pos-bottom .reveal { bottom: calc(var(--sub-offset) + 4px); }
.stage.pos-top .reveal { top: calc(var(--sub-offset) + 4px); }
.stage.pos-bottom.controls .reveal { bottom: calc(var(--bar-h) + var(--sub-offset) + 4px); }
.reveal[hidden] { display: none; }
.reveal:hover { background: ${T.primary}; border-color: ${T.primary}; }
.reveal:focus-visible { outline: 2px solid ${T['primary-soft']}; outline-offset: 2px; }
.toast { position: absolute; left: 50%; top: 12px; z-index: 7; max-width: 90%; transform: translateX(-50%); padding: 6px 12px; border-radius: 8px;
  background: rgba(11,15,23,.92); border: 1px solid rgba(255,255,255,.2); color: #fff; font-size: 12px; line-height: 1.3;
  display: flex; align-items: center; gap: 10px; }
.toast[hidden] { display: none; }
.toast button { height: 24px; padding: 0 10px; border: 0; border-radius: 12px; background: ${T.primary}; color: #fff; font: 600 12px system-ui, sans-serif; cursor: pointer; }
.toast button:hover { background: ${T['primary-hover']}; }
.more { position: absolute; right: 8px; bottom: calc(var(--bar-h) - 4px); z-index: 6; width: min(94%, 340px); max-height: calc(100% - var(--bar-h) - 12px); overflow: auto;
  display: flex; flex-direction: column; gap: 2px; padding: 8px; border-radius: 12px; background: rgba(17,24,39,.98); border: 1px solid ${T.line}; box-shadow: 0 8px 28px rgba(0,0,0,.55); }
.more[hidden] { display: none; }
.mh { margin: 8px 6px 2px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: ${T.mute}; }
.mh:first-child { margin-top: 2px; }
.opt { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 46px; padding: 6px 8px; border: 0; border-radius: 8px; background: transparent;
  color: ${T.ink}; font: inherit; text-align: left; cursor: pointer; }
.opt:hover { background: rgba(255,255,255,.09); }
.opt:focus-visible, .sq:focus-visible { outline: 2px solid ${T['primary-soft']}; outline-offset: 1px; }
.opt > svg { flex: none; color: ${T.mute}; }
.opt[aria-checked="true"] > svg { color: #93C5FD; }
.ot { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.ot b { font-size: 13px; font-weight: 600; color: #fff; }
.ot small { font-size: 11px; line-height: 1.3; color: ${T.mute}; }
.opt kbd { flex: none; min-width: 20px; padding: 1px 5px; border: 1px solid #374151; border-radius: 4px; background: ${T.panel}; color: ${T.mute};
  font: 600 11px/1.5 ui-monospace, Consolas, monospace; text-align: center; }
.tg { position: relative; flex: none; width: 34px; height: 20px; border-radius: 10px; background: #374151; transition: background-color .15s ease; }
.tg::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .15s ease; }
.opt[aria-checked="true"] .tg { background: ${T.primary}; }
.opt[aria-checked="true"] .tg::after { transform: translateX(14px); }
.step { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 42px; padding: 4px 8px; font-size: 13px; font-weight: 600; color: #fff; }
.ctl { display: flex; align-items: center; gap: 6px; }
.val { min-width: 46px; text-align: center; font-size: 13px; font-weight: 600; color: ${T.ink}; font-variant-numeric: tabular-nums; }
.sq { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 30px; padding: 0; border: 1px solid #374151; border-radius: 7px;
  background: ${T.panel}; color: ${T.ink}; cursor: pointer; }
.sq:hover { background: ${T.line}; }
.chip { display: flex; align-items: center; gap: 8px; min-height: 34px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent;
  color: ${T.ink}; font: 500 12px/1.2 system-ui, "Segoe UI", Roboto, sans-serif; text-align: left; cursor: pointer; }
.chip:hover { background: rgba(255,255,255,.12); }
.chip:focus-visible { outline: 2px solid ${T['primary-soft']}; outline-offset: 1px; }
.chip svg { flex: none; }
.dict .star { right: 34px; }
.dict .star[aria-pressed="true"] { color: #FBBF24; }
.dict .star[aria-pressed="true"] svg { fill: currentColor; }
.dict .src { margin-top: 6px; font-size: 11px; color: ${T.mute}; }
.hist-row .w:hover { background: rgba(96,165,250,.5); }
.hist-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.hist-bar .chip { flex: none; }
@media (prefers-reduced-motion: reduce) { .dict, .toast, .subs, .bar, .btn, .volume, .skip, .stage > canvas.layer, .stage > video, .stage > canvas.surface { transition: none; } }
`;

/** What the overlay needs from a video: a real <video>, or a stand-in for one that lives in another frame. */
export interface MediaLike extends EventTarget {
  paused: boolean;
  currentTime: number;
  volume: number;
  muted: boolean;
  readonly duration: number;
  play(): Promise<void>;
  pause(): void;
}

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
  /** Click the site's own "Skip intro" button. */
  skip(): void;
  /** Go to the next episode (only offered while `setNext(true)`). */
  next(): void;
  /** Feeds of short videos: go to the next (1) or previous (-1) video. */
  step(dir: 1 | -1): void;
}

export interface Overlay {
  stage: HTMLElement;
  setLines(lines: Line[]): void;
  /** Shows the Skip button with this label, or hides it (null). */
  setSkip(label: string | null): void;
  /** Shows or hides the Next-episode button. */
  setNext(available: boolean): void;
  /** Shows or hides the up / down buttons used on reels and shorts. */
  setFeed(on: boolean): void;
  /** The site's seek-bar preview pictures (null = none). */
  setThumbs(cues: ThumbCue[] | null): void;
  /** Text for the diagnostics box (press D in the window to show it). */
  setDiag(text: string): void;
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
  video: MediaLike,
  initial: Settings,
  handlers: OverlayHandlers,
  /** What is drawn behind the controls. Defaults to `video` itself (a real <video> element). */
  surface?: HTMLElement,
  /** A transparent picture layer drawn above `surface` (the site's own caption canvas). */
  layer?: HTMLElement,
): Overlay {
  const surfaceEl = surface ?? (video as unknown as HTMLElement);
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

  // Hovering the seek bar shows the time, and the site's preview picture when it has one.
  let thumbs: ThumbCue[] | null = null;
  type Pic = { src: CanvasImageSource | null; state: string; w: number; h: number };
  const images = new Map<string, Pic>();
  let thumbNote = '';
  let renderDiag: () => void = () => {};
  let diagText = '';
  const pv = doc.createElement('div');
  pv.className = 'pv';
  pv.hidden = true;
  const pvCanvas = doc.createElement('canvas');
  pvCanvas.width = 160;
  pvCanvas.height = 90;
  pvCanvas.hidden = true;
  const pvTime = doc.createElement('span');
  pv.append(pvCanvas, pvTime);
  seekRow.append(pv);
  let hoverTime = -1;
  const drawThumb = () => {
    const cue = thumbs && hoverTime >= 0 ? thumbAt(thumbs, hoverTime) : null;
    const ctx = pvCanvas.getContext('2d');
    if (!cue || !ctx) {
      pvCanvas.hidden = true;
      return;
    }
    let pic = images.get(cue.url);
    if (!pic) {
      const entry: Pic = { src: null, state: 'loading', w: 0, h: 0 };
      pic = entry;
      images.set(cue.url, entry);
      const img = new Image();
      img.addEventListener('load', () => {
        entry.src = img;
        entry.state = 'loaded';
        entry.w = img.naturalWidth;
        entry.h = img.naturalHeight;
        drawThumb();
      });
      // The page's own rules (CSP, hotlink checks) may refuse the picture here: ask the background worker instead.
      img.addEventListener('error', () => {
        entry.state = 'page refused it, asking the background';
        void loadBitmap(cue.url).then((bmp) => {
          if (bmp) {
            entry.src = bmp;
            entry.w = bmp.width;
            entry.h = bmp.height;
            entry.state = 'loaded via background';
          } else {
            entry.state = 'could not be loaded';
          }
          drawThumb();
        });
        drawThumb();
      });
      img.src = cue.url;
    }
    thumbNote = `preview picture: ${pic.state} ${(cue.url.split('?')[0] ?? '').split('/').slice(-2).join('/')}${pic.w ? ` (${pic.w}x${pic.h})` : ''}`;
    renderDiag();
    if (!pic.src || !pic.w) return;
    const img = pic.src;
    const sw = cue.w || pic.w;
    const sh = cue.h || pic.h;
    pvCanvas.width = 160;
    pvCanvas.height = Math.max(40, Math.round((160 * sh) / sw));
    try {
      ctx.drawImage(img, cue.x, cue.y, sw, sh, 0, 0, pvCanvas.width, pvCanvas.height);
      pvCanvas.hidden = false;
    } catch {
      pvCanvas.hidden = true;
    }
  };
  const onSeekHover = (e: PointerEvent) => {
    const rect = seekBar.getBoundingClientRect();
    const dur = video.duration;
    if (!rect.width || !Number.isFinite(dur) || dur <= 0) return;
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    hoverTime = frac * dur;
    pvTime.textContent = fmtTime(hoverTime);
    pv.hidden = false;
    const rowRect = seekRow.getBoundingClientRect();
    const half = 82;
    pv.style.left = `${Math.min(rowRect.width - half, Math.max(half, e.clientX - rowRect.left))}px`;
    drawThumb();
  };
  seekBar.addEventListener('pointermove', onSeekHover);
  seekBar.addEventListener('pointerleave', () => {
    pv.hidden = true;
    hoverTime = -1;
  });

  const row = doc.createElement('div');
  row.className = 'row';
  bar.append(seekRow, row);

  const buttons = new Map<string, HTMLButtonElement>();
  const addButton = (spec: ButtonSpec, onClick: () => void) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = ['btn', spec.optional ? 'optional' : '', spec.primary ? 'primary' : ''].filter(Boolean).join(' ');
    b.setAttribute('aria-label', spec.label);
    b.dataset.tip = spec.label;
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
  addButton({ id: 'replay', label: 'Replay this line (R)', icon: 'replay' }, () => replayLine());
  addButton({ id: 'back', label: 'Back 10 seconds', icon: 'back', optional: true }, () => seek(-10));
  addButton({ id: 'fwd', label: 'Forward 10 seconds', icon: 'forward', optional: true }, () => seek(10));
  const nextBtn = addButton({ id: 'next', label: 'Next episode', icon: 'skip' }, () => handlers.next());
  nextBtn.hidden = true;
  const setNext = (available: boolean) => {
    nextBtn.hidden = !available;
  };
  const prevBtn = addButton({ id: 'feed-prev', label: 'Previous video', icon: 'up' }, () => handlers.step(-1));
  const nextVidBtn = addButton({ id: 'feed-next', label: 'Next video', icon: 'down' }, () => handlers.step(1));
  prevBtn.hidden = true;
  nextVidBtn.hidden = true;
  const setFeed = (on: boolean) => {
    prevBtn.hidden = !on;
    nextVidBtn.hidden = !on;
  };
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
  addButton({ id: 'more', label: 'Tools: study options and subtitle settings (G)', icon: 'sliders' }, () => toggleMore()).setAttribute('aria-expanded', 'false');
  addButton({ id: 'close', label: 'Close Picture-in-Picture', icon: 'close' }, handlers.close);

  // The tools panel: grouped, every option named in plain words with what it does and its key.
  const more = doc.createElement('div');
  more.className = 'more';
  more.hidden = true;
  more.setAttribute('role', 'group');
  more.setAttribute('aria-label', 'Tools');
  const chips = new Map<string, HTMLButtonElement>();
  const group = (title: string) => {
    const h = doc.createElement('div');
    h.className = 'mh';
    h.textContent = title;
    more.append(h);
  };
  const addSwitch = (id: string, title: string, desc: string, key: string, icon: IconName, onClick: () => void) => {
    const c = doc.createElement('button');
    c.type = 'button';
    c.className = 'opt';
    c.setAttribute('role', 'switch');
    c.setAttribute('aria-checked', 'false');
    c.innerHTML = `${iconSvg(icon, 18)}<span class="ot"><b></b><small></small></span><kbd></kbd><i class="tg" aria-hidden="true"></i>`;
    (c.querySelector('b') as HTMLElement).textContent = title;
    (c.querySelector('small') as HTMLElement).textContent = desc;
    (c.querySelector('kbd') as HTMLElement).textContent = key;
    c.addEventListener('click', onClick);
    chips.set(id, c);
    more.append(c);
  };
  const addStepper = (title: string, parts: { label: string; icon: IconName; run: () => void }[], value?: HTMLElement) => {
    const r = doc.createElement('div');
    r.className = 'step';
    const t = doc.createElement('span');
    t.textContent = title;
    r.append(t);
    const ctl = doc.createElement('div');
    ctl.className = 'ctl';
    parts.forEach((p, i) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'sq';
      b.setAttribute('aria-label', p.label);
      b.title = p.label;
      b.innerHTML = iconSvg(p.icon, 16);
      b.addEventListener('click', p.run);
      if (i === 1 && value) ctl.append(value);
      ctl.append(b);
    });
    r.append(ctl);
    more.append(r);
  };
  const nudge = (up: boolean) => {
    const d = up === (settings.position === 'bottom') ? 2 : -2;
    handlers.update({ offset: Math.min(40, Math.max(0, settings.offset + d)) });
  };
  const sizeLabel = doc.createElement('output');
  sizeLabel.className = 'val';
  const delayLabel = doc.createElement('output');
  delayLabel.className = 'val';
  const shiftDelay = (by: number) => {
    const next = Math.round(Math.min(30, Math.max(-30, settings.subDelay + by)) * 10) / 10;
    handlers.update({ subDelay: next });
    flash(`Subtitle delay ${fmtDelay(next)}${next > 0 ? ' (later)' : next < 0 ? ' (earlier)' : ''}`);
  };

  group('Study');
  addSwitch('loop', 'Loop this line', 'Repeat the current line until you stop it', 'O', 'loop', () => toggleLoop());
  addSwitch('hover', 'Hover to look up', 'Rest the pointer on a word to see its meaning', 'W', 'search', () => handlers.update({ hoverLookup: !settings.hoverLookup }));
  addSwitch('study', 'Study mode', 'Hide each line until you ask for it', 'E', 'eyeOff', () => handlers.update({ studyMode: !settings.studyMode }));
  addSwitch('dim', 'Dim when silent', 'Fade the picture while nobody is talking', 'Q', 'moon', () => handlers.update({ autoDim: !settings.autoDim }));
  group('Subtitle text');
  addStepper(
    'Size',
    [
      { label: 'Smaller text', icon: 'smaller', run: () => handlers.update({ scale: Math.max(0.6, +(settings.scale - 0.1).toFixed(2)) }) },
      { label: 'Larger text', icon: 'larger', run: () => handlers.update({ scale: Math.min(2.5, +(settings.scale + 0.1).toFixed(2)) }) },
    ],
    sizeLabel,
  );
  addStepper('Position', [
    { label: 'Move text up', icon: 'up', run: () => nudge(true) },
    { label: 'Move text down', icon: 'down', run: () => nudge(false) },
  ]);
  group('Timing');
  addStepper(
    'Subtitle delay',
    [
      { label: 'Show subtitles earlier', icon: 'back', run: () => shiftDelay(-0.1) },
      { label: 'Show subtitles later', icon: 'forward', run: () => shiftDelay(0.1) },
    ],
    delayLabel,
  );
  group('Save');
  const saveBtn = doc.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'opt';
  saveBtn.innerHTML = `${iconSvg('download', 18)}<span class="ot"><b>Save lines as .srt</b><small>Download the lines shown so far as a subtitle file</small></span>`;
  saveBtn.addEventListener('click', () => saveTranscript());
  more.append(saveBtn);
  const shotBtn = doc.createElement('button');
  shotBtn.type = 'button';
  shotBtn.className = 'opt';
  shotBtn.innerHTML = `${iconSvg('camera', 18)}<span class="ot"><b>Save screenshot</b><small>Download the current picture, with the subtitle line</small></span><kbd>P</kbd>`;
  shotBtn.addEventListener('click', () => void takeScreenshot());
  more.append(shotBtn);

  const skipBtn = doc.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'skip';
  skipBtn.hidden = true;
  skipBtn.addEventListener('click', () => handlers.skip());
  const setSkip = (label: string | null) => {
    if (!label) {
      skipBtn.hidden = true;
      return;
    }
    if (skipBtn.dataset.label !== label) {
      skipBtn.dataset.label = label;
      skipBtn.innerHTML = `${iconSvg('skip', 16)}<span></span>`;
      (skipBtn.lastElementChild as HTMLElement).textContent = label; // textContent: the label comes from the page
    }
    skipBtn.hidden = false;
  };

  const diag = doc.createElement('div');
  diag.className = 'diag';
  diag.hidden = true;
  renderDiag = () => {
    if (!diag.hidden) diag.textContent = diagText + (thumbNote ? `\n${thumbNote}` : '');
  };
  const revealBtn = doc.createElement('button');
  revealBtn.type = 'button';
  revealBtn.className = 'reveal';
  revealBtn.hidden = true;
  revealBtn.innerHTML = `${iconSvg('eye', 16)}<span>Show line (X)</span>`;
  const toast = doc.createElement('div');
  toast.className = 'toast';
  toast.hidden = true;
  toast.setAttribute('role', 'status');
  stage.append(subs, revealBtn, hist, dict, skipBtn, diag, toast, more, bar);
  stage.prepend(surfaceEl);
  if (layer) surfaceEl.after(layer);
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
    mute.dataset.tip = video.muted ? 'Unmute' : 'Mute';
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
      if (video.paused || bar.matches(':focus-within') || more.matches(':focus-within')) return;
      setMore(false);
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
  surfaceEl.addEventListener('click', togglePlay);

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
      case 'r': replayLine(); break;
      case 'o': toggleLoop(); break;
      case 'w': handlers.update({ hoverLookup: !settings.hoverLookup }); break;
      case 'e': handlers.update({ studyMode: !settings.studyMode }); break;
      case 'q': handlers.update({ autoDim: !settings.autoDim }); break;
      case 'x': reveal(); break;
      case 'g': toggleMore(); break;
      case 'p': void takeScreenshot(); break;
      case '[': case '{': shiftDelay(e.shiftKey ? -0.5 : -0.1); break;
      case ']': case '}': shiftDelay(e.shiftKey ? 0.5 : 0.1); break;
      case '\\': handlers.update({ subDelay: 0 }); flash('Subtitle delay reset'); break;
      case 'd':
        diag.hidden = !diag.hidden;
        renderDiag();
        break;
      case 's':
        if (skipBtn.hidden) return;
        handlers.skip();
        break;
      case 't': cycleTranslate(); break;
      case '+':
      case '=': handlers.update({ scale: Math.min(2.5, +(settings.scale + 0.1).toFixed(2)) }); break;
      case '-':
      case '_': handlers.update({ scale: Math.max(0.6, +(settings.scale - 0.1).toFixed(2)) }); break;
      case 'Escape':
        if (dict.hidden && hist.hidden && more.hidden) return;
        closeDict();
        hist.hidden = true;
        setMore(false);
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
    // Same intent as the text subtitles: "distance from the edge" moves the layer relative to where the site draws it.
    const shift = next.position === 'bottom' ? -(next.offset - DEFAULT_SETTINGS.offset) : -(80 - next.offset);
    stage.style.setProperty('--layer-y', `${shift}%`);
    stage.classList.toggle('pos-bottom', next.position === 'bottom');
    stage.classList.toggle('pos-top', next.position === 'top');
    stage.classList.toggle('study', next.studyMode);
    sizeLabel.textContent = `${Math.round(next.scale * 100)}%`;
    delayLabel.textContent = fmtDelay(next.subDelay);
    chips.get('hover')?.setAttribute('aria-checked', String(next.hoverLookup));
    chips.get('study')?.setAttribute('aria-checked', String(next.studyMode));
    chips.get('dim')?.setAttribute('aria-checked', String(next.autoDim));
    if (!next.hoverLookup) cancelHover();
    if (!next.studyMode) revealed = false;
    syncReveal();
    tickDim();
    const tr = buttons.get('translate');
    if (tr) {
      tr.setAttribute('aria-pressed', String(next.translateMode !== 'off'));
      tr.dataset.tip = `Translation: ${MODE_LABEL[next.translateMode]} (T)`;
      tr.setAttribute('aria-label', tr.dataset.tip);
    }
  };
  // --- subtitles, word lookup, history -------------------------------------------------------
  const fillWords = (el: HTMLElement, text: string) => {
    // Every word becomes a click target for the dictionary. Intl.Segmenter also splits Japanese / Chinese.
    const parts = segmenter
      ? Array.from(segmenter.segment(text), (s) => ({ text: s.segment, word: Boolean(s.isWordLike) }))
      : text.split(/(\s+)/).map((t) => ({ text: t, word: /\S/.test(t) }));
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

  // --- study tools ---------------------------------------------------------------------------
  const lastEntry = (): HistoryEntry | undefined => {
    const e = handlers.history();
    return e[e.length - 1];
  };
  const histKey = () => {
    const e = handlers.history();
    return `${e.length}|${e[e.length - 1]?.text ?? ''}`;
  };
  let toastTimer = 0;
  const flash = (text: string, action?: { label: string; run: () => void }, ms = 2200) => {
    toast.replaceChildren(doc.createTextNode(text));
    if (action) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.textContent = action.label;
      b.addEventListener('click', () => {
        toast.hidden = true;
        action.run();
      });
      toast.append(b);
    }
    toast.hidden = false;
    win.clearTimeout(toastTimer);
    toastTimer = win.setTimeout(() => (toast.hidden = true), ms);
  };

  // Which line is on screen: counts up whenever a NEW line appears (translation arriving does not count).
  let lineSeq = 0;
  let lineOn = false;
  let lastHistKey = '';
  let lastLineAt = 0;
  let revealed = false;
  let loop: { text: string; start: number; seen: boolean } | null = null;

  const syncReveal = () => {
    revealBtn.hidden = !(settings.studyMode && lineOn && !revealed);
    stage.classList.toggle('revealed', revealed);
  };
  const reveal = () => {
    if (!settings.studyMode || !lineOn) return;
    revealed = true;
    syncReveal();
  };
  revealBtn.addEventListener('click', reveal);

  const tickDim = () => {
    const idle = performance.now() - lastLineAt;
    const quiet = settings.autoDim && !video.paused && lastLineAt > 0 && !lineOn && idle > 4000 && idle < 120_000 && !stage.classList.contains('controls');
    stage.classList.toggle('quiet', quiet);
  };
  const dimTimer = win.setInterval(tickDim, 500);

  const replayLine = () => {
    const e = lastEntry();
    if (!e) return flash('No line to replay yet');
    closeDict();
    video.currentTime = Math.max(0, e.time - 0.3);
    void video.play().catch(() => {});
    flash('Replaying the line');
  };
  const toggleLoop = () => {
    if (loop) {
      loop = null;
      flash('Loop off');
    } else {
      const e = lastEntry();
      if (!e) return flash('No line to loop yet');
      loop = { text: e.text, start: Math.max(0, e.time - 0.3), seen: lineOn };
      closeDict();
      flash('Looping this line. Press O to stop');
    }
    chips.get('loop')?.setAttribute('aria-checked', String(Boolean(loop)));
  };
  const onLineChange = (on: boolean) => {
    const key = histKey();
    const fresh = on && (!lineOn || key !== lastHistKey);
    lastHistKey = key;
    lineOn = on;
    if (fresh) {
      lineSeq++;
      revealed = false;
    }
    if (on) lastLineAt = performance.now();
    syncReveal();
    tickDim();
    if (loop) {
      const e = lastEntry();
      const mine = on && e?.text === loop.text;
      if (mine) loop.seen = true;
      else if (loop.seen && video.currentTime > loop.start + 0.5) {
        loop.seen = false;
        video.currentTime = loop.start;
        void video.play().catch(() => {});
      }
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
    onLineChange(lines.length > 0);
  };

  // The picture currently on screen (video plus the site's caption layer), optionally with the subtitle line drawn on it.
  const frameCanvas = (withText: boolean, maxW = 0): HTMLCanvasElement | null => {
    const sw = 'videoWidth' in surfaceEl ? (surfaceEl as HTMLVideoElement).videoWidth : (surfaceEl as HTMLCanvasElement).width;
    const sh = 'videoHeight' in surfaceEl ? (surfaceEl as HTMLVideoElement).videoHeight : (surfaceEl as HTMLCanvasElement).height;
    if (!sw || !sh) return null;
    const k = maxW && sw > maxW ? maxW / sw : 1;
    const c = doc.createElement('canvas');
    c.width = Math.round(sw * k);
    c.height = Math.round(sh * k);
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(surfaceEl as unknown as CanvasImageSource, 0, 0, c.width, c.height);
    if (layer) ctx.drawImage(layer as unknown as CanvasImageSource, 0, 0, c.width, c.height);
    const hidden = settings.studyMode && !revealed;
    if (withText && !hidden) {
      const size = Math.max(14, Math.round(c.height * 0.055 * settings.scale));
      ctx.font = `600 ${size}px system-ui, "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(3, size / 6);
      const rows = [...subs.querySelectorAll<HTMLElement>('.cue')].map((el) => ({ text: el.textContent ?? '', tr: el.classList.contains('tr') }));
      let y = c.height - Math.round(c.height * 0.06) - (rows.length - 1) * size * 1.3;
      for (const row of rows) {
        ctx.strokeStyle = 'rgba(0,0,0,.9)';
        ctx.fillStyle = row.tr ? T.translation : settings.textColor;
        ctx.strokeText(row.text, c.width / 2, y, c.width * 0.94);
        ctx.fillText(row.text, c.width / 2, y, c.width * 0.94);
        y += size * 1.3;
      }
    }
    return c;
  };
  /** A small JPEG of the frame for a saved word; '' when the site does not allow capturing its video. */
  const wordShot = (): string => {
    try {
      return frameCanvas(false, 320)?.toDataURL('image/jpeg', 0.65) ?? '';
    } catch {
      return '';
    }
  };
  const takeScreenshot = async () => {
    try {
      const c = frameCanvas(true);
      if (!c) return flash('Nothing to capture yet');
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
      if (!blob) return flash('Could not capture this video');
      const name = `${safeName(document.title, 'screenshot')} ${fmtTime(video.currentTime).replace(/:/g, '-')}.png`;
      downloadBlob(doc, name, blob);
      flash(`Saved ${name}`);
    } catch {
      flash('This site protects its video, so it cannot be captured');
    }
  };

  const saveTranscript = () => {
    const entries = handlers.history();
    if (!entries.length) return flash('No lines yet to save');
    const name = `${safeName(document.title, 'subtitles')}.srt`;
    downloadText(doc, name, toSrt(entries, settings.translateMode !== 'off'), 'application/x-subrip');
    flash(`Saved ${entries.length} lines as ${name}`);
  };

  const setMore = (open: boolean) => {
    more.hidden = !open;
    buttons.get('more')?.setAttribute('aria-expanded', String(open));
  };
  const toggleMore = () => setMore(more.hidden === true);

  // Pick up where the viewer stopped last time (long videos only).
  const stopResume = watchResume(video, (time, go) =>
    flash(`Continue from ${fmtTime(time)}?`, { label: 'Continue', run: go }, 12_000),
  );

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
  // Words the viewer saved (a star in the word card). Loaded once; kept in step with what this window changes.
  const savedWords = new Set<string>();
  void loadWords().then((all) => all.forEach((w) => savedWords.add(w.word.toLowerCase())));

  let hoverOpened = false;
  let hoverTimer = 0;
  let hoverHideTimer = 0;
  const cancelHover = () => {
    win.clearTimeout(hoverTimer);
    win.clearTimeout(hoverHideTimer);
    if (hoverOpened) {
      hoverOpened = false;
      closeDict();
    }
  };

  const openDict = async (raw: string, context = '') => {
    const word = raw.replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '');
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
    close.addEventListener('click', () => {
      hoverOpened = false;
      closeDict();
    });
    dict.replaceChildren(close, textEl('h3', '', word), textEl('p', 'muted', 'Looking up…'));
    dict.hidden = false;

    const result = await defineWord(word, settings.translateTo);
    if (token !== lookupToken) return; // closed, or another word was clicked meanwhile
    const body: HTMLElement[] = [close, textEl('h3', '', word)];
    const entry: SavedWord = {
      word,
      translation: '',
      meaning: '',
      sentence: context,
      source: document.title,
      url: location.href.split('#')[0] ?? location.href,
      time: video.currentTime,
      savedAt: Date.now(),
    };
    if (!result) body.push(textEl('p', 'muted', lookupProblem() || 'Could not look this up. Check your connection.'));
    else {
      if (result.translation && result.translation.toLowerCase() !== word.toLowerCase()) {
        body.push(textEl('p', 'tr1', result.translation));
        entry.translation = result.translation;
      }
      for (const m of result.meanings) {
        if (m.pos) body.push(textEl('div', 'pos', m.pos));
        const ul = doc.createElement('ul');
        for (const d of m.defs) ul.append(textEl('li', '', d));
        body.push(ul);
      }
      entry.meaning = result.meanings
        .slice(0, 3)
        .map((m) => `${m.pos ? `${m.pos}: ` : ''}${m.defs.slice(0, 2).join('; ')}`)
        .join(' | ');
      if (body.length === 2) body.push(textEl('p', 'muted', 'No result for this word.'));
    }
    if (context) body.push(textEl('div', 'src', context));
    // Star: keep the word (with the line it was heard in) for later; Tools tab of the popup exports them.
    const star = doc.createElement('button');
    star.type = 'button';
    star.className = 'btn x star';
    star.innerHTML = iconSvg('star', 16);
    const paintStar = () => {
      const on = savedWords.has(word.toLowerCase());
      star.setAttribute('aria-pressed', String(on));
      star.setAttribute('aria-label', on ? 'Remove from saved words' : 'Save this word');
      star.title = star.getAttribute('aria-label') ?? '';
    };
    paintStar();
    star.addEventListener('click', () => {
      hoverOpened = false; // the viewer is working with this card: do not close it behind their back
      if (savedWords.has(word.toLowerCase())) {
        savedWords.delete(word.toLowerCase());
        void removeWord(word);
        flash('Removed from saved words');
      } else {
        savedWords.add(word.toLowerCase());
        const shot = wordShot();
        if (shot) entry.shot = shot;
        void saveWord(entry);
        flash('Saved. Export from the extension popup, Tools tab');
      }
      paintStar();
    });
    body.splice(1, 0, star);
    dict.replaceChildren(...body);
  };
  subs.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement | null)?.closest?.('.w');
    if (!target) return;
    win.clearTimeout(hoverTimer);
    hoverOpened = false; // a click keeps the card open until it is closed
    const cue = target.closest('.cue:not(.tr)') ?? target.closest('.cue');
    void openDict(target.textContent ?? '', cue?.textContent ?? '');
  });

  // Hover lookup: rest the pointer on a word and the video pauses with its meaning; move away and it carries on.
  const scheduleHoverClose = () => {
    win.clearTimeout(hoverHideTimer);
    if (!hoverOpened) return;
    hoverHideTimer = win.setTimeout(() => {
      if (!hoverOpened) return;
      hoverOpened = false;
      closeDict();
    }, 500);
  };
  subs.addEventListener('pointerover', (e) => {
    if (!settings.hoverLookup) return;
    const w = (e.target as HTMLElement | null)?.closest?.('.w');
    if (!w) return;
    win.clearTimeout(hoverHideTimer);
    win.clearTimeout(hoverTimer);
    hoverTimer = win.setTimeout(() => {
      const cue = w.closest('.cue:not(.tr)') ?? w.closest('.cue');
      hoverOpened = true;
      void openDict(w.textContent ?? '', cue?.textContent ?? '');
    }, 450);
  });
  subs.addEventListener('pointerout', (e) => {
    if (!(e.target as HTMLElement | null)?.closest?.('.w')) return;
    win.clearTimeout(hoverTimer);
    scheduleHoverClose();
  });
  dict.addEventListener('pointerenter', () => win.clearTimeout(hoverHideTimer));
  dict.addEventListener('pointerleave', scheduleHoverClose);

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
        fillWords(text, entry.text); // click a word to look it up, click elsewhere on the row to jump there
        if (settings.translateMode !== 'off' && entry.translated) text.append(textEl('span', 'tr', entry.translated));
        b.append(textEl('time', '', fmtTime(entry.time)), text);
        b.addEventListener('click', (e) => {
          const w = (e.target as HTMLElement | null)?.closest?.('.w');
          if (w) void openDict(w.textContent ?? '', entry.text);
          else handlers.seekTo(Math.max(0, entry.time - 0.5));
        });
        return b;
      });
    const head = doc.createElement('div');
    head.className = 'hist-bar';
    const save = doc.createElement('button');
    save.type = 'button';
    save.className = 'chip';
    save.innerHTML = `${iconSvg('download', 16)}<span>.srt</span>`;
    save.title = 'Save these lines as a subtitle file';
    save.addEventListener('click', saveTranscript);
    head.append(textEl('h3', '', 'History: click a line to jump, a word to look it up'), save);
    hist.replaceChildren(head, ...(rows.length ? rows : [textEl('div', 'empty', 'Nothing yet. Lines appear here as they are shown.')]));
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

  // First time ever: point at the tools panel once.
  void (async () => {
    try {
      const got = (await chrome.storage.local.get('seenTip')) as { seenTip?: boolean };
      if (got.seenTip) return;
      await chrome.storage.local.set({ seenTip: true });
      win.setTimeout(() => flash('Tip: press G, or the sliders button, for study tools', undefined, 7000), 1500);
    } catch {
      /* storage unavailable: no tip */
    }
  })();

  // Everything above is defined: now the first paint.
  applySettings(initial);
  syncPlayState();
  syncMute();
  syncProgress();
  showControls();

  return {
    stage,
    setLines,
    setSkip,
    setNext,
    setFeed,
    setThumbs: (cues) => {
      thumbs = cues && cues.length ? cues : null;
      if (!pv.hidden) drawThumb();
    },
    setDiag: (text) => {
      diagText = text;
      renderDiag();
    },
    applySettings,
    destroy() {
      win.clearTimeout(idleTimer);
      win.clearTimeout(toastTimer);
      win.clearTimeout(hoverTimer);
      win.clearTimeout(hoverHideTimer);
      win.clearInterval(histTimer);
      win.clearInterval(dimTimer);
        stopResume();
      video.removeEventListener('play', syncPlayState);
      video.removeEventListener('pause', syncPlayState);
      video.removeEventListener('volumechange', syncMute);
      for (const e of progressEvents) video.removeEventListener(e, syncProgress);
      surfaceEl.removeEventListener('click', togglePlay);
      doc.removeEventListener('keydown', onKey);
      // Remove our DOM so a new overlay can be built in the same window (when PiP follows to the next video).
      // The video must already have been handed back to the page by the caller; if not, it goes with the stage.
      stage.remove();
      style.remove();
    },
  };
}
