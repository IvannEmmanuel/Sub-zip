import type { ComponentChildren } from 'preact';

interface Tab<T extends string> {
  id: T;
  label: string;
  icon: ComponentChildren;
}

interface TabsProps<T extends string> {
  tabs: Tab<T>[];
  value: T;
  onChange(id: T): void;
}

/** WAI-ARIA tablist: arrow keys / Home / End move between tabs, only the active tab is in the tab order. */
export function Tabs<T extends string>({ tabs, value, onChange }: TabsProps<T>) {
  const onKeyDown = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    const target = tabs[next];
    if (!target) return;
    onChange(target.id);
    requestAnimationFrame(() => document.getElementById(`tab-${target.id}`)?.focus());
  };

  return (
    <div role="tablist" aria-label="Sub PiP sections" class="grid grid-cols-2 gap-1 rounded-xl bg-raised p-1" onKeyDown={onKeyDown}>
      {tabs.map((t) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            class={[
              'focus-ring flex min-h-[36px] cursor-pointer items-center justify-center gap-2 rounded-lg text-[13px] font-semibold transition-colors duration-150',
              selected ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-mute hover:text-ink',
            ].join(' ')}
          >
            <span aria-hidden="true" class={selected ? 'text-primary-soft' : ''}>
              {t.icon}
            </span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
