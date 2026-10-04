import { afterEach, expect, it, vi } from 'vitest';
import { WikiApiClient } from '../src/lib/wikiApi';
import { suggestArticles } from '../src/lib/articleSuggestions';

afterEach(() => vi.restoreAllMocks());

it('deduplicates by section and title, keeps multilingual names, and caps each section and the whole list', async () => {
  vi.spyOn(WikiApiClient.prototype, 'suggest').mockImplementation(async (_text, lang) =>
    lang === 'ru' ? ['Berlin', 'Berlin', 'Берлин', 'Третья'] : ['Berlin', `${lang} second`, `${lang} third`]);
  const result = await suggestArticles('Berlin');
  expect(result).toEqual({ articles: [
    { title: 'Berlin', lang: 'ru' }, { title: 'Берлин', lang: 'ru' },
    { title: 'Berlin', lang: 'en' }, { title: 'en second', lang: 'en' },
    { title: 'Berlin', lang: 'de' }, { title: 'de second', lang: 'de' },
    { title: 'Berlin', lang: 'fr' }, { title: 'fr second', lang: 'fr' },
  ], failed: false });
});

it('keeps partial results when one section fails', async () => {
  vi.spyOn(WikiApiClient.prototype, 'suggest').mockImplementation(async (_text, lang) => {
    if (lang === 'ru') throw new Error('offline');
    return lang === 'en' ? ['Bauhaus'] : [];
  });
  expect(await suggestArticles('Bauhaus')).toEqual({ articles: [{ title: 'Bauhaus', lang: 'en' }], failed: false });
});

it('signals a total failure but treats successful empty searches as available', async () => {
  const suggest = vi.spyOn(WikiApiClient.prototype, 'suggest').mockRejectedValue(new Error('offline'));
  expect(await suggestArticles('Unknown')).toEqual({ articles: [], failed: true });
  suggest.mockResolvedValue([]);
  expect(await suggestArticles('Unknown')).toEqual({ articles: [], failed: false });
});

it('allows at most one active suggestion request across concurrent fields', async () => {
  let active = 0, maximum = 0;
  vi.spyOn(WikiApiClient.prototype, 'suggest').mockImplementation(async () => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    return [];
  });
  await Promise.all([suggestArticles('Octopus'), suggestArticles('Bauhaus')]);
  expect(maximum).toBe(1);
});

it('discards an outdated answer and skips its remaining section requests', async () => {
  let current = true;
  const sections: string[] = [];
  vi.spyOn(WikiApiClient.prototype, 'suggest').mockImplementation(async (_text, lang) => {
    sections.push(lang); current = false; return ['Old result'];
  });
  expect(await suggestArticles('Old', () => current)).toEqual({ articles: [], failed: false });
  expect(sections).toEqual(['ru']);
});

it('skips a stale queued field before its first request', async () => {
  const texts: string[] = [];
  vi.spyOn(WikiApiClient.prototype, 'suggest').mockImplementation(async (text) => { texts.push(text); return []; });
  await Promise.all([suggestArticles('Current'), suggestArticles('Outdated', () => false)]);
  expect(texts).not.toContain('Outdated');
});


it('publishes the first section before a slow second section completes', async () => {
  let finishSecond!: (titles: string[]) => void;
  vi.spyOn(WikiApiClient.prototype, 'suggest').mockImplementation(async (_text, lang) => {
    if (lang === 'ru') return ['Берлин'];
    if (lang === 'en') return new Promise(resolve => { finishSecond = resolve; });
    return [];
  });
  const updates: { articles: { title: string; lang: string }[]; failed: boolean }[] = [];
  const pending = suggestArticles('Berlin', () => true, update => updates.push(update));
  await vi.waitFor(() => expect(finishSecond).toBeTypeOf('function'));
  expect(updates[0]).toEqual({ articles: [{ title: 'Берлин', lang: 'ru' }], failed: false });
  finishSecond(['Berlin']);
  await pending;
  expect(updates[0].articles).toHaveLength(1);
  expect(updates.at(-1)?.articles).toHaveLength(2);
});
