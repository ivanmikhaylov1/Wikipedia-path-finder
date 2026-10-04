import { expect, it } from 'vitest';
import { MultilingualLinkSource, articleKey } from '../src/lib/multilingualLinkSource';
import type { LinkSource } from '../src/lib/linkSource';
import { bidirectionalBfs } from '../src/lib/bfs';
import { DEFAULT_LIMITS } from '../src/lib/searchLimits';

it('finds a directed shortest langlinks path and never assumes reciprocal translations', async () => {
  const source: LinkSource = {
    resolveRedirect: async title => title,
    getOutlinks: async title => title === 'A' ? ['Long'] : title === 'Long' ? ['B'] : [],
    getInlinks: async () => [],
    getLanglinks: async (title, lang) => title === 'A' && lang === 'ru' ? [{ title: 'B', lang: 'en' }, { title: 'Other', lang: 'de' }] : [],
  };
  const multilingual = new MultilingualLinkSource(source, ['ru', 'en']);
  const a = articleKey({ title: 'A', lang: 'ru' }), b = articleKey({ title: 'B', lang: 'en' });
  expect(await bidirectionalBfs(multilingual, a, b, 'ru', DEFAULT_LIMITS)).toEqual({ status: 'found', path: [a, b], exact: true });
  expect(await bidirectionalBfs(multilingual, b, a, 'en', DEFAULT_LIMITS)).toEqual({ status: 'not_found', reason: 'no_path' });
  expect(await multilingual.getOutlinks(a, 'ru')).not.toContain(articleKey({ title: 'Other', lang: 'de' }));
});

it('acquires canonical forward translations in the progressive source without inventing reverse translations', async () => {
  const { ApiLinkSource } = await import('../src/lib/apiLinkSource');
  const { vi } = await import('vitest');
  vi.stubGlobal('fetch', async (input: URL) => {
    const url = new URL(String(input)), q = url.searchParams, lang = url.hostname.split('.')[0];
    return { ok: true, status: 200, json: async () => ({ query: { pages: (q.get('titles') ?? '').split('|').map(title => ({ title, ns: 0, links: [], redirects: [], langlinks: title === 'A' && lang === 'ru' ? [{ title: 'B', lang: 'en' }] : [] })) } }) };
  });
  try {
    const source = new MultilingualLinkSource(new ApiLinkSource(DEFAULT_LIMITS, { anytime: true }), ['ru', 'en']);
    const page = await source.readLinkPage({ title: 'A', lang: 'ru' }, 'out');
    expect(page.edges).toEqual([{ from: { title: 'A', lang: 'ru' }, to: { title: 'B', lang: 'en' }, rawTarget: 'B', fresh: true }]);
    const reverse = await source.readLinkPage({ title: 'B', lang: 'en' }, 'in');
    expect(reverse.edges).toEqual([]); expect(reverse.complete).toBe(false);
  } finally { vi.unstubAllGlobals(); }
});
