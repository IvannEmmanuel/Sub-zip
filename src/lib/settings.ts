export type FontChoice = 'sans' | 'serif' | 'mono';
export type Position = 'bottom' | 'top';

export interface Settings {
  /** Multiplier on the base subtitle size (scales with the PiP window width). */
  scale: number;
  position: Position;
  /** Distance from the chosen edge, percent of the window height. */
  offset: number;
  /** Subtitle background box opacity, 0–1. */
  bgOpacity: number;
  textColor: string;
  outline: boolean;
  font: FontChoice;
  /** Show the floating "PiP + subs" button over videos. */
  pageButton: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  scale: 1,
  position: 'bottom',
  offset: 6,
  bgOpacity: 0.55,
  textColor: '#FFFFFF',
  outline: true,
  font: 'sans',
  pageButton: true,
};

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS as unknown as Record<string, unknown>);
  return { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings>) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.sync.set(patch);
}

/** Calls `cb` with the full, merged settings whenever any value changes. */
export function onSettingsChanged(cb: (settings: Settings) => void): () => void {
  const listener = (_changes: unknown, area: string) => {
    if (area === 'sync') void loadSettings().then(cb);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
