import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'local.spec.ts',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4174', serviceWorkers: 'block' },
  webServer: { command: 'vite preview --config vite.config.ts --outDir dist-local --base / --host 127.0.0.1 --port 4174 --strictPort', url: 'http://127.0.0.1:4174' },
});
