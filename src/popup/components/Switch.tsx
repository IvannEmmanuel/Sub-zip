import { useId } from 'preact/hooks';

interface SwitchProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange(checked: boolean): void;
}

/** Toggle row: the whole row is the click target (44px tall), exposed to screen readers as role="switch". */
export function Switch({ label, hint, checked, onChange }: SwitchProps) {
  const labelId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      onClick={() => onChange(!checked)}
      class="focus-ring flex min-h-[40px] w-full cursor-pointer items-center justify-between gap-3 rounded-lg text-left"
    >
      <span id={labelId} class="min-w-0">
        <span class="block text-[13px] text-ink">{label}</span>
        {hint && <span class="block truncate text-[11px] text-mute">{hint}</span>}
      </span>
      <span
        aria-hidden="true"
        class={[
          'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150',
          checked ? 'bg-primary' : 'bg-line',
        ].join(' ')}
      >
        <span
          class={[
            'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-150',
            checked ? 'translate-x-4' : 'translate-x-0',
          ].join(' ')}
        />
      </span>
    </button>
  );
}
