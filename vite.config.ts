import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { pwa } from './scripts/pwa';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages project sites live under /<repository>/. Override for a renamed fork.
const repository = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'Wikipedia-path-finder';

export default defineConfig({
  plugins: [react(), tailwindcss(), pwa()],
  base: process.env.GITHUB_ACTIONS ? `/${repository}/` : '/',
  test: { environment: 'node' },
});
