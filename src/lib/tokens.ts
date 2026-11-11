// One palette for the whole extension. The popup reads it through Tailwind (tailwind.config.js, which follows the
// browser's light/dark theme); the Picture-in-Picture window is always dark and uses the hex values below.
import tokens from './tokens.json';

const hex = (rgb: string) =>
  '#' +
  rgb
    .split(' ')
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('');

/** Colours of the (always dark) Picture-in-Picture window, as hex. */
export const T = Object.fromEntries(Object.entries(tokens.dark).map(([k, v]) => [k, hex(v)])) as Record<keyof typeof tokens.dark, string>;
export { tokens };
