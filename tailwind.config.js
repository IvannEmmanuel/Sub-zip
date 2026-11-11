import { readFileSync } from 'node:fs';

const tokens = JSON.parse(readFileSync(new URL('./src/lib/tokens.json', import.meta.url), 'utf8'));
const names = Object.keys(tokens.dark);
const vars = (set) => Object.fromEntries(names.map((n) => [`--c-${n}`, set[n]]));

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        raised: 'rgb(var(--c-raised) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--c-primary) / <alpha-value>)',
          hover: 'rgb(var(--c-primary-hover) / <alpha-value>)',
          soft: 'rgb(var(--c-primary-soft) / <alpha-value>)',
        },
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        mute: 'rgb(var(--c-mute) / <alpha-value>)',
        translation: 'rgb(var(--c-translation) / <alpha-value>)',
      },
      fontFamily: { sans: ['"Inter Variable"', 'system-ui', 'Segoe UI', 'sans-serif'] },
    },
  },
  plugins: [
    ({ addBase }) =>
      addBase({
        ':root': vars(tokens.dark),
        '@media (prefers-color-scheme: light)': { ':root': vars(tokens.light) },
      }),
  ],
};
