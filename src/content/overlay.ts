import { applySubtitleVars } from '../lib/subtitleStyle';
import type { Settings } from '../lib/settings';
import { iconSvg, type IconName } from './icons';

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
}

export interface Overlay {
  stage: HTMLElement;
  setText(text: string): void;
  applySettings(settings: Settings): void;
  destroy(): void;
}

const IDLE_MS = 2500;

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

  stage.append(subs, bar);
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
  };
  applySettings(initial);
  syncPlayState();
  syncMute();
  syncProgress();
  showControls();

  const setText = (text: string) => {
    subs.replaceChildren(
      ...text
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const span = doc.createElement('span');
          span.className = 'cue';
          span.textContent = line; // textContent — never inject page-provided caption text as HTML
          return span;
        }),
    );
  };

  return {
    stage,
    setText,
    applySettings,
    destroy() {
      win.clearTimeout(idleTimer);
      video.removeEventListener('play', syncPlayState);
      video.removeEventListener('pause', syncPlayState);
      video.removeEventListener('volumechange', syncMute);
      for (const e of progressEvents) video.removeEventListener(e, syncProgress);
      video.removeEventListener('click', togglePlay);
      doc.removeEventListener('keydown', onKey);
    },
  };
}
