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
