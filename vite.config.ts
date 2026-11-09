import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import preact from '@preact/preset-vite';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [preact(), crx({ manifest })],
  server: { port: 5173, strictPort: true, hmr: { port: 5173 } },
  build: { target: 'es2022' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as import('vite').UserConfig);
