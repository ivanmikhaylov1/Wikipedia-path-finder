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
