import { useId } from 'preact/hooks';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format(value: number): string;
  onChange(value: number): void;
}

/** One-line slider row: label | track | value. The filled part of the track follows the value. */
export function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  const id = useId();
  const fill = `${((value - min) / (max - min)) * 100}%`;
  return (
    <div class="grid min-h-[40px] grid-cols-[84px_1fr_44px] items-center gap-3">
      <label for={id} class="text-[13px] text-ink">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--fill': fill } as never}
        onInput={(e) => onChange(Number((e.currentTarget as HTMLInputElement).value))}
        class="range focus-ring w-full cursor-pointer"
      />
      <output for={id} class="text-right text-xs tabular-nums text-mute">
        {format(value)}
      </output>
    </div>
  );
}
