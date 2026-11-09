import type { CSSProperties } from 'preact';
import type { Settings } from '../../lib/settings';
import { subtitleVars } from '../../lib/subtitleStyle';

/** Compact live preview that reuses the exact CSS variables the PiP overlay uses. */
export function Preview({ settings }: { settings: Settings }) {
  const vars = subtitleVars(settings) as unknown as CSSProperties;
  const atBottom = settings.position === 'bottom';
  // Offset is a % of the PiP window height; the preview is shorter, so scale it to keep the same look.
  const edge = `${Math.min(settings.offset, 40)}%`;
  return (
    <div
      role="img"
      aria-label="Subtitle appearance preview"
      class="relative h-[84px] w-full shrink-0 overflow-hidden rounded-xl border border-line"
      style={{
        ...vars,
        background:
          'linear-gradient(135deg, #1e3a5f 0%, #0f172a 55%, #1f1235 100%), radial-gradient(circle at 70% 30%, rgba(96,165,250,.25), transparent 60%)',
      }}
    >
      <div
        class="absolute inset-x-0 flex flex-col items-center gap-0.5 px-4 text-center"
        style={{
          [atBottom ? 'bottom' : 'top']: edge,
          fontFamily: 'var(--sub-font)',
          fontSize: 'calc(var(--sub-scale) * 14px)',
          fontWeight: 600,
          lineHeight: 1.3,
        }}
      >
        <span class="rounded px-1.5" style={{ background: 'var(--sub-bg)', color: 'var(--sub-color)', textShadow: 'var(--sub-shadow)' }}>
          Subtitles stay with you
        </span>
      </div>
    </div>
  );
}
