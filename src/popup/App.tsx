import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { FileText, Play, PictureInPicture2, SlidersHorizontal, X } from 'lucide-preact';
import { sortCues } from '../lib/cues';
import { ensureContentScript, sendToTab, type ActionResult, type SourceId, type Status } from '../lib/messaging';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../lib/settings';
import { parseSubtitles } from '../lib/srt';
import { Preview } from './components/Preview';
import { Segmented } from './components/Segmented';
import { Slider } from './components/Slider';
import { Swatches } from './components/Swatches';
import { Switch } from './components/Switch';
import { Tabs } from './components/Tabs';

type TabId = 'player' | 'style';

const SOURCE_LABELS: Record<SourceId, string> = {
  tracks: 'Tracks',
  dom: 'Page',
  file: 'File',
  off: 'Off',
};

const COLORS = [
  { value: '#FFFFFF', name: 'White' },
  { value: '#FFE066', name: 'Yellow' },
  { value: '#7DE3FF', name: 'Cyan' },
  { value: '#86EFAC', name: 'Green' },
  { value: '#F9A8D4', name: 'Pink' },
];

type Phase = 'loading' | 'unsupported' | 'no-video' | 'ready' | 'open';

const PHASE_COPY: Record<Phase, { title: string; body: string }> = {
  loading: { title: 'Checking this page…', body: 'Looking for a video.' },
  unsupported: { title: 'PiP is not available', body: 'This browser blocks Picture-in-Picture here. Update Chrome to 116 or newer.' },
  'no-video': {
    title: 'No video found',
    body: 'Start the video, then reopen this popup. After installing or reloading the extension, refresh the page once.',
  },
  ready: { title: 'Video ready', body: 'Open it below, or hover the video and click “PiP + subs”.' },
  open: { title: 'Picture-in-Picture is on', body: 'Subtitles follow the video. Close the window or use the button below to stop.' },
};

export function App() {
  const [tab, setTab] = useState<TabId>('player');
  const [tabId, setTabId] = useState<number | null>(null);
  const [status, setStatus] = useState<Status | null | undefined>(undefined); // undefined = loading
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);
    void chrome.tabs.query({ active: true, currentWindow: true }).then(async ([active]) => {
      if (active?.id === undefined) return setStatus(null);
      setTabId(active.id);
      let first = await sendToTab<Status>(active.id, { type: 'status' });
      if (!first) {
        // Nothing answered: the page predates this extension build (or no video yet). Inject, then ask again.
        await ensureContentScript(active.id);
        await new Promise((r) => setTimeout(r, 350));
        first = await sendToTab<Status>(active.id, { type: 'status' });
      }
      setStatus(first);
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    void saveSettings(patch);
  }, []);

  const togglePip = async () => {
    if (tabId === null) return;
    setBusy(true);
    setError(null);
    let result = await sendToTab<ActionResult>(tabId, { type: 'toggle-pip' });
    if (!result) {
      await ensureContentScript(tabId);
      await new Promise((r) => setTimeout(r, 350));
      result = await sendToTab<ActionResult>(tabId, { type: 'toggle-pip' });
    }
    if (!result) setError('No video found on this page.');
    else {
      setStatus(result.status);
      if (!result.ok) setError(result.error ?? 'Could not open Picture-in-Picture.');
    }
    setBusy(false);
  };

  const chooseSource = async (source: SourceId) => {
    if (tabId === null) return;
    const next = await sendToTab<Status>(tabId, { type: 'set-source', source });
    if (next) setStatus(next);
  };

  const onFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const picked = input.files?.[0];
    input.value = '';
    if (!picked || tabId === null) return;
    setError(null);
    if (picked.size > 5 * 1024 * 1024) return setError('That file is too large for a subtitle file (max 5 MB).');
    const cues = parseSubtitles(await picked.text());
    if (cues.length === 0) return setError('No subtitles found. Use a UTF-8 .srt or .vtt file.');
    const next = await sendToTab<Status>(tabId, { type: 'load-cues', name: picked.name, cues: sortCues(cues) });
    if (next) setStatus(next);
    else setError('Could not reach the video on this page.');
  };

  const hasVideo = status?.hasVideo ?? false;
  const pipOpen = status?.pipOpen ?? false;
  const phase: Phase =
    status === undefined
      ? 'loading'
      : status !== null && !status.supported
        ? 'unsupported'
        : pipOpen
          ? 'open'
          : hasVideo
            ? 'ready'
            : 'no-video';
  const copy = PHASE_COPY[phase];

  return (
    <main class="flex h-[560px] flex-col gap-3 p-4">
      <header class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white" aria-hidden="true">
            <PictureInPicture2 size={18} />
          </span>
          <h1 class="text-[15px] font-semibold tracking-tight">Sub PiP</h1>
        </div>
        <kbd class="rounded-md border border-line bg-raised px-1.5 py-0.5 text-[11px] text-mute" title="Toggle Picture-in-Picture">
          Alt + P
        </kbd>
      </header>

      <Tabs<TabId>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'player', label: 'Player', icon: <Play size={14} /> },
          { id: 'style', label: 'Style', icon: <SlidersHorizontal size={14} /> },
        ]}
      />

      <div class="scroll min-h-0 flex-1 overflow-y-auto" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={-1}>
        {tab === 'player' ? (
          <div class="flex flex-col gap-4">
            <section aria-label="Status" class="rounded-xl border border-line bg-raised p-3.5">
              <div class="flex items-center gap-2" role="status">
                <span
                  aria-hidden="true"
                  class={[
                    'h-2 w-2 shrink-0 rounded-full',
                    phase === 'open' ? 'bg-accent' : phase === 'ready' ? 'bg-emerald-400' : 'bg-mute',
                  ].join(' ')}
                />
                <h2 class="text-sm font-semibold">{copy.title}</h2>
              </div>
              <p class="mt-1 text-xs leading-relaxed text-mute">{copy.body}</p>
              <button
                type="button"
                class={[phase === 'open' ? 'btn-ghost' : 'btn-primary', 'mt-3 w-full'].join(' ')}
                disabled={!hasVideo || busy || phase === 'unsupported'}
                onClick={togglePip}
              >
                {pipOpen ? <X size={18} aria-hidden="true" /> : <PictureInPicture2 size={18} aria-hidden="true" />}
                {pipOpen ? 'Close Picture-in-Picture' : 'Open in Picture-in-Picture'}
              </button>
              {error && (
                <p role="alert" class="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs leading-relaxed text-ink">
                  {error}
                </p>
              )}
            </section>

            <section aria-label="Subtitle source" class="flex flex-col gap-2">
              <div class="flex items-baseline justify-between">
                <h2 class="section-label">Subtitle source</h2>
                {!pipOpen && <span class="text-[11px] text-mute">Auto when PiP opens</span>}
              </div>
              <Segmented<SourceId>
                label="Subtitle source"
                value={(pipOpen && status ? status.active : '') as SourceId}
                onChange={chooseSource}
                options={(['tracks', 'dom', 'file', 'off'] as const).map((value) => ({
                  value,
                  label: SOURCE_LABELS[value],
                  disabled: !pipOpen || !status?.available.includes(value),
                }))}
              />
              <input ref={fileInput} type="file" accept=".srt,.vtt,text/vtt" class="sr-only" tabIndex={-1} onChange={onFile} aria-label="Subtitle file" />
              <button type="button" class="btn-ghost w-full" disabled={!hasVideo} onClick={() => fileInput.current?.click()}>
                <FileText size={16} aria-hidden="true" />
                <span class="min-w-0 truncate">{status?.fileName ?? 'Load .srt / .vtt file'}</span>
              </button>
            </section>
          </div>
        ) : (
          <div class="flex flex-col gap-1">
            <Preview settings={settings} />
            <div class="mt-2 flex flex-col">
              <Slider label="Text size" min={0.6} max={2.5} step={0.1} value={settings.scale} format={(v) => `${Math.round(v * 100)}%`} onChange={(scale) => updateSettings({ scale })} />
              <Slider label="Distance" min={0} max={40} step={1} value={settings.offset} format={(v) => `${v}%`} onChange={(offset) => updateSettings({ offset })} />
              <Slider label="Background" min={0} max={1} step={0.05} value={settings.bgOpacity} format={(v) => `${Math.round(v * 100)}%`} onChange={(bgOpacity) => updateSettings({ bgOpacity })} />
              <Segmented<Settings['position']>
                label="Subtitle position"
                rowLabel="Position"
                value={settings.position}
                onChange={(position) => updateSettings({ position })}
                options={[
                  { value: 'bottom', label: 'Bottom' },
                  { value: 'top', label: 'Top' },
                ]}
              />
              <Segmented<Settings['font']>
                label="Subtitle font"
                rowLabel="Font"
                value={settings.font}
                onChange={(font) => updateSettings({ font })}
                options={[
                  { value: 'sans', label: 'Sans' },
                  { value: 'serif', label: 'Serif' },
                  { value: 'mono', label: 'Mono' },
                ]}
              />
              <Swatches label="Color" value={settings.textColor} options={COLORS} onChange={(textColor) => updateSettings({ textColor })} />
              <div class="mt-1 border-t border-line pt-1">
                <Switch label="Text outline" checked={settings.outline} onChange={(outline) => updateSettings({ outline })} />
                <Switch label="“PiP + subs” button on videos" checked={settings.pageButton} onChange={(pageButton) => updateSettings({ pageButton })} />
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
