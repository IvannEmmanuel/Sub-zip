import type { ActionResult, HistoryReply, Message, SourceId, Status } from '../lib/messaging';
import { DEFAULT_SETTINGS, loadSettings, onSettingsChanged, saveSettings, type Settings } from '../lib/settings';
import { initPageButton, showToast } from './pageButton';
import { CanvasPipSession, isCanvasPipSupported } from './canvasPip';
import { askResume, initRelayHost, RelaySession } from './relay';
import { isDocumentPipSupported, PipSession, type LoadedFile, type PipController, type SessionDeps } from './session';
import { getSubtitleTracks } from './subtitleSources/textTracks';
import { findBestVideo } from './videoDetector';

/**
 * The popup can inject this script again (for tabs that were open before the extension was installed or reloaded),
 * so only one live copy may run per frame. A copy left behind by a reload is dead (chrome.runtime.id is gone).
 */
const guard = window as typeof window & { __subPipAlive?: () => boolean };
const isAlive = () => {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
};

function start(): void {
  let settings: Settings = DEFAULT_SETTINGS;
  let session: PipController | null = null;
  let file: LoadedFile | null = null;
  let opening = false; // PiP is being created: keep the page button hidden meanwhile
  // The top page opens the PiP window for players that live in iframes (see relay.ts).
  const relayHost = window === window.top ? initRelayHost(() => settings) : null;

  void loadSettings().then((s) => {
    settings = s;
    syncAutoPip();
  });
  onSettingsChanged((s) => {
    settings = s;
    session?.applySettings(s);
    relayHost?.applySettings(s);
    syncAutoPip();
  });

  function describeError(error: unknown): string {
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError')
        return 'Chrome needs a click first. Use the “PiP + subs” button over the video, or click the page and try again.';
      if (error.name === 'NotSupportedError')
        return 'Picture-in-Picture is not available here (disabled by the page or an old browser).';
    }
    return error instanceof Error ? error.message : String(error);
  }

  function status(video: HTMLVideoElement | null): Status {
    const available: SourceId[] = session?.isOpen
      ? session.available()
      : [
          ...(video && getSubtitleTracks(video).length ? (['tracks'] as const) : []),
          ...(file ? (['file'] as const) : []),
          'off' as const,
        ];
    return {
      hasVideo: video !== null,
      pipOpen: session?.isOpen ?? false,
      supported: isPipSupported(),
      available,
      active: session?.isOpen ? session.active : 'off',
      fileName: file?.name ?? null,
      auto: { state: autoState, last: autoLast },
    };
  }

  /** Document PiP only works from the top page; embedded players (iframes) use the canvas fallback. */
  const isTopFrame = window === window.top;
  const useDocumentPip = () => isTopFrame && isDocumentPipSupported();
  const isPipSupported = () => useDocumentPip() || isCanvasPipSupported();

  /**
   * Top page: the custom Document PiP window. Player inside an iframe: ask the top page to open that same window and
   * stream the video to it (relay); only if that fails fall back to Chrome's own, control-less PiP window.
   */
  async function openSession(video: HTMLVideoElement, given: SessionDeps): Promise<PipController> {
    // A delay fits one video, not all of them: every new PiP window starts in sync.
    let deps = given;
    if (deps.settings.subDelay !== 0) {
      deps = { ...deps, settings: { ...deps.settings, subDelay: 0 } };
      settings = { ...settings, subDelay: 0 };
      void saveSettings({ subDelay: 0 });
    }
    if (useDocumentPip()) return PipSession.open(video, deps);
    if (!isTopFrame) {
      try {
        return await RelaySession.open(video, deps);
      } catch {
        /* no top page to talk to, or it refused: use the browser's own window below */
      }
    }
    return CanvasPipSession.open(video, deps);
  }

  const makeDeps = (): SessionDeps => ({
    settings,
    getFile: () => file,
    onClosed: () => {
      session = null;
    },
    onLost: () => void resumeRelay(),
  });

  /** Iframe player that just loaded (or swapped) the next episode while our PiP window is still open: reattach. */
  async function resumeRelay(): Promise<void> {
    if (isTopFrame || session || opening) return;
    // The window's old player may not count as gone yet: ask a few times.
    let wanted = false;
    for (let i = 0; i < 5 && !wanted; i++) {
      wanted = await askResume();
      if (!wanted) await new Promise((r) => window.setTimeout(r, 1000));
    }
    if (!wanted || session) return;
    for (let i = 0; i < 60 && !session; i++) {
      const v = findBestVideo();
      if (v && v.getBoundingClientRect().width > 0) {
        try {
          session = await RelaySession.open(v, makeDeps(), true);
        } catch {
          /* the window was closed meanwhile */
        }
        return;
      }
      await new Promise((r) => window.setTimeout(r, 500));
    }
  }
  if (!isTopFrame) void resumeRelay();

  /** NOTE: must reach PipSession.open() synchronously — no awaits before it, or the user gesture expires. */
  async function togglePip(video: HTMLVideoElement): Promise<ActionResult> {
    if (session?.isOpen) {
      session.close();
      return { ok: true, status: { ...status(video), pipOpen: false } };
    }
    opening = true;
    try {
      const deps = makeDeps();
      session = await openSession(video, deps);
      return { ok: true, status: status(video) };
    } catch (error) {
      return { ok: false, error: describeError(error), status: status(video) };
    } finally {
      opening = false;
    }
  }

  function handle(message: Message, video: HTMLVideoElement): Promise<Status | ActionResult | HistoryReply> {
    switch (message.type) {
      case 'toggle-pip':
        return togglePip(session?.video ?? video);
      case 'set-source':
        session?.setSource(message.source);
        return Promise.resolve(status(video));
      case 'load-cues':
        file = { name: message.name, cues: message.cues };
        if (session?.isOpen) session.setSource('file');
        return Promise.resolve(status(video));
      case 'history':
        return Promise.resolve({ entries: session?.isOpen ? session.history() : [] });
      case 'seek':
        session?.seek(message.time);
        return Promise.resolve(status(video));
      case 'status':
      default:
        return Promise.resolve(status(video));
    }
  }

  // Every frame runs this script; only a frame that actually contains a video answers.
  chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    try {
      const video = session?.video ?? findBestVideo();
      if (!video) return false;
      handle(message, video).then(sendResponse, () => sendResponse(undefined));
      return true;
    } catch {
      return false; // never let a page quirk break the reply channel
    }
  });

  /**
   * Chrome's "automatic Picture-in-Picture": when the user leaves a tab whose video is playing with sound, Chrome calls
   * the page's "enterpictureinpicture" media session handler and lets it open a PiP window without a click.
   * The handler is registered in the page's own world by the background worker; it signals us with DOM events.
   * Chrome only does this on 134+, for a video in the top frame, once the site has enough media engagement and the
   * user has allowed "Automatic picture-in-picture" for it.
   */
  let autoState: Status['auto']['state'] = 'off';
  let autoLast: string | null = null;
  window.addEventListener('sub-pip-auto-ready', (e) => {
    autoState = (e as CustomEvent<string>).detail as Status['auto']['state'];
  });
  window.addEventListener('sub-pip-auto-enter', () => {
    const video = session?.video ?? findBestVideo();
    if (session?.isOpen) autoLast = 'Already open';
    else if (!video) autoLast = 'Chrome asked for PiP but no video was found';
    else
      void togglePip(video).then((r) => {
        autoLast = r.ok ? 'Opened automatically' : `Chrome asked for PiP but it failed: ${r.error ?? 'unknown error'}`;
      });
  });
  function syncAutoPip(): void {
    if (!isTopFrame) return;
    const enabled = settings.autoPip && isDocumentPipSupported();
    try {
      void chrome.runtime.sendMessage({ type: 'auto-pip', enabled }).catch(() => {});
    } catch {
      /* extension was reloaded: this copy of the script is dead */
    }
  }

  // Tell the toolbar icon whether this tab has a PiP window (covers both the direct and the iframe-relay window).
  if (isTopFrame && window.documentPictureInPicture) {
    const badge = (open: boolean) => {
      try {
        void chrome.runtime.sendMessage({ type: 'pip-badge', open }).catch(() => {});
      } catch {
        /* extension was reloaded */
      }
    };
    (window.documentPictureInPicture as unknown as EventTarget).addEventListener('enter', (e) => {
      badge(true);
      (e as unknown as { window: Window }).window.addEventListener('pagehide', () => badge(false));
    });
  }

  initPageButton(
    () => settings.pageButton && isPipSupported() && !session?.isOpen && !opening,
    (video) =>
      void togglePip(video).then((result) => {
        if (!result.ok) showToast(`Sub PiP: ${result.error ?? 'could not open Picture-in-Picture.'}`);
      }),
  );
}

// Our own Picture-in-Picture window is a top-level about:blank page and gets this script too (match_about_blank):
// it must stay out of it, or the "PiP + subs" button shows up on top of the controls.
const isPipWindow = window === window.top && location.protocol === 'about:';

if (!isPipWindow && !guard.__subPipAlive?.()) {
  guard.__subPipAlive = isAlive;
  start();
}
