import type { HistoryEntry, Line, SourceId } from '../lib/messaging';
import type { Settings } from '../lib/settings';
import { subtitleVars } from '../lib/subtitleStyle';
import type { PipController, SessionDeps } from './session';
import { watchNextEpisode } from './nextEpisode';
import { watchSkip, type SkipTarget } from './skipIntro';
import { SubtitlePipeline } from './subtitlePipeline';
import { hasDomCaptions } from './subtitleSources/domCaptions';
import { attachPreciseDomCaptions } from './subtitleSources/siteCues';
import { attachFileCues } from './subtitleSources/fileCues';
import { attachTextTrack, getSubtitleTracks } from './subtitleSources/textTracks';
import { findPlayerRoot } from './videoDetector';

const MAX_WIDTH = 1280;
const FPS = 30;

/** Browser-native PiP is allowed from iframes (Document PiP is not), so this is the path for embedded players. */
export function isCanvasPipSupported(): boolean {
  return typeof document.pictureInPictureEnabled === 'boolean' && document.pictureInPictureEnabled;
}

/**
 * Copies the page's video plus our subtitles onto a canvas and sends that canvas to Chrome's regular
 * Picture-in-Picture window. The real <video> never moves, so audio, playback and the page keep working.
 */
export class CanvasPipSession implements PipController {
  active: SourceId = 'off';

  private settings: Settings;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly pipVideo = document.createElement('video');
  private readonly playerRoot: Element;
  private detachSource: () => void = () => {};
  private timer = 0;
  private lines: Line[] = [];
  private readonly pipeline: SubtitlePipeline;
  private closed = false;
  private auto = true;
  private retryTimer = 0;
  private skipTarget: SkipTarget | null = null;
  private unwatchSkip: () => void = () => {};
  private nextWatch: { click(): void; stop(): void } | null = null;

  private constructor(
    readonly video: HTMLVideoElement,
    private readonly deps: SessionDeps,
  ) {
    this.settings = deps.settings;
    this.pipeline = new SubtitlePipeline(video, deps.settings, (lines) => {
      this.lines = lines;
      this.draw();
    });
    this.playerRoot = findPlayerRoot(video);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available on this page.');
    this.ctx = ctx;
  }

  /** Must be called directly from a user gesture. */
  static async open(video: HTMLVideoElement, deps: SessionDeps): Promise<CanvasPipSession> {
    if (!isCanvasPipSupported()) {
      throw new DOMException('Picture-in-Picture is disabled on this page.', 'NotSupportedError');
    }
    const session = new CanvasPipSession(video, deps);
    try {
      await session.start();
      return session;
    } catch (error) {
      session.dispose();
      throw error;
    }
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  private async start(): Promise<void> {
    const rect = this.video.getBoundingClientRect();
    const srcW = this.video.videoWidth || Math.round(rect.width) || 1280;
    const srcH = this.video.videoHeight || Math.round(rect.height) || 720;
    const scale = Math.min(1, MAX_WIDTH / srcW);
    this.canvas.width = Math.max(2, Math.round(srcW * scale));
    this.canvas.height = Math.max(2, Math.round(srcH * scale));

    this.draw();
    try {
      this.ctx.getImageData(0, 0, 1, 1); // throws if the video is cross-origin and taints the canvas
    } catch {
      throw new Error(
        'This player streams its video from another site, so Chrome will not let an extension copy the picture.',
      );
    }

    const pv = this.pipVideo;
    pv.muted = true; // the page's own video keeps playing the audio
    pv.playsInline = true;
    pv.srcObject = this.canvas.captureStream(FPS);
    pv.setAttribute('data-sub-pip', '');
    pv.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;';
    document.documentElement.append(pv);
    await pv.play();

    // The PiP window's buttons act on this hidden copy, so mirror its state to/from the real video.
    pv.muted = this.video.muted; // safe to unmute now: the canvas stream has no audio track, the page keeps the sound
    pv.volume = this.video.volume;
    if (this.video.paused) pv.pause();

    this.timer = window.setInterval(() => this.draw(), 1000 / FPS);
    this.video.addEventListener('seeked', this.redraw);
    this.video.addEventListener('play', this.onVideoPlay);
    this.video.addEventListener('pause', this.onVideoPause);
    this.video.addEventListener('volumechange', this.onVideoVolume);
    pv.addEventListener('play', this.onPipPlay);
    pv.addEventListener('pause', this.onPipPause);
    pv.addEventListener('volumechange', this.onPipVolume);
    pv.addEventListener('leavepictureinpicture', this.onLeave);
    this.bindMediaSession();
    this.unwatchSkip = watchSkip(this.playerRoot, (target) => {
      this.skipTarget = target;
      this.setMediaAction('skipad', target ? () => target.click() : null); // Chrome shows a "Skip Ad" button in its PiP window
    });

    // Chrome shows a "next track" button in its PiP window when this action is set.
    this.nextWatch = watchNextEpisode(document, (ok) => this.setMediaAction('nexttrack', ok ? () => this.nextWatch?.click() : null));

    await pv.requestPictureInPicture();
    this.setSource('auto');
  }

  private readonly redraw = () => this.draw();

  // PiP window -> real video. Each handler checks state first, so the two directions never loop.
  private readonly onPipPlay = () => {
    if (this.video.paused) void this.video.play().catch(() => {});
  };
  private readonly onPipPause = () => {
    if (!this.video.paused) this.video.pause();
  };
  private readonly onPipVolume = () => {
    if (this.video.muted !== this.pipVideo.muted) this.video.muted = this.pipVideo.muted;
    if (Math.abs(this.video.volume - this.pipVideo.volume) > 0.01) this.video.volume = this.pipVideo.volume;
  };
  // Real video -> PiP window (page controls, keyboard shortcuts, the site pausing itself).
  private readonly onVideoPlay = () => {
    if (this.pipVideo.paused) void this.pipVideo.play().catch(() => {});
  };
  private readonly onVideoPause = () => {
    if (!this.pipVideo.paused) this.pipVideo.pause();
  };
  private readonly onVideoVolume = () => {
    if (this.pipVideo.muted !== this.video.muted) this.pipVideo.muted = this.video.muted;
    if (Math.abs(this.pipVideo.volume - this.video.volume) > 0.01) this.pipVideo.volume = this.video.volume;
  };
  private readonly onLeave = () => this.dispose();

  private setMediaAction(action: string, handler: MediaSessionActionHandler | null): void {
    try {
      navigator.mediaSession?.setActionHandler(action as MediaSessionAction, handler);
    } catch {
      /* this Chrome does not know the action */
    }
  }

  skipLabel(): string | null {
    return this.skipTarget?.label ?? null;
  }

  skipNow(): void {
    this.skipTarget?.click();
  }

  private bindMediaSession(): void {
    const ms = navigator.mediaSession;
    if (!ms) return;
    const v = this.video;
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* action not supported in this Chrome */
      }
    };
    set('play', () => void v.play().catch(() => {}));
    set('pause', () => v.pause());
    set('seekbackward', (d) => void (v.currentTime = Math.max(0, v.currentTime - (d.seekOffset ?? 10))));
    set('seekforward', (d) => void (v.currentTime = Math.min(v.duration || Infinity, v.currentTime + (d.seekOffset ?? 10))));
    set('seekto', (d) => void (d.seekTime !== undefined && (v.currentTime = d.seekTime)));
  }

  private unbindMediaSession(): void {
    const ms = navigator.mediaSession;
    if (!ms) return;
    for (const action of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto'] as const) {
      try {
        ms.setActionHandler(action, null);
      } catch {
        /* ignore */
      }
    }
  }

  // --- drawing -------------------------------------------------------------------------------
  private draw(): void {
    if (this.closed) return;
    const { ctx, canvas, video } = this;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const vw = video.videoWidth || W;
    const vh = video.videoHeight || H;
    const fit = Math.min(W / vw, H / vh);
    const dw = vw * fit;
    const dh = vh * fit;
    const dx = (W - dw) / 2;
    const dy = (H - dh) / 2;
    try {
      ctx.drawImage(video, dx, dy, dw, dh);
    } catch {
      /* video not ready yet */
    }
    this.drawOverlayCanvases(dx, dy, dw, dh);
    this.drawSubtitles(this.lines);
  }

  /** Some players (JASSUB/ASS, custom renderers) draw captions on their own canvas over the video: copy those too. */
  private drawOverlayCanvases(dx: number, dy: number, dw: number, dh: number): void {
    const vr = this.video.getBoundingClientRect();
    if (vr.width === 0 || vr.height === 0) return;
    for (const c of this.playerRoot.querySelectorAll('canvas')) {
      if (c === this.canvas || c.width === 0 || c.height === 0) continue;
      const r = c.getBoundingClientRect();
      const overlapW = Math.min(r.right, vr.right) - Math.max(r.left, vr.left);
      const overlapH = Math.min(r.bottom, vr.bottom) - Math.max(r.top, vr.top);
      if (overlapW <= 0 || overlapH <= 0 || (overlapW * overlapH) / (vr.width * vr.height) < 0.5) continue;
      if (getComputedStyle(c).visibility === 'hidden' || getComputedStyle(c).display === 'none') continue;
      try {
        this.ctx.drawImage(
          c,
          dx + ((r.left - vr.left) / vr.width) * dw,
          dy + ((r.top - vr.top) / vr.height) * dh,
          (r.width / vr.width) * dw,
          (r.height / vr.height) * dh,
        );
      } catch {
        /* tainted or not drawable: skip */
      }
    }
  }

  private wrap(line: string, maxWidth: number): string[] {
    const { ctx } = this;
    if (ctx.measureText(line).width <= maxWidth) return [line];
    const tokens = /\s/.test(line) ? line.split(/(\s+)/) : Array.from(line); // CJK has no spaces: wrap per character
    const out: string[] = [];
    let current = '';
    for (const token of tokens) {
      if (current && ctx.measureText(current + token).width > maxWidth) {
        out.push(current.trim());
        current = token.trimStart();
      } else current += token;
    }
    if (current.trim()) out.push(current.trim());
    return out;
  }

  private drawSubtitles(source: Line[]): void {
    if (!source.length) return;
    const { ctx, canvas, settings: s } = this;
    const W = canvas.width;
    const H = canvas.height;
    const fontPx = Math.max(16, H * 0.06 * s.scale);
    const family = subtitleVars(s)['--sub-font'] as string;
    ctx.font = `600 ${fontPx}px ${family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    const lines = source.flatMap((l) => this.wrap(l.text, W * 0.9).map((text) => ({ text, tr: l.tr })));
    const lineH = fontPx * 1.32;
    const blockH = lines.length * lineH;
    const edge = (H * s.offset) / 100;
    const top = s.position === 'bottom' ? H - edge - blockH : edge;

    lines.forEach((line, i) => {
      const cy = top + lineH * i + lineH / 2;
      const w = ctx.measureText(line.text).width;
      if (s.bgOpacity > 0) {
        ctx.fillStyle = `rgba(0,0,0,${s.bgOpacity})`;
        const pad = fontPx * 0.4;
        ctx.beginPath();
        ctx.roundRect(W / 2 - w / 2 - pad, cy - lineH / 2 + 1, w + pad * 2, lineH - 2, fontPx * 0.3);
        ctx.fill();
      }
      if (s.outline) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = fontPx * 0.14;
        ctx.strokeText(line.text, W / 2, cy);
      }
      ctx.fillStyle = line.tr ? '#FDE68A' : s.textColor;
      ctx.fillText(line.text, W / 2, cy);
    });
  }

  // --- PipController -------------------------------------------------------------------------
  available(): SourceId[] {
    const list: SourceId[] = [];
    if (getSubtitleTracks(this.video).length) list.push('tracks');
    if (hasDomCaptions(this.playerRoot) || this.playerRoot.classList.contains('html5-video-player')) list.push('dom');
    if (this.deps.getFile()) list.push('file');
    list.push('off');
    return list;
  }

  setSource(choice: SourceId | 'auto'): void {
    this.auto = choice === 'auto';
    if (!this.retryTimer) {
      // Tracks / caption layers often appear after playback starts: keep looking while nothing is attached.
      this.retryTimer = window.setInterval(() => {
        if (this.auto && this.active === 'off' && this.available().length > 1) this.setSource('auto');
      }, 800);
    }
    this.detachSource();
    this.detachSource = () => {};

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
        if (file) this.detachSource = attachFileCues(this.video, file.cues, window, onText);
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

  applySettings(settings: Settings): void {
    this.settings = settings;
    this.pipeline.applySettings(settings);
    this.draw();
  }

  close(): void {
    if (document.pictureInPictureElement === this.pipVideo) void document.exitPictureInPicture().catch(() => {});
    this.dispose();
  }

  /** Idempotent teardown. */
  private dispose(): void {
    if (this.closed) return;
    this.closed = true;
    window.clearInterval(this.timer);
    window.clearInterval(this.retryTimer);
    this.timer = 0;
    this.detachSource();
    this.video.removeEventListener('seeked', this.redraw);
    this.video.removeEventListener('play', this.onVideoPlay);
    this.video.removeEventListener('pause', this.onVideoPause);
    this.video.removeEventListener('volumechange', this.onVideoVolume);
    this.pipVideo.removeEventListener('play', this.onPipPlay);
    this.pipVideo.removeEventListener('pause', this.onPipPause);
    this.pipVideo.removeEventListener('volumechange', this.onPipVolume);
    this.pipVideo.removeEventListener('leavepictureinpicture', this.onLeave);
    this.unwatchSkip();
    this.nextWatch?.stop();
    this.setMediaAction('skipad', null);
    this.setMediaAction('nexttrack', null);
    this.unbindMediaSession();
    this.pipVideo.pause();
    this.pipVideo.srcObject = null;
    this.pipVideo.remove();
    this.deps.onClosed();
  }
}
