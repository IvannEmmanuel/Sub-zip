import type { FontChoice, Settings } from './settings';

const FONT_STACKS: Record<FontChoice, string> = {
  sans: 'system-ui, "Segoe UI", Roboto, "Noto Sans", "Noto Sans CJK JP", sans-serif',
  serif: 'Georgia, "Times New Roman", "Noto Serif", "Noto Serif CJK JP", serif',
  mono: 'ui-monospace, "Cascadia Mono", Consolas, "Noto Sans Mono CJK JP", monospace',
};

/** CSS custom properties shared by the PiP overlay and the popup preview. */
export function subtitleVars(s: Settings): Record<string, string> {
  return {
    '--sub-scale': String(s.scale),
    '--sub-offset': `${s.offset}%`,
    '--sub-bg': `rgba(0, 0, 0, ${s.bgOpacity})`,
    '--sub-color': s.textColor,
    '--sub-font': FONT_STACKS[s.font],
    '--sub-shadow': s.outline
      ? '0 0 2px #000, 0 0 3px #000, 1px 1px 2px #000, -1px -1px 2px #000'
      : 'none',
  };
}

export function applySubtitleVars(el: HTMLElement, s: Settings): void {
  for (const [key, value] of Object.entries(subtitleVars(s))) el.style.setProperty(key, value);
}
