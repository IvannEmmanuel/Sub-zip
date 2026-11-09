interface Option<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: Option<T>[];
  onChange(value: T): void;
  /** Visible row label. Omit for a full-width control with only an aria-label. */
  rowLabel?: string;
}

/** Single-choice radio group rendered as joined buttons. */
export function Segmented<T extends string>({ label, rowLabel, value, options, onChange }: SegmentedProps<T>) {
  const group = (
    <div role="radiogroup" aria-label={label} class="flex min-w-0 flex-1 gap-0.5 rounded-lg border border-line bg-raised p-0.5">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            class={[
              'focus-ring min-h-[30px] flex-1 cursor-pointer truncate rounded-md px-2 text-xs font-semibold transition-colors duration-150',
              'disabled:cursor-not-allowed disabled:opacity-40',
              selected ? 'bg-primary text-white' : 'text-mute hover:bg-line hover:text-ink',
            ].join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
  if (!rowLabel) return group;
  return (
    <div class="grid min-h-[40px] grid-cols-[84px_1fr] items-center gap-3">
      <span class="text-[13px] text-ink">{rowLabel}</span>
      {group}
    </div>
  );
}
