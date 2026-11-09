import type { Cue } from '../lib/cues';
import type { SourceId } from '../lib/messaging';
import { saveSettings, type Settings } from '../lib/settings';
import { buildOverlay, type Overlay } from './overlay';
import { attachDomCaptions, hasDomCaptions } from './subtitleSources/domCaptions';
import { attachFileCues } from './subtitleSources/fileCues';
import { attachTextTrack, getSubtitleTracks } from './subtitleSources/textTracks';
import { findPlayerRoot } from './videoDetector';

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
  setSource(choice: SourceId | 'auto'): void;
  applySettings(settings: Settings): void;
  close(): void;
}

/** One open Picture-in-Picture window: owns the moved video, the overlay and the active subtitle source. */
export class PipSession implements PipController {
  active: SourceId = 'off';

  private settings: Settings;
  private detachSource: () => void = () => {};
  private closed = false;
  private readonly watchTimer: number;

  private constructor(
    readonly video: HTMLVideoElement,
    private readonly win: Window,
    private readonly overlay: Overlay,
    private readonly placeholder: Comment,
    private readonly originalStyle: string | null,
    private readonly originalControls: boolean,
    private readonly playerRoot: Element,
    private readonly deps: SessionDeps,
  ) {
    this.settings = deps.settings;
    win.addEventListener('pagehide', () => this.restore());
    // If the page swaps the video out from under us (SPA navigation), close instead of leaving a dead window.
    this.watchTimer = window.setInterval(() => {
      if (!this.placeholder.isConnected) this.win.close();
    }, 1000);
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
    try {
      const playerRoot = findPlayerRoot(video); // resolve BEFORE the video leaves its parent
      const placeholder = document.createComment('sub-pip: video is in the Picture-in-Picture window');
      video.before(placeholder);
      const originalStyle = video.getAttribute('style');
      video.removeAttribute('style'); // page inline sizing would fight the PiP layout
      const originalControls = video.controls;
      video.controls = false; // our own control bar replaces the native one

      let session: PipSession | undefined;
      const overlay = buildOverlay(win, video, deps.settings, {
        update: (patch) => session?.updateSettings(patch),
        close: () => win.close(),
      });
      session = new PipSession(video, win, overlay, placeholder, originalStyle, originalControls, playerRoot, deps);
      return session;
    } catch (error) {
      win.close();
      throw error;
    }
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  available(): SourceId[] {
    const list: SourceId[] = [];
    if (getSubtitleTracks(this.video).length) list.push('tracks');
    if (hasDomCaptions(this.playerRoot) || this.playerRoot.classList.contains('html5-video-player')) list.push('dom');
    if (this.deps.getFile()) list.push('file');
    list.push('off');
    return list;
  }

  setSource(choice: SourceId | 'auto'): void {
    this.detachSource();
    this.detachSource = () => {};

    const avail = this.available();
    const id: SourceId =
      choice === 'auto'
        ? (['file', 'tracks', 'dom'] as const).find((s) => avail.includes(s)) ?? 'off'
        : avail.includes(choice)
          ? choice
          : 'off';

    const onText = (text: string) => this.overlay.setText(text);
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
        this.detachSource = attachDomCaptions(this.playerRoot, onText);
        break;
      case 'off':
        onText('');
        break;
    }
    this.active = id;
  }

  /** Applies settings changed elsewhere (popup/options) without writing them back. */
  applySettings(settings: Settings): void {
    this.settings = settings;
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
    window.clearInterval(this.watchTimer);
    this.detachSource();
    this.overlay.destroy();

    this.video.controls = this.originalControls;
    if (this.originalStyle === null) this.video.removeAttribute('style');
    else this.video.setAttribute('style', this.originalStyle);

    if (this.placeholder.isConnected) this.placeholder.replaceWith(this.video);
    this.deps.onClosed();
  }
}
