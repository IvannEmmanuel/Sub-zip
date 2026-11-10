import type { Cue } from '../lib/cues';
import type { HistoryEntry, SourceId } from '../lib/messaging';
import { saveSettings, type Settings } from '../lib/settings';
import { buildOverlay, type Overlay } from './overlay';
import { watchNextEpisode } from './nextEpisode';
import { watchSkip, type SkipTarget } from './skipIntro';
import { SubtitlePipeline } from './subtitlePipeline';
import { attachDomCaptions, hasDomCaptions } from './subtitleSources/domCaptions';
import { attachFileCues } from './subtitleSources/fileCues';
import { attachTextTrack, getSubtitleTracks } from './subtitleSources/textTracks';
import { findBestVideo, findPlayerRoot } from './videoDetector';

export interface LoadedFile {
  name: string;
  cues: Cue[];
}

export interface SessionDeps {
  settings: Settings;
  getFile(): LoadedFile | null;
  onClosed(): void;
}

export function isDocumentPipSupported(): boolean {
  return typeof window.documentPictureInPicture?.requestWindow === 'function';
}

/** Both PiP implementations (Document PiP window and canvas PiP) expose this surface. */
export interface PipController {
  readonly video: HTMLVideoElement;
  readonly isOpen: boolean;
  readonly active: SourceId;
  available(): SourceId[];
  history(): HistoryEntry[];
  seek(time: number): void;
  /** Label of the site's "Skip intro" button while it is showing, else null. */
  skipLabel(): string | null;
  /** Click that button. */
  skipNow(): void;
  setSource(choice: SourceId | 'auto'): void;
  applySettings(settings: Settings): void;
  close(): void;
}

/** What it takes to hand a <video> back to the page exactly as it was. */
interface Adopted {
  video: HTMLVideoElement;
  placeholder: Comment;
  originalStyle: string | null;
  originalControls: boolean;
  playerRoot: Element;
}

/** A video must be at least this big and this much on screen to count as "the one being watched". */
const MIN_W = 160;
const MIN_H = 90;
const MIN_VISIBLE = 0.4;

function isWatchable(v: HTMLVideoElement): boolean {
  if (!v.isConnected || v.paused || v.ended) return false;
  const r = v.getBoundingClientRect();
  if (r.width < MIN_W || r.height < MIN_H) return false;
  const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
  const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
  return w > 0 && h > 0 && (w * h) / (r.width * r.height) >= MIN_VISIBLE;
}

/** Moves a video out of the page into the PiP window's layout, leaving a marker so it can be put back. */
function adopt(video: HTMLVideoElement): Adopted {
  const playerRoot = findPlayerRoot(video); // resolve BEFORE the video leaves its parent
  const placeholder = document.createComment('sub-pip: video is in the Picture-in-Picture window');
  video.before(placeholder);
  const originalStyle = video.getAttribute('style');
  video.removeAttribute('style'); // page inline sizing would fight the PiP layout
  const originalControls = video.controls;
  video.controls = false; // our own control bar replaces the native one
  return { video, placeholder, originalStyle, originalControls, playerRoot };
}

/**
 * Gives the video back to the page. If the page already threw its container away (reels/feeds recycle them),
 * the video has nowhere to go: pause it so it does not keep playing audio from nowhere.
 */
function release(a: Adopted): void {
  a.video.controls = a.originalControls;
  if (a.originalStyle === null) a.video.removeAttribute('style');
  else a.video.setAttribute('style', a.originalStyle);
  if (a.placeholder.isConnected) a.placeholder.replaceWith(a.video);
  else {
    a.video.pause();
    a.video.remove();
  }
}

/** One open Picture-in-Picture window: owns the moved video, the overlay and the active subtitle source. */
export class PipSession implements PipController {
  active: SourceId = 'off';
  video: HTMLVideoElement;

  private settings: Settings;
  private current: Adopted;
  private overlay!: Overlay;
  private readonly pipeline: SubtitlePipeline;
  private detachSource: () => void = () => {};
  private closed = false;
  private readonly pollTimer: number;
  private followTimer = 0;
  private auto = true;
  private skipTarget: SkipTarget | null = null;
  private unwatchSkip: () => void = () => {};
  private nextWatch: { click(): void; stop(): void } | null = null;

  private constructor(
    adopted: Adopted,
    private readonly win: Window,
    private readonly deps: SessionDeps,
  ) {
    this.current = adopted;
    this.video = adopted.video;
    this.settings = deps.settings;
    this.pipeline = new SubtitlePipeline(adopted.video, deps.settings, (lines) => this.overlay.setLines(lines));
    this.overlay = this.buildOverlayFor(adopted.video);
    this.watchSkipIn(adopted.playerRoot);
    this.nextWatch = watchNextEpisode(document, (ok) => this.overlay.setNext(ok));

    win.addEventListener('pagehide', () => this.restore());

    // Follow the viewer: when another video starts playing on screen (next reel, next item in a feed), switch to it.
    document.addEventListener('playing', this.onAnyPlaying, true);
    // Safety net for players that start without a 'playing' event we can see, and for a dropped container.
    this.pollTimer = window.setInterval(() => this.poll(), 800);

    this.setSource('auto');
  }

  /** Must be called directly from a user gesture handler — requestWindow() requires transient activation. */
  static async open(video: HTMLVideoElement, deps: SessionDeps): Promise<PipSession> {
    if (!isDocumentPipSupported()) throw new DOMException('Document Picture-in-Picture is not available', 'NotSupportedError');

    const ratio = video.videoWidth && video.videoHeight ? video.videoHeight / video.videoWidth : 9 / 16;
    const width = Math.round(Math.min(800, Math.max(400, video.getBoundingClientRect().width / 2)));
    const win = await window.documentPictureInPicture!.requestWindow({
      width,
      height: Math.round(width * ratio),
    });

    // Anything below can fail after the window exists — never leave it half built.
    let adopted: Adopted | undefined;
    try {
      adopted = adopt(video);
      return new PipSession(adopted, win, deps);
    } catch (error) {
      if (adopted) release(adopted);
      win.close();
      throw error;
    }
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  private buildOverlayFor(video: HTMLVideoElement): Overlay {
    return buildOverlay(this.win, video, this.settings, {
      update: (patch) => this.updateSettings(patch),
      close: () => this.win.close(),
      history: () => this.pipeline.history(),
      seekTo: (time) => this.seek(time),
      skip: () => this.skipNow(),
      next: () => this.nextWatch?.click(),
    });
  }

  private watchSkipIn(root: Element): void {
    this.unwatchSkip();
    this.skipTarget = null;
    this.unwatchSkip = watchSkip(root, (target) => {
      this.skipTarget = target;
      this.overlay.setSkip(target?.label ?? null);
    });
  }

  skipLabel(): string | null {
    return this.skipTarget?.label ?? null;
  }

  skipNow(): void {
    this.skipTarget?.click();
  }

  // --- following ----------------------------------------------------------------------------
  private readonly onAnyPlaying = (e: Event) => {
    const target = e.target;
    if (target instanceof HTMLVideoElement && target !== this.video) this.scheduleSwitch(target);
  };

  private scheduleSwitch(candidate: HTMLVideoElement): void {
    window.clearTimeout(this.followTimer);
    // Let the page finish scrolling / laying out before judging which video is on screen.
    this.followTimer = window.setTimeout(() => {
      if (!this.closed && candidate !== this.video && isWatchable(candidate)) this.switchTo(candidate);
    }, 250);
  }

  private poll(): void {
    if (this.closed) return;
    // Tracks / caption layers often appear after playback starts: keep looking while nothing is attached.
    if (this.auto && this.active === 'off' && this.available().length > 1) this.setSource('auto');
    const stranded = !this.current.placeholder.isConnected; // the page dropped the video's container
    const stalled = this.video.paused || this.video.ended;
    if (!stranded && !stalled) return;
    const next = findBestVideo(); // searches the page, where our current video no longer lives
    if (next && next !== this.video && isWatchable(next)) this.switchTo(next);
  }

  /** Swaps the video shown in the SAME window (no new user gesture needed). */
  private switchTo(next: HTMLVideoElement): void {
    if (this.closed || next === this.video) return;
    const previousSource = this.active;

    this.detachSource();
    this.detachSource = () => {};
    const left = this.current.video;
    release(this.current); // hand the video back BEFORE the overlay is removed (removing a playing <video> pauses it)
    left.pause(); // the viewer moved on: do not leave the previous video playing in the page behind the new one
    this.overlay.destroy();

    this.current = adopt(next);
    this.video = next;
    this.pipeline.setVideo(next);
    this.overlay = this.buildOverlayFor(next);
    this.watchSkipIn(this.current.playerRoot);
    this.nextWatch?.stop();
    this.nextWatch = watchNextEpisode(document, (ok) => this.overlay.setNext(ok));
    this.setSource(previousSource === 'file' ? 'file' : 'auto');
    if (next.paused) void next.play().catch(() => {});
  }

  available(): SourceId[] {
    const list: SourceId[] = [];
    if (getSubtitleTracks(this.video).length) list.push('tracks');
    if (hasDomCaptions(this.current.playerRoot) || this.current.playerRoot.classList.contains('html5-video-player')) list.push('dom');
    if (this.deps.getFile()) list.push('file');
    list.push('off');
    return list;
  }

  setSource(choice: SourceId | 'auto'): void {
    this.auto = choice === 'auto';
    this.detachSource();
    this.detachSource = () => {};

    const avail = this.available();
    const id: SourceId =
      choice === 'auto'
        ? (['file', 'tracks', 'dom'] as const).find((s) => avail.includes(s)) ?? 'off'
        : avail.includes(choice)
          ? choice
          : 'off';

    const onText = (text: string) => this.pipeline.push(text);
    switch (id) {
      case 'file': {
        const file = this.deps.getFile();
        if (file) this.detachSource = attachFileCues(this.video, file.cues, this.win, onText);
        break;
      }
      case 'tracks':
        this.detachSource = attachTextTrack(this.video, onText);
        break;
      case 'dom':
        this.detachSource = attachDomCaptions(this.current.playerRoot, onText);
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

  /** Applies settings changed elsewhere (popup/options) without writing them back. */
  applySettings(settings: Settings): void {
    this.settings = settings;
    this.pipeline.applySettings(settings);
    this.overlay.applySettings(settings);
  }

  private updateSettings(patch: Partial<Settings>): void {
    this.applySettings({ ...this.settings, ...patch });
    void saveSettings(patch);
  }

  close(): void {
    this.win.close(); // fires pagehide -> restore()
  }

  /** Puts the video back exactly where it was. Idempotent. */
  private restore(): void {
    if (this.closed) return;
    this.closed = true;
    window.clearInterval(this.pollTimer);
    window.clearTimeout(this.followTimer);
    document.removeEventListener('playing', this.onAnyPlaying, true);
    this.unwatchSkip();
    this.nextWatch?.stop();
    this.detachSource();
    release(this.current);
    this.overlay.destroy();
    this.deps.onClosed();
  }
}
