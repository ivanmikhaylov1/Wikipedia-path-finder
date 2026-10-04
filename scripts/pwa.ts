import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/** Precache only immutable build assets; API responses belong to LinkSource. */
export function pwa(): Plugin {
  let output = 'dist';
  return {
    name: 'perehody-pwa',
    apply: 'build',
    configResolved(config) { output = resolve(config.root, config.build.outDir); },
    async closeBundle() {
      const required = ['index.html', 'favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest', ...(await readdir(resolve(output, 'assets'))).sort().map(file => `assets/${file}`)];
      const optional = ['images/grain.webp', 'images/collision/tear.webp', 'images/collision/paper-strip.svg', 'images/collision/octopus-small.webp'];
      const runtime = ['images/collision/octopus.webp'];
      const files = [...required, ...optional, ...runtime];
      const hash = createHash('sha256');
      for (const file of files) { hash.update(file); hash.update(await readFile(resolve(output, file))); }
      const cache = `perehody-${hash.digest('hex').slice(0, 12)}`;
      await writeFile(resolve(output, 'sw.js'), `
const PREFIX = 'perehody-' + self.registration.scope + '::';
const CACHE = PREFIX + ${JSON.stringify(cache)};
const REQUIRED = ${JSON.stringify(required)};
const OPTIONAL = ${JSON.stringify(optional)};
const ASSETS = ${JSON.stringify(files)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(async cache => {
  await cache.addAll(REQUIRED);
  await Promise.allSettled(OPTIONAL.map(path => cache.add(path)));
})));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (event.request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(new URL('index.html', scope)).then(response => response || Response.error())));
  } else if (ASSETS.some(path => new URL(path, scope).pathname === url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      const cached = await cache.match(event.request, { ignoreVary: true });
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch (error) {
        if (url.pathname === new URL('images/collision/octopus.webp', scope).pathname) {
          const fallback = await cache.match(new URL('images/collision/octopus-small.webp', scope));
          if (fallback) return fallback;
        }
        throw error;
      }
    }));
  }
});
`);
    },
  };
}
