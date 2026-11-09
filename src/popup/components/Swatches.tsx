interface Swatch {
  value: string;
  name: string;
}

interface SwatchesProps {
  label: string;
  value: string;
  options: Swatch[];
  onChange(value: string): void;
}

/** Color choice as a radio group. The selected swatch gets a ring, not just a color change (not color-only). */
export function Swatches({ label, value, options, onChange }: SwatchesProps) {
  return (
    <div class="grid min-h-[40px] grid-cols-[84px_1fr] items-center gap-3">
      <span id="swatch-label" class="text-[13px] text-ink">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby="swatch-label" class="flex items-center gap-2">
        {options.map((o) => {
          const selected = o.value.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={o.name}
              title={o.name}
              onClick={() => onChange(o.value)}
              class={[
                'focus-ring h-7 w-7 cursor-pointer rounded-full border border-black/40 transition-shadow duration-150',
                selected ? 'ring-2 ring-primary-soft ring-offset-2 ring-offset-surface' : 'hover:ring-2 hover:ring-line',
              ].join(' ')}
              style={{ backgroundColor: o.value }}
            />
          );
        })}
      </div>
    </div>
  );
}
