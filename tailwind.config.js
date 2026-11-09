/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        surface: '#0B0F17',
        raised: '#121826',
        line: '#1F2937',
        primary: { DEFAULT: '#2563EB', hover: '#1D4ED8', soft: '#60A5FA' },
        accent: '#F97316',
        ink: '#E5E7EB',
        mute: '#9CA3AF',
      },
      fontFamily: { sans: ['"Inter Variable"', 'system-ui', 'Segoe UI', 'sans-serif'] },
    },
  },
  plugins: [],
};
