import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/** Precache only immutable build assets; API responses belong to LinkSource. */
export function pwa(): Plugin {
  return {
    name: 'perehody-pwa',
    apply: 'build',
    async closeBundle() {
      const files = ['index.html', 'icon.svg', 'manifest.webmanifest', ...(await readdir('dist/assets')).map(file => `assets/${file}`)];
      const hash = createHash('sha256');
      for (const file of files) hash.update(await readFile(`dist/${file}`));
      const cache = `perehody-${hash.digest('hex').slice(0, 12)}`;
      await writeFile('dist/sw.js', `
const CACHE = ${JSON.stringify(cache)};
const ASSETS = ${JSON.stringify(files)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('perehody-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (event.request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(new URL('index.html', scope)).then(response => response || Response.error())));
  } else if (ASSETS.some(path => new URL(path, scope).pathname === url.pathname)) {
    event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
  }
});
`);
    },
  };
}
