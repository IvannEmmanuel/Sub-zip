// Picture-in-Picture for players that live inside an <iframe> (most anime sites).
//
// Chrome only lets the TOP page open the custom Document PiP window, but the video is in the iframe. So:
//   iframe ("source")  captures the video + reads captions/skip button, and sends frames + state to the top page.
//   top page ("host")  opens the Document PiP window, draws the frames, shows our full control bar, and sends the
//                      viewer's commands (play, seek, volume, skip…) back to the iframe.
// They talk with window.postMessage (cross-origin safe; ImageBitmaps are transferred, not copied).

import type { HistoryEntry, Line, SourceId } from '../lib/messaging';
import { saveSettings, type Settings } from '../lib/settings';
import { buildOverlay, type MediaLike, type Overlay } from './overlay';
import { isDocumentPipSupported, type PipController, type SessionDeps } from './session';
import { watchNextEpisode } from './nextEpisode';
import { watchSkip, type SkipTarget } from './skipIntro';
import { SubtitlePipeline } from './subtitlePipeline';
import { hasDomCaptions } from './subtitleSources/domCaptions';
import { overlayInfo } from './subtitleSources/overlayText';
import { watchSiteSubs } from './subtitleSources/siteSubs';
import type { Cue } from '../lib/cues';
import { attachPreciseDomCaptions, preciseInfo } from './subtitleSources/siteCues';
import { attachFileCues } from './subtitleSources/fileCues';
import { attachTextTrack, getSubtitleTracks } from './subtitleSources/textTracks';
import { findPlayerRoot } from './videoDetector';

const NS = 'sub-pip-relay-v1';
const MAX_FRAME_W = 960;
const FPS = 24;

type Cmd =
  | { c: 'play' }
  | { c: 'pause' }
  | { c: 'seek'; time: number }
  | { c: 'volume'; volume: number }
  | { c: 'mute'; muted: boolean }
  | { c: 'skip' }
  | { c: 'next' }
  | { c: 'source'; source: SourceId | 'auto' };

interface RelayState {
  paused: boolean;
  ended: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  skip: string | null;
  /** The iframe itself has a next episode to go to. */
  next: boolean;
  lines: Line[];
  history: HistoryEntry[];
  diag: string;
}

function post(target: Window, nonce: string, msg: object, transfer: Transferable[] = []): void {
  try {
    target.postMessage({ ns: NS, nonce, ...msg }, { targetOrigin: '*', transfer });
  } catch {
    /* target frame is gone */
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// =============================================================================================
// HOST (top page)
// =============================================================================================

/** The iframe's video as the overlay sees it: same surface as a <video>, but every action is a message. */
class RemoteMedia extends EventTarget implements MediaLike {
  paused = true;
  ended = false;
  duration = NaN;
  history: HistoryEntry[] = [];
  private time = 0;
  private vol = 1;
  private mute = false;

  constructor(readonly send: (cmd: Cmd) => void) {
    super();
  }

  get currentTime(): number {
    return this.time;
  }
  set currentTime(t: number) {
    this.time = t;
    this.send({ c: 'seek', time: t });
    this.dispatchEvent(new Event('timeupdate'));
  }
  get volume(): number {
    return this.vol;
  }
  set volume(v: number) {
    this.vol = v;
    this.send({ c: 'volume', volume: v });
    this.dispatchEvent(new Event('volumechange'));
  }
  get muted(): boolean {
    return this.mute;
  }
  set muted(m: boolean) {
    this.mute = m;
    this.send({ c: 'mute', muted: m });
    this.dispatchEvent(new Event('volumechange'));
  }

  play(): Promise<void> {
    this.send({ c: 'play' });
    this.setPaused(false);
    return Promise.resolve();
  }
  pause(): void {
    this.send({ c: 'pause' });
    this.setPaused(true);
  }

  private setPaused(p: boolean): void {
    if (this.paused === p) return;
    this.paused = p;
    this.dispatchEvent(new Event(p ? 'pause' : 'play'));
  }

  /** The iframe's real state wins over our optimistic guesses. */
  update(s: RelayState): void {
    this.setPaused(s.paused);
    this.ended = s.ended;
    const durationChanged = s.duration !== this.duration && !(Number.isNaN(s.duration) && Number.isNaN(this.duration));
    this.duration = s.duration;
    this.time = s.currentTime;
    this.history = s.history;
    const volumeChanged = s.volume !== this.vol || s.muted !== this.mute;
    this.vol = s.volume;
    this.mute = s.muted;
    if (durationChanged) this.dispatchEvent(new Event('durationchange'));
    if (volumeChanged) this.dispatchEvent(new Event('volumechange'));
    this.dispatchEvent(new Event('timeupdate'));
  }
}

interface HostSession {
  nonce: string;
  source: Window;
  win: Window;
  overlay: Overlay;
  media: RemoteMedia;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  layer: HTMLCanvasElement;
  layerCtx: CanvasRenderingContext2D;
  lastLines: string;
  iframeNext: boolean;
  /** Last time the player frame sent us anything (performance.now()). */
  lastSeen: number;
  closed: boolean;
}

/** Runs in the top page. Opens the PiP window when an iframe asks, and relays frames / commands. */
export function initRelayHost(getSettings: () => Settings): { applySettings(settings: Settings): void } {
  let session: HostSession | null = null;
  let settings = getSettings();

  // The episode list usually lives in the top page, next to the player iframe.
  const topNext = {
    watch: null as { click(): void; stop(): void } | null,
    found: false,
    has() {
      return this.found;
    },
  };
  // The site may swap the whole player iframe (a new element = a new window) when the next episode starts.
  const canAdopt = (s: HostSession, from: Window) => s.source === from || s.source.closed || performance.now() - s.lastSeen > 3000;
  const refreshNext = (s: HostSession) => s.overlay.setNext(topNext.found || s.iframeNext);

  const teardown = (s: HostSession, notify: boolean) => {
    if (s.closed) return;
    s.closed = true;
    if (notify) post(s.source, s.nonce, { t: 'closed' });
    s.overlay.destroy();
    topNext.watch?.stop();
    topNext.watch = null;
    topNext.found = false;
    if (session === s) session = null;
  };

  const onOpen = async (e: MessageEvent) => {
    const d = e.data as { nonce?: unknown; w?: unknown; h?: unknown; resume?: unknown };
    const source = e.source as Window;
    if (typeof d.nonce !== 'string' || !d.nonce) return;
    const nonce = d.nonce;
    const fail = (error: string) => post(source, nonce, { t: 'fail', error });

    // The same frame came back with a new video (next episode): keep the window, just point it at the new player.
    if (d.resume === true && session && !session.closed && canAdopt(session, source)) {
      session.source = source;
      session.lastSeen = performance.now();
      session.nonce = nonce;
      session.lastLines = '';
      session.iframeNext = false;
      post(source, nonce, { t: 'ready' });
      return;
    }
    if (session && !session.closed) return fail('Picture-in-Picture is already open for another video.');
    if (!isDocumentPipSupported()) return fail('Document Picture-in-Picture is not available.');

    const vw = typeof d.w === 'number' && d.w > 0 ? d.w : 16;
    const vh = typeof d.h === 'number' && d.h > 0 ? d.h : 9;
    const width = Math.round(clamp(vw / 2, 400, 800));

    // NOTE: requestWindow() needs the click the viewer just made inside the iframe. Chrome shares that user
    // activation with the top page, so it must be called right here, before anything is awaited.
    let win: Window;
    try {
      win = await window.documentPictureInPicture!.requestWindow({ width, height: Math.round((width * vh) / vw) });
    } catch (error) {
      return fail(error instanceof DOMException ? `${error.name}: ${error.message}` : String(error));
    }

    try {
      const canvas = win.document.createElement('canvas');
      canvas.className = 'surface';
      const ctx = canvas.getContext('2d');
      const layer = win.document.createElement('canvas');
      layer.className = 'layer';
      const layerCtx = layer.getContext('2d');
      if (!ctx || !layerCtx) throw new Error('Canvas is not available.');

      let hs: HostSession | undefined;
      const media = new RemoteMedia((cmd) => hs && post(hs.source, hs.nonce, { t: 'cmd', cmd }));
      let overlay!: Overlay;
      overlay = buildOverlay(
        win,
        media,
        settings,
        {
          update: (patch) => {
            settings = { ...settings, ...patch };
            overlay.applySettings(settings);
            void saveSettings(patch);
          },
          close: () => win.close(),
          history: () => media.history,
          seekTo: (time) => {
            media.currentTime = time;
          },
          skip: () => media.send({ c: 'skip' }),
          next: () => (topNext.found ? topNext.watch?.click() : media.send({ c: 'next' })),
        },
        canvas,
        layer,
      );

      const s: HostSession = { nonce, source, win, overlay, media, canvas, ctx, layer, layerCtx, lastLines: '', iframeNext: false, lastSeen: performance.now(), closed: false };
      session = s;
      hs = s;
      topNext.watch = watchNextEpisode(document, (ok) => {
        topNext.found = ok;
        refreshNext(s);
      });
      win.addEventListener('pagehide', () => teardown(s, true));
      post(source, nonce, { t: 'ready' });
    } catch (error) {
      win.close();
      fail(error instanceof Error ? error.message : String(error));
    }
  };

  window.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as { ns?: string; t?: string; nonce?: string } | null;
    if (!d || d.ns !== NS || !e.source || e.source === window) return;
    if (d.t === 'open') {
      void onOpen(e);
      return;
    }
    if (d.t === 'resume?') {
      if (session && !session.closed && canAdopt(session, e.source as Window) && typeof d.nonce === 'string') post(e.source as Window, d.nonce, { t: 'resume-ok' });
      return;
    }
    const s = session;
    if (!s || s.closed || d.nonce !== s.nonce || e.source !== s.source) return; // not the iframe that opened this window

    s.lastSeen = performance.now();
    if (d.t === 'frame') {
      const { bitmap, layer } = d as unknown as { bitmap?: ImageBitmap; layer?: ImageBitmap | null };
      if (layer) {
        if (s.layer.width !== layer.width || s.layer.height !== layer.height) {
          s.layer.width = layer.width;
          s.layer.height = layer.height;
        }
        s.layerCtx.clearRect(0, 0, s.layer.width, s.layer.height);
        s.layerCtx.drawImage(layer, 0, 0);
        layer.close();
      } else {
        s.layerCtx.clearRect(0, 0, s.layer.width, s.layer.height); // the site's caption canvas went away
      }
      if (bitmap) {
        if (s.canvas.width !== bitmap.width || s.canvas.height !== bitmap.height) {
          s.canvas.width = bitmap.width;
          s.canvas.height = bitmap.height;
        }
        s.ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
      }
      post(s.source, s.nonce, { t: 'ack' }); // the iframe sends the next frame only after this
    } else if (d.t === 'state') {
      const st = (d as unknown as { s: RelayState }).s;
      s.media.update(st);
      const key = JSON.stringify(st.lines);
      if (key !== s.lastLines) {
        s.lastLines = key;
        s.overlay.setLines(st.lines);
      }
      s.iframeNext = st.next;
      s.overlay.setDiag(st.diag ?? '');
      s.overlay.setSkip(st.skip);
      refreshNext(s);
    } else if (d.t === 'bye') {
      s.win.close();
    }
  });

  return {
    applySettings(next) {
      settings = next;
      session?.overlay.applySettings(next);
    },
  };
}

// =============================================================================================
// SOURCE (the iframe that contains the video)
// =============================================================================================

/** Iframe: is there a PiP window already open for this very frame? (It is after the frame loaded another episode.) */
export function askResume(): Promise<boolean> {
  return new Promise((resolve) => {
    const nonce = crypto.randomUUID();
    const done = (v: boolean) => {
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(v);
    };
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { ns?: string; t?: string; nonce?: string } | null;
      if (e.source === window.top && d?.ns === NS && d.nonce === nonce && d.t === 'resume-ok') done(true);
    };
    const timer = window.setTimeout(() => done(false), 800);
    window.addEventListener('message', onMessage);
    post(window.top as Window, nonce, { t: 'resume?' });
  });
}

export class RelaySession implements PipController {
  active: SourceId = 'off';

  private readonly nonce = crypto.randomUUID();
  private readonly top: Window;
  private readonly playerRoot: Element;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly layer = document.createElement('canvas');
  private readonly layerCtx: CanvasRenderingContext2D;
  private readonly pipeline: SubtitlePipeline;
  private detachSource: () => void = () => {};
  private unwatchSkip: () => void = () => {};
  private skip: SkipTarget | null = null;
  private nextWatch: { click(): void; stop(): void } | null = null;
  private hasNext = false;
  /** The .ass/.vtt the page's canvas caption renderer was given (see public/subpip-hook.js). */
  private siteCues: Cue[] | null = null;
  private unwatchSiteSubs: () => void = () => {};
  private usingSiteCues = false;
  private layerSeen = false;
  private frames = 0;
  private framesAt = performance.now();
  private fps = 0;
  private lines: Line[] = [];
  private auto = true;
  private closed = false;
  private inflight = false;
  private dirty = true;
  private lastSent = 0;
  private lastState = 0;
  private stateTimer = 0;
  private pumpTimer = 0;
  private retryTimer = 0;

  private constructor(
    readonly video: HTMLVideoElement,
    private readonly deps: SessionDeps,
    private readonly resume = false,
  ) {
    this.top = window.top as Window;
    this.playerRoot = findPlayerRoot(video);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available on this page.');
    this.ctx = ctx;
    const layerCtx = this.layer.getContext('2d');
    if (!layerCtx) throw new Error('Canvas is not available on this page.');
    this.layerCtx = layerCtx;
    this.pipeline = new SubtitlePipeline(video, deps.settings, (lines) => {
      this.lines = lines;
      this.sendState(true); // forced: a new caption must not wait for the 250ms throttle
    });
  }

  /** Must be called directly from a user gesture (the click is shared with the top page). */
  static async open(video: HTMLVideoElement, deps: SessionDeps, resume = false): Promise<RelaySession> {
    if (window === window.top) throw new Error('Relay is only for players inside a frame.');
    const session = new RelaySession(video, deps, resume);
    try {
      await session.handshake();
      session.start();
      return session;
    } catch (error) {
      session.dispose(false);
      throw error;
    }
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  private handshake(): Promise<void> {
    return new Promise((resolve, reject) => {
      const done = (fn: () => void) => {
        window.clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        fn();
      };
      const onMessage = (e: MessageEvent) => {
        const d = e.data as { ns?: string; t?: string; nonce?: string; error?: string } | null;
        if (e.source !== this.top || !d || d.ns !== NS || d.nonce !== this.nonce) return;
        if (d.t === 'ready') done(resolve);
        else if (d.t === 'fail') done(() => reject(new Error(d.error ?? 'The page refused to open Picture-in-Picture.')));
      };
      const timer = window.setTimeout(
        () => done(() => reject(new Error('The page around this player did not answer. Reload the page and try again.'))),
        2500,
      );
      window.addEventListener('message', onMessage);
      const r = this.video.getBoundingClientRect();
      post(this.top, this.nonce, { t: 'open', resume: this.resume, w: this.video.videoWidth || r.width, h: this.video.videoHeight || r.height });
    });
  }

  private start(): void {
    window.addEventListener('message', this.onMessage);
    for (const e of ['play', 'pause', 'volumechange', 'durationchange', 'loadedmetadata', 'ended'] as const) {
      this.video.addEventListener(e, this.onVideoEvent);
    }
    this.video.addEventListener('timeupdate', this.onTimeUpdate);
    this.video.addEventListener('seeked', this.onSeeked);

    this.unwatchSkip = watchSkip(this.playerRoot, (target) => {
      this.skip = target;
      this.sendState();
    });
    this.unwatchSiteSubs = watchSiteSubs((cues) => {
      this.siteCues = cues;
      if (this.auto) this.setSource('auto');
    });
    this.nextWatch = watchNextEpisode(document, (ok) => {
      this.hasNext = ok;
      this.sendState();
    });
    this.pumpTimer = window.setInterval(() => this.pump(), 1000 / FPS);
    this.stateTimer = window.setInterval(() => {
      if (!this.video.isConnected) {
        // The page swapped the player (next episode): let the content script reattach to the still-open window.
        this.dispose(false);
        this.deps.onLost?.();
        return;
      }
      this.sendState();
    }, 1000); // heartbeat: also pushes late captions / history
    this.setSource('auto');
    this.sendState();
  }

  // --- events from the page's video ---------------------------------------------------------
  private readonly onVideoEvent = () => {
    this.dirty = true;
    this.sendState(true);
  };
  private readonly onTimeUpdate = () => this.sendState();
  private readonly onSeeked = () => {
    this.dirty = true;
    this.sendState(true);
  };

  // --- messages from the host ---------------------------------------------------------------
  private readonly onMessage = (e: MessageEvent) => {
    const d = e.data as { ns?: string; t?: string; nonce?: string; cmd?: Cmd } | null;
    if (e.source !== this.top || !d || d.ns !== NS || d.nonce !== this.nonce) return;
    if (d.t === 'ack') this.inflight = false;
    else if (d.t === 'closed') this.dispose(false);
    else if (d.t === 'cmd' && d.cmd) this.run(d.cmd);
  };

  private run(cmd: Cmd): void {
    const v = this.video;
    switch (cmd.c) {
      case 'play':
        void v.play().catch(() => {});
        break;
      case 'pause':
        v.pause();
        break;
      case 'seek':
        v.currentTime = clamp(cmd.time, 0, Number.isFinite(v.duration) ? v.duration : cmd.time);
        break;
      case 'volume':
        v.volume = clamp(cmd.volume, 0, 1);
        break;
      case 'mute':
        v.muted = cmd.muted;
        break;
      case 'skip':
        this.skip?.click();
        break;
      case 'next':
        this.nextWatch?.click();
        break;
      case 'source':
        this.setSource(cmd.source);
        break;
    }
  }

  // --- frames --------------------------------------------------------------------------------
  private pump(): void {
    if (this.closed) return;
    const now = performance.now();
    if (this.inflight && now - this.lastSent > 2000) this.inflight = false; // an ack went missing: do not stall forever
    if (this.inflight) return;
    // While paused only refresh after a seek / now and then; while playing send every tick.
    if (this.video.paused && !this.dirty && now - this.lastSent < 1000) return;
    this.dirty = false;
    const hasLayer = this.compose();
    this.layerSeen = hasLayer;
    this.frames++;
    this.inflight = true;
    this.lastSent = now;
    Promise.all([createImageBitmap(this.canvas), hasLayer ? createImageBitmap(this.layer) : Promise.resolve(null)]).then(
      ([bitmap, layer]) => {
        if (this.closed) {
          bitmap.close();
          layer?.close();
        } else {
          post(this.top, this.nonce, { t: 'frame', bitmap, layer }, layer ? [bitmap, layer] : [bitmap]);
        }
      },
      () => {
        this.inflight = false;
      },
    );
  }

  /** Draws the video into `canvas`. Returns true if the site's caption canvases were drawn into `layer`. */
  private compose(): boolean {
    const { ctx, canvas, video } = this;
    const srcW = video.videoWidth || Math.round(video.getBoundingClientRect().width) || 1280;
    const srcH = video.videoHeight || Math.round(video.getBoundingClientRect().height) || 720;
    const scale = Math.min(1, MAX_FRAME_W / srcW);
    const W = Math.max(2, Math.round(srcW * scale));
    const H = Math.max(2, Math.round(srcH * scale));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    try {
      ctx.drawImage(video, 0, 0, W, H);
    } catch {
      /* video not ready yet */
    }
    return this.usingSiteCues ? false : this.drawOverlayCanvases(W, H);
  }

  /** Players that draw captions on their own canvas over the video (ASS renderers): copy those into a separate layer. */
  private drawOverlayCanvases(W: number, H: number): boolean {
    const { layer, layerCtx } = this;
    const vr = this.video.getBoundingClientRect();
    if (vr.width === 0 || vr.height === 0) return false;
    if (layer.width !== W || layer.height !== H) {
      layer.width = W;
      layer.height = H;
    }
    layerCtx.clearRect(0, 0, W, H);
    let drawn = 0;
    for (const c of this.playerRoot.querySelectorAll('canvas')) {
      if (c === this.canvas || c.width === 0 || c.height === 0) continue;
      const r = c.getBoundingClientRect();
      const ow = Math.min(r.right, vr.right) - Math.max(r.left, vr.left);
      const oh = Math.min(r.bottom, vr.bottom) - Math.max(r.top, vr.top);
      if (ow <= 0 || oh <= 0 || (ow * oh) / (vr.width * vr.height) < 0.5) continue;
      const style = getComputedStyle(c);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      try {
        layerCtx.drawImage(
          c,
          ((r.left - vr.left) / vr.width) * W,
          ((r.top - vr.top) / vr.height) * H,
          (r.width / vr.width) * W,
          (r.height / vr.height) * H,
        );
        drawn++;
      } catch {
        /* not drawable: skip */
      }
    }
    return drawn > 0;
  }

  // --- state ---------------------------------------------------------------------------------
  /**
   * The page draws captions on a canvas (no text to compare) and loaded exactly one subtitle file: that file is the
   * captions. Show them as text timed from the video clock instead of copying the canvas, which lags in a hidden tab.
   */
  private adoptCanvasFile(): void {
    if (this.siteCues || this.closed || !this.layerSeen || preciseInfo.domText || !preciseInfo.single) return;
    if (this.deps.getFile()) return;
    this.siteCues = preciseInfo.single;
    if (this.auto) this.setSource('auto');
  }

  private diag(): string {
    const now = performance.now();
    if (now - this.framesAt > 2000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.framesAt));
      this.frames = 0;
      this.framesAt = now;
    }
    const site = !preciseInfo.files ? 'no subtitle file seen' : preciseInfo.adopted ? `file ${preciseInfo.files} found, timed from the file` : `file ${preciseInfo.files} found, not matching the page text`;
    return `source: ${this.active}
page text captions: ${preciseInfo.domText ? 'yes' : 'none now'}
site subtitle file: ${site}
caption canvas layer: ${this.usingSiteCues ? 'replaced by text from the page subtitle file' : this.layerSeen ? 'yes' : 'no'}
tracks: ${Array.from(this.video.textTracks).map((t) => `${t.kind}/${t.mode}/${t.cues?.length ?? 0}`).join(', ') || 'none'}\nvisible text over video: ${overlayInfo.texts} seen, using "${overlayInfo.picked}"${overlayInfo.rejected.length ? ', skipped ' + overlayInfo.rejected.join(' | ') : ''}\nlibass/JASSUB file seen: ${this.siteCues ? this.siteCues.length + ' lines' : 'no'}
frames sent: ${this.fps}/s | page hidden: ${document.hidden}`;
  }

  private sendState(force = false): void {
    if (this.closed) return;
    const now = performance.now();
    if (!force && now - this.lastState < 250) return; // timeupdate fires often; 4 updates a second is plenty
    this.lastState = now;
    const v = this.video;
    const state: RelayState = {
      paused: v.paused,
      ended: v.ended,
      currentTime: v.currentTime,
      duration: v.duration,
      volume: v.volume,
      muted: v.muted,
      skip: this.skip?.label ?? null,
      next: this.hasNext,
      diag: this.diag(),
      lines: this.lines,
      history: this.pipeline.history(),
    };
    post(this.top, this.nonce, { t: 'state', s: state });
  }

  // --- PipController -------------------------------------------------------------------------
  available(): SourceId[] {
    const list: SourceId[] = [];
    if (getSubtitleTracks(this.video).length) list.push('tracks');
    if (hasDomCaptions(this.playerRoot) || this.playerRoot.classList.contains('html5-video-player')) list.push('dom');
    if (this.deps.getFile() || this.siteCues) list.push('file');
    list.push('off');
    return list;
  }

  setSource(choice: SourceId | 'auto'): void {
    this.auto = choice === 'auto';
    if (!this.retryTimer) {
      // Tracks / caption layers often appear after playback starts: keep looking while nothing is attached.
      this.retryTimer = window.setInterval(() => {
        if (this.auto && this.active === 'off' && this.available().length > 1) this.setSource('auto');
        this.adoptCanvasFile();
      }, 800);
    }
    this.detachSource();
    this.detachSource = () => {};
    this.usingSiteCues = false;

    const avail = this.available();
    const id: SourceId =
      choice === 'auto'
        ? (['file', 'tracks', 'dom'] as const).find((x) => avail.includes(x)) ?? 'off'
        : avail.includes(choice)
          ? choice
          : 'off';

    const onText = (text: string) => this.pipeline.push(text);
    switch (id) {
      case 'file': {
        const file = this.deps.getFile();
        const cues = file?.cues ?? this.siteCues;
        // Text from the page's own subtitle file is timed from the video clock, so it never waits for the page's
        // canvas renderer (which stalls while the tab is hidden). Its picture layer is then left out to avoid doubles.
        this.usingSiteCues = !file && !!this.siteCues;
        if (cues) this.detachSource = attachFileCues(this.video, cues, window, onText);
        break;
      }
      case 'tracks':
        this.detachSource = attachTextTrack(this.video, onText);
        break;
      case 'dom':
        this.detachSource = attachPreciseDomCaptions(this.video, this.playerRoot, onText);
        break;
      case 'off':
        onText('');
        break;
    }
    this.active = id;
  }

  history(): HistoryEntry[] {
    return this.pipeline.history();
  }

  seek(time: number): void {
    this.video.currentTime = time;
  }

  skipLabel(): string | null {
    return this.skip?.label ?? null;
  }

  skipNow(): void {
    this.skip?.click();
  }

  applySettings(settings: Settings): void {
    this.pipeline.applySettings(settings);
  }

  close(): void {
    if (!this.closed) post(this.top, this.nonce, { t: 'bye' });
    this.dispose(false);
  }

  private dispose(notifyHost: boolean): void {
    if (this.closed) return;
    this.closed = true;
    if (notifyHost) post(this.top, this.nonce, { t: 'bye' });
    window.clearInterval(this.pumpTimer);
    window.clearInterval(this.stateTimer);
    window.clearInterval(this.retryTimer);
    window.removeEventListener('message', this.onMessage);
    for (const e of ['play', 'pause', 'volumechange', 'durationchange', 'loadedmetadata', 'ended'] as const) {
      this.video.removeEventListener(e, this.onVideoEvent);
    }
    this.video.removeEventListener('timeupdate', this.onTimeUpdate);
    this.video.removeEventListener('seeked', this.onSeeked);
    this.detachSource();
    this.unwatchSkip();
    this.unwatchSiteSubs();
    this.nextWatch?.stop();
    this.deps.onClosed();
  }
}
