import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';
import type { ResolvedConfig } from 'vite';
import { pwa } from '../scripts/pwa';

const scope = 'https://example.test/app/';
const desktop = 'images/collision/octopus.webp';
const small = 'images/collision/octopus-small.webp';
const decoration = ['images/grain.webp', 'images/collision/tear.webp', 'images/collision/paper-strip.svg'];

async function generateWorker() {
  const dir = await mkdtemp(join(tmpdir(), 'pwa-test-'));
  const files = ['index.html', 'favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest', desktop, small, ...decoration, 'assets/app.js'];
  for (const file of files) {
    await mkdir(join(dir, file, '..'), { recursive: true });
    await writeFile(join(dir, file), file);
  }
  try {
    const plugin = pwa();
    (plugin.configResolved as (config: ResolvedConfig) => void)({ root: dir, build: { outDir: '.' } } as ResolvedConfig);
    await (plugin.closeBundle as () => Promise<void>)();
    return await readFile(join(dir, 'sw.js'), 'utf8');
  } finally { await rm(dir, { recursive: true, force: true }); }
}

// A minimal CacheStorage/network boundary executes the emitted worker, including install/fetch handlers.
function executeWorker(source: string, failingPaths: string[] = []) {
  const handlers = new Map<string, (event: unknown) => void>();
  const entries = new Map<string, Response>();
  const requests: string[] = [];
  let offline = false;
  const key = (request: string | Request | URL) => new URL(typeof request === 'string' ? request : request instanceof URL ? request.href : request.url, scope).href;
  const network = async (request: string | Request | URL) => {
    const url = key(request); requests.push(url);
    if (offline || failingPaths.some(path => url === new URL(path, scope).href)) throw new Error('Network unavailable');
    return new Response(new URL(url).pathname);
  };
  const cache = {
    addAll: async (paths: string[]) => {
      const responses = await Promise.all(paths.map(network));
      paths.forEach((path, index) => entries.set(key(path), responses[index]));
    },
    add: async (path: string) => { entries.set(key(path), await network(path)); },
    put: async (request: Request, response: Response) => { entries.set(key(request), response); },
    match: async (request: string | Request | URL) => entries.get(key(request))?.clone(),
  };
  runInNewContext(source, {
    self: { registration: { scope }, addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler), clients: { claim: async () => {} } },
    caches: { open: async () => cache, match: cache.match, keys: async () => [], delete: async () => true },
    fetch: network, URL, Response,
  });
  return {
    requests, entries,
    goOffline: () => { offline = true; },
    install: async () => {
      let pending: Promise<unknown> | undefined;
      handlers.get('install')!({ waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
      await pending;
    },
    fetch: async (path: string, mode = 'same-origin') => {
      let response: Promise<Response> | undefined;
      const pending: Promise<unknown>[] = [];
      handlers.get('fetch')!({ request: { url: new URL(path, scope).href, method: 'GET', mode }, respondWith: (promise: Promise<Response>) => { response = promise; }, waitUntil: (promise: Promise<unknown>) => pending.push(promise) });
      const result = await response;
      await Promise.all(pending);
      return result;
    },
  };
}

test('decoration failures do not prevent installation or an offline core navigation', async () => {
  const worker = executeWorker(await generateWorker(), decoration);
  await expect(worker.install()).resolves.toBeUndefined();
  worker.goOffline();
  expect(await (await worker.fetch('route', 'navigate'))!.text()).toBe('/app/index.html');
  expect(await (await worker.fetch('assets/app.js'))!.text()).toBe('/app/assets/app.js');
  expect(await (await worker.fetch(small))!.text()).toBe('/app/images/collision/octopus-small.webp');
});

test('desktop illustration is fetched and cached only when requested', async () => {
  const worker = executeWorker(await generateWorker());
  await worker.install();
  expect(worker.requests).not.toContain(new URL(desktop, scope).href);
  expect(await (await worker.fetch(desktop))!.text()).toBe('/app/images/collision/octopus.webp');
  worker.goOffline();
  expect(await (await worker.fetch(desktop))!.text()).toBe('/app/images/collision/octopus.webp');
  expect(await worker.fetch('https://ru.wikipedia.org/w/api.php')).toBeUndefined();
  expect(await worker.fetch('/outside/images/collision/octopus.webp')).toBeUndefined();
});

test('a required core failure prevents installation', async () => {
  const worker = executeWorker(await generateWorker(), ['assets/app.js']);
  await expect(worker.install()).rejects.toThrow('Network unavailable');
});

test('offline desktop illustration falls back to the cached small image before any runtime desktop request', async () => {
  const worker = executeWorker(await generateWorker());
  await worker.install();
  worker.goOffline();
  expect(await (await worker.fetch(desktop))!.text()).toBe('/app/images/collision/octopus-small.webp');
  await expect(worker.fetch('images/collision/tear.webp?not-cached')).rejects.toThrow('Network unavailable');
});
