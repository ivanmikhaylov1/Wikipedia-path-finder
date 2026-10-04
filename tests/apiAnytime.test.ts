import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ApiLinkSource } from '../src/lib/apiLinkSource';
import { DEFAULT_LIMITS } from '../src/lib/searchLimits';

afterEach(() => vi.unstubAllGlobals());
const article = (title: string, lang = 'en') => ({ title, lang });
function wiki(edges: Record<string, string[]>, aliases: Record<string, string> = {}, pageSize = 500) {
  const calls: URL[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: URL) => {
    const url = new URL(String(input)); calls.push(url); const q = url.searchParams;
    const titles = (q.get('titles') ?? '').split('|');
    const redirects: Array<{ from: string; to: string }> = [];
    const pages = titles.map(raw => {
      const title = q.has('redirects') ? aliases[raw] ?? raw : raw;
      if (raw !== title) redirects.push({ from: raw, to: title });
      const base = { title, ns: 0, pageid: Object.keys(edges).indexOf(title) + 1 };
      if (!(title in edges) && !(title in aliases)) return { ...base, missing: true };
      if (q.get('prop') === 'redirects') return { ...base, redirects: Object.keys(aliases).filter(a => aliases[a] === title).map(title => ({ title, ns: 0 })) };
      const incoming = q.get('prop')?.includes('linkshere');
      const values = incoming ? Object.keys(edges).filter(a => edges[a].includes(title)) : edges[title] ?? [];
      const filtered = q.has('pltitles') ? values.filter(t => q.get('pltitles')!.split('|').includes(t)) : values;
      const offset = Number(q.get(incoming ? 'lhcontinue' : 'plcontinue') ?? 0);
      return { ...base, [incoming ? 'linkshere' : 'links']: filtered.slice(offset, offset + pageSize).map(title => ({ title, ns: 0 })) };
    });
    const incoming = q.get('prop')?.includes('linkshere');
    const offset = Number(q.get(incoming ? 'lhcontinue' : 'plcontinue') ?? 0);
    const more = !q.has('pltitles') && q.get('prop')?.includes('links') && (edges[titles[0]]?.length ?? 0) > offset + pageSize;
    return { ok: true, status: 200, json: async () => ({ query: { pages, redirects }, ...(more ? { continue: { plcontinue: String(offset + pageSize), continue: '||' } } : {}) }) };
  }));
  return calls;
}
it('acquires the 600th link with canonical directed evidence and preserves the cursor', async () => {
  const nodes = Array.from({ length: 600 }, (_, i) => `N${i}`);
  const calls = wiki({ A: nodes, ...Object.fromEntries(nodes.map(n => [n, []])) });
  const source = new ApiLinkSource(DEFAULT_LIMITS, { anytime: true });
  expect(typeof source.readLinkPage).toBe('function');
  const first = await source.readLinkPage(article('A'), 'out');
  expect(first.edges).toHaveLength(500); expect(first.complete).toBe(false);
  const second = await source.readLinkPage(article('A'), 'out');
  expect(second.edges.some(e => e.to.title === 'N599')).toBe(true); expect(second.complete).toBe(true);
  expect(calls.filter(u => u.searchParams.get('prop') === 'links|info').map(u => u.searchParams.get('plcontinue'))).toEqual([null, '500']);
});
it('reuses persistent adjacency as stale evidence and coalesces simultaneous reads', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); const calls = wiki({ A: ['B'], B: [] });
  const source = new ApiLinkSource(DEFAULT_LIMITS, { anytime: true });
  const [a, b] = await Promise.all([source.readLinkPage(article('A'), 'out'), source.readLinkPage(article('A'), 'out')]);
  expect(a.edges).toEqual(b.edges); expect(a.edges[0].fresh).toBe(true);
  expect(calls.filter(u => u.searchParams.get('prop') === 'links|info')).toHaveLength(1);
  const cached = await new ApiLinkSource(DEFAULT_LIMITS, { anytime: true }).readLinkPage(article('A'), 'out');
  expect(cached.edges[0].fresh).toBe(false);
  expect(calls.filter(u => u.searchParams.get('prop') === 'links|info')).toHaveLength(1);
});
it('canonicalizes intermediate aliases and probes a link beyond the adjacency prefix', async () => {
  const calls = wiki({ A: ['Alias'], B: [] }, { Alias: 'B' });
  const source = new ApiLinkSource(DEFAULT_LIMITS, { anytime: true });
  const page = await source.readLinkPage(article('A'), 'out');
  expect(page.edges[0]).toMatchObject({ from: article('A'), to: article('B'), rawTarget: 'Alias' });
  const probes = await source.probeLinks([article('A')], [article('B')]);
  expect(probes).toHaveLength(1); expect(probes[0].rawTarget).toBe('Alias');
  expect(calls.some(u => u.searchParams.has('pltitles'))).toBe(true);
});
it('finds incoming references through a redirect without making the redirect an extra step', async () => {
  wiki({ A: ['Alias'], B: [] }, { Alias: 'B' });
  const source = new ApiLinkSource(DEFAULT_LIMITS, { anytime: true });
  const found = [];
  for (let i = 0; i < 5; i++) { const page = await source.readLinkPage(article('B'), 'in'); found.push(...page.edges); if (page.complete) break; }
  expect(found.some(e => e.from.title === 'A' && e.to.title === 'B' && e.rawTarget === 'Alias')).toBe(true);
});
it('rejects a stale cached route whose link was removed', async () => {
  wiki({ A: [], B: [] });
  const source = new ApiLinkSource(DEFAULT_LIMITS, { anytime: true });
  expect(await source.validateEdges([{ from: article('A'), to: article('B'), rawTarget: 'B', fresh: false }])).toBe(false);
});
it('reserves validation requests within the actual HTTP budget', async () => {
  wiki({ A: ['B'], B: [] });
  const source = new ApiLinkSource({ ...DEFAULT_LIMITS, maxTotalRequests: 8 }, { anytime: true });
  for (const title of ['A', 'B', 'Missing1', 'Missing2', 'Missing3']) await source.canonicalize([title], 'en', 'explore');
  await source.canonicalize(['Missing'], 'en', 'explore');
  // Cached identities do not spend additional requests; a new name exhausts exploration at 6.
  await expect(source.canonicalize(['Other'], 'en', 'explore')).rejects.toThrow('лимит');
  expect(await source.validateEdges([{ from: article('A'), to: article('B'), rawTarget: 'B', fresh: false }])).toBe(true);
  expect(source.getRequestCount()).toBe(8);
});
it('rejects queued exploration after the shared deadline without spending a request', async () => {
  wiki({ A: [] }); const source = new ApiLinkSource(DEFAULT_LIMITS, { anytime: true });
  source.setDeadline(Date.now() - 1);
  await expect(source.canonicalize(['A'], 'en')).rejects.toThrow('Время');
  expect(source.getRequestCount()).toBe(0);
});
it('restores all continuation parameters across source instances', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const nodes = Array.from({ length: 501 }, (_, i) => `N${i}`);
  const calls = wiki({ A: nodes, ...Object.fromEntries(nodes.map(n => [n, []])) });
  await new ApiLinkSource(DEFAULT_LIMITS, { anytime: true }).readLinkPage(article('A'), 'out');
  const page = await new ApiLinkSource(DEFAULT_LIMITS, { anytime: true }).readLinkPage(article('A'), 'out');
  expect(page.edges).toHaveLength(501); expect(page.edges[0].fresh).toBe(false); expect(page.edges.at(-1)?.fresh).toBe(true);
  const request = calls.find(u => u.searchParams.has('plcontinue'))!;
  expect(request.searchParams.get('continue')).toBe('||');
});

it('invalid continuation discards the previous generation of fresh links', async () => {
  let phase = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: URL) => {
    const q = new URL(String(input)).searchParams;
    const body = q.has('plcontinue') ? { error: { code: 'badcontinue', info: 'expired' } }
      : q.get('prop') === 'links|info' ? { query: { pages: [{ title: 'A', ns: 0, links: [{ title: phase++ ? 'Current' : 'Removed', ns: 0 }] }] }, ...(phase === 1 ? { continue: { plcontinue: 'old' } } : {}) }
      : { query: { pages: q.get('titles')!.split('|').map(title => ({ title, ns: 0 })) } };
    return { ok: true, status: 200, json: async () => body };
  }));
  const source = new ApiLinkSource(DEFAULT_LIMITS, { anytime: true });
  await source.readLinkPage(article('A'), 'out');
  const restarted = await source.readLinkPage(article('A'), 'out');
  expect(restarted.edges.map(e => e.to.title)).toEqual(['Current']);
  expect(restarted.invalidatedEdges?.map(e => e.to.title)).toEqual(['Removed']);
});
it('rechecks persisted incoming aliases after a redirect is retargeted', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const aliases = { Alias: 'B' }; wiki({ X: ['Alias'], B: [], C: [] }, aliases);
  const first = new ApiLinkSource(DEFAULT_LIMITS, { anytime: true });
  await first.readLinkPage(article('B'), 'in'); await first.readLinkPage(article('B'), 'in');
  aliases.Alias = 'C';
  const resumed = await new ApiLinkSource(DEFAULT_LIMITS, { anytime: true }).readLinkPage(article('B'), 'in');
  expect(resumed.edges).toEqual([]);
});
it('rejects a stale multilingual alias whose canonical destination changed', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: URL) => {
    const q = new URL(String(input)).searchParams;
    return { ok: true, status: 200, json: async () => ({ query: q.get('prop') === 'langlinks'
      ? { pages: [{ title: 'A', ns: 0, langlinks: [{ lang: 'en', title: 'Alias' }] }] }
      : { pages: [{ title: 'New', ns: 0 }], redirects: [{ from: 'Alias', to: 'New' }] } }) };
  }));
  expect(await new ApiLinkSource(DEFAULT_LIMITS, { anytime: true }).validateEdges([
    { from: article('A', 'ru'), to: article('Old'), rawTarget: 'Alias', fresh: false },
  ])).toBe(false);
});
it('returns a bridge page before exploring the rest of a large redirect family', async () => {
  const aliases = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`Alias${i}`, 'B']));
  const calls = wiki({ A: ['Alias0'], B: [] }, aliases);
  const source = new ApiLinkSource({ ...DEFAULT_LIMITS, maxTotalRequests: 5 }, { anytime: true });
  await source.readLinkPage(article('B'), 'in'); await source.readLinkPage(article('B'), 'in');
  const before = calls.length;
  const page = await source.probeLinkPage([article('A')], [article('B')]);
  expect(page.edges.map(e => e.rawTarget)).toContain('Alias0');
  expect(page.complete).toBe(false); expect(page.cursor).toBeDefined();
  expect(calls.length - before).toBe(1);
});
it('preserves a newer complete persistent record against a late partial write', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const { LinkCache } = await import('../src/lib/linkCache');
  const edge = (to: string) => ({ from: article('A'), to: article(to), rawTarget: to, fresh: true });
  const first = new LinkCache(), second = new LinkCache();
  await first.put('race', { edges: [edge('B'), edge('C'), edge('D')], complete: true, storedAt: Date.now(), revision: 3 });
  await second.put('race', { edges: [edge('B'), edge('C')], complete: false, storedAt: Date.now(), revision: 2, cursor: { plcontinue: '2' } });
  const saved = await new LinkCache().get('race');
  expect(saved?.complete).toBe(true); expect(saved?.edges).toHaveLength(3);
});
it('serializes pagination across source instances and refreshes their persistent progress', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const calls = wiki({ A: ['B', 'C', 'D'], B: [], C: [], D: [] }, {}, 1);
  const transport = globalThis.fetch;
  let release!: () => void; let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  let held = false;
  vi.stubGlobal('fetch', vi.fn(async (input: URL, init?: RequestInit) => {
    const q = new URL(String(input)).searchParams;
    if (q.get('plcontinue') === '1' && !held) { held = true; entered(); await gate; }
    return transport(input, init);
  }));
  const a = new ApiLinkSource(DEFAULT_LIMITS, { anytime: true }), b = new ApiLinkSource(DEFAULT_LIMITS, { anytime: true });
  await a.readLinkPage(article('A'), 'out');
  const delayed = a.readLinkPage(article('A'), 'out'); await started;
  const next = b.readLinkPage(article('A'), 'out'); release();
  await delayed; expect((await next).edges).toHaveLength(3);
  const saved = await a.readLinkPage(article('A'), 'out');
  expect(saved.complete).toBe(true); expect(saved.edges).toHaveLength(3);
  expect(calls.filter(u => u.searchParams.get('prop') === 'links|info').map(u => u.searchParams.get('plcontinue'))).toEqual([null, '1', '2']);
});
it('resumes bridge pages without repeating the first alias group', async () => {
  const aliases = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`Alias${i}`, 'B']));
  const calls = wiki({ A: ['Alias0', 'Alias99'], B: [] }, aliases);
  const source = new ApiLinkSource(DEFAULT_LIMITS, { anytime: true });
  await source.readLinkPage(article('B'), 'in'); await source.readLinkPage(article('B'), 'in');
  const first = await source.probeLinkPage([article('A')], [article('B')]);
  const second = await new ApiLinkSource(DEFAULT_LIMITS, { anytime: true }).probeLinkPage([article('A')], [article('B')], first.cursor);
  const third = await source.probeLinkPage([article('A')], [article('B')], second.cursor);
  expect(third.complete).toBe(true); expect(third.edges.map(e => e.rawTarget)).toEqual(['Alias99']);
  const groups = calls.filter(u => u.searchParams.has('pltitles')).map(u => u.searchParams.get('pltitles')!.split('|'));
  expect(groups.map(g => g.length)).toEqual([50, 50, 1]); expect(new Set(groups.flat()).size).toBe(101);
});
