import type { ActionResult, Message, SourceId, Status } from '../lib/messaging';
import { DEFAULT_SETTINGS, loadSettings, onSettingsChanged, type Settings } from '../lib/settings';
import { initPageButton, showToast } from './pageButton';
import { CanvasPipSession, isCanvasPipSupported } from './canvasPip';
import { isDocumentPipSupported, PipSession, type LoadedFile, type PipController } from './session';
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

  void loadSettings().then((s) => {
    settings = s;
  });
  onSettingsChanged((s) => {
    settings = s;
    session?.applySettings(s);
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
    };
  }

  /** Document PiP only works from the top page; embedded players (iframes) use the canvas fallback. */
  const isTopFrame = window === window.top;
  const useDocumentPip = () => isTopFrame && isDocumentPipSupported();
  const isPipSupported = () => useDocumentPip() || isCanvasPipSupported();

  /** NOTE: must reach PipSession.open() synchronously — no awaits before it, or the user gesture expires. */
  async function togglePip(video: HTMLVideoElement): Promise<ActionResult> {
    if (session?.isOpen) {
      session.close();
      return { ok: true, status: { ...status(video), pipOpen: false } };
    }
    opening = true;
    try {
      const deps = {
        settings,
        getFile: () => file,
        onClosed: () => {
          session = null;
        },
      };
      session = await (useDocumentPip() ? PipSession.open(video, deps) : CanvasPipSession.open(video, deps));
      return { ok: true, status: status(video) };
    } catch (error) {
      return { ok: false, error: describeError(error), status: status(video) };
    } finally {
      opening = false;
    }
  }

  function handle(message: Message, video: HTMLVideoElement): Promise<Status | ActionResult> {
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

  initPageButton(
    () => settings.pageButton && isPipSupported() && !session?.isOpen && !opening,
    (video) =>
      void togglePip(video).then((result) => {
        if (!result.ok) showToast(`Sub PiP: ${result.error ?? 'could not open Picture-in-Picture.'}`);
      }),
  );
}

if (!guard.__subPipAlive?.()) {
  guard.__subPipAlive = isAlive;
  start();
}
