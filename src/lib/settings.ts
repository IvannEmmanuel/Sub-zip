export type FontChoice = 'sans' | 'serif' | 'mono';
export type Position = 'bottom' | 'top';
/** off: original only · translated: translation replaces the original · dual: original and translation together. */
export type TranslateMode = 'off' | 'translated' | 'dual';

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
  translateMode: TranslateMode;
  /** Language code (Google style, e.g. "en", "tl", "zh-CN") used for translation and the word dictionary. */
  translateTo: string;
  /** Open Picture-in-Picture by itself when the tab with a playing video is left. */
  autoPip: boolean;
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
  translateMode: 'off',
  translateTo: 'en',
  autoPip: false,
};

export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'tl', name: 'Filipino' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
  { code: 'ru', name: 'Russian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'id', name: 'Indonesian' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'tr', name: 'Turkish' },
];

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
