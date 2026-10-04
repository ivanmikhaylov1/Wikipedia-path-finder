import { describe, expect, it } from 'vitest';
import { initialArticlePair, resolveArticleSelection, resolveSearchPair } from '../src/lib/articleSelection';

describe('article pair initialization', () => {
  it('starts with the labeled API example in its two sections', () => {
    const pair = initialArticlePair('', false);
    expect(pair).toEqual({
      from: { value: 'Осьминоги', selected: { title: 'Осьминоги', lang: 'ru' } },
      to: { value: 'Bauhaus', selected: { title: 'Bauhaus', lang: 'en' } },
      example: true,
    });
    expect(resolveSearchPair(pair.from, pair.to).multilingual).toBe(true);
  });

  it('restores an explicit shared query ahead of the example', () => {
    const pair = initialArticlePair('?from=Berlin&to=Philosophie&lang=de', false);
    expect(pair.example).toBe(false);
    expect(resolveSearchPair(pair.from, pair.to)).toEqual({
      from: { title: 'Berlin', lang: 'de' }, to: { title: 'Philosophie', lang: 'de' }, multilingual: false,
    });
  });

  it.each([
    ['ru', 'en'], ['en', 'ru'], ['de', 'en'],
  ])('restores legacy multilingual plain titles from %s with target %s', (lang, targetLang) => {
    const pair = initialArticlePair(`?mode=multilingual&lang=${lang}&from=A&to=D`, false);
    expect(resolveSearchPair(pair.from, pair.to)).toEqual({
      from: { title: 'A', lang }, to: { title: 'D', lang: targetLang }, multilingual: true,
    });
  });

  it('uses the actual sections of shared Wikipedia URLs', () => {
    const pair = initialArticlePair('?from=https%3A%2F%2Fja.wikipedia.org%2Fwiki%2FA&to=https%3A%2F%2Ffr.wikipedia.org%2Fwiki%2FD&lang=ru', false);
    expect(resolveSearchPair(pair.from, pair.to)).toEqual({
      from: { title: 'A', lang: 'ja' }, to: { title: 'D', lang: 'fr' }, multilingual: true,
    });
  });

  it('keeps an explicitly empty shared endpoint instead of replacing it with an example', () => {
    const pair = initialArticlePair('?from=&to=D&lang=en', false);
    expect(pair.example).toBe(false);
    expect(pair.from).toEqual({ value: '', selected: null });
    expect(() => resolveSearchPair(pair.from, pair.to)).toThrow('Введите название статьи');
  });

  it('retains malformed shared input so it can be edited before submission', () => {
    const pair = initialArticlePair('?from=https%3A%2F%2Fexample.com%2Fwiki%2FA&to=D', false);
    expect(pair.from).toEqual({ value: 'https://example.com/wiki/A', selected: null });
    expect(() => resolveSearchPair(pair.from, pair.to)).toThrow('Нужна ссылка на статью Википедии');
  });

  it('provides a single-section local example', () => {
    const pair = initialArticlePair('', true);
    expect(pair.example).toBe(true);
    expect(resolveSearchPair(pair.from, pair.to, 'ru')).toEqual({
      from: { title: 'Москва', lang: 'ru' }, to: { title: 'Юрий Гагарин', lang: 'ru' }, multilingual: false,
    });
  });

  it.each([
    ['en', 'London', 'Philosophy'], ['de', 'Berlin', 'Philosophie'],
    ['fr', 'Paris', 'Philosophie'], ['es', 'Madrid', 'Filosofía'],
  ])('uses the shared %s local graph section for its example', (lang, from, to) => {
    const pair = initialArticlePair(`?lang=${lang}`, true);
    expect(resolveSearchPair(pair.from, pair.to, lang)).toEqual({
      from: { title: from, lang }, to: { title: to, lang }, multilingual: false,
    });
  });

  it('lets a cleared legacy target use RU instead of retaining its restored EN section', () => {
    const pair = initialArticlePair('?mode=multilingual&lang=ru&from=A&to=D', false);
    expect(resolveSearchPair(pair.from, { value: 'New target', selected: null })).toEqual({
      from: { title: 'A', lang: 'ru' }, to: { title: 'New target', lang: 'ru' }, multilingual: false,
    });
  });

  it('ignores the legacy remote mode for a local shared query', () => {
    const pair = initialArticlePair('?from=A&to=D&lang=en&mode=multilingual', true);
    expect(resolveSearchPair(pair.from, pair.to, 'en')).toEqual({
      from: { title: 'A', lang: 'en' }, to: { title: 'D', lang: 'en' }, multilingual: false,
    });
  });
});

describe('article selection resolution', () => {
  it('keeps the selected article section even when it differs from the fallback', () => {
    expect(resolveArticleSelection({ value: 'Bauhaus', selected: { title: 'Bauhaus', lang: 'en' } })).toEqual({ title: 'Bauhaus', lang: 'en' });
  });

  it('resolves edited raw input with the visible RU fallback', () => {
    expect(resolveArticleSelection({ value: 'New_title', selected: null })).toEqual({ title: 'New title', lang: 'ru' });
  });

  it('uses the section from an input URL instead of the raw-text fallback', () => {
    expect(resolveArticleSelection({ value: 'https://es.wikipedia.org/wiki/Filosof%C3%ADa', selected: null }, 'ru')).toEqual({ title: 'Filosofía', lang: 'es' });
  });

  it('resolves local raw input in the graph section', () => {
    expect(resolveSearchPair({ value: 'A', selected: null }, { value: 'D', selected: null }, 'en')).toEqual({
      from: { title: 'A', lang: 'en' }, to: { title: 'D', lang: 'en' }, multilingual: false,
    });
  });

  it('derives multilingual mode from the selected endpoint sections', () => {
    expect(resolveSearchPair(
      { value: 'Москва', selected: { title: 'Москва', lang: 'ru' } },
      { value: 'Bauhaus', selected: { title: 'Bauhaus', lang: 'en' } },
    ).multilingual).toBe(true);
  });

  it('rejects a mixed pair with local graph context', () => {
    expect(() => resolveSearchPair(
      { value: 'Москва', selected: { title: 'Москва', lang: 'ru' } },
      { value: 'Bauhaus', selected: { title: 'Bauhaus', lang: 'en' } }, 'ru',
    )).toThrow(/Локальный.*RU.*EN/);
  });

  it('rejects a same-section pair outside the local graph section', () => {
    expect(() => resolveSearchPair(
      { value: 'A', selected: { title: 'A', lang: 'en' } },
      { value: 'D', selected: { title: 'D', lang: 'en' } }, 'ru',
    )).toThrow(/Локальный.*RU.*EN/);
  });

  it('distinguishes identical display titles selected in different sections', () => {
    expect(resolveSearchPair(
      { value: 'Bauhaus', selected: { title: 'Bauhaus', lang: 'ru' } },
      { value: 'Bauhaus', selected: { title: 'Bauhaus', lang: 'en' } },
    )).toEqual({
      from: { title: 'Bauhaus', lang: 'ru' }, to: { title: 'Bauhaus', lang: 'en' }, multilingual: true,
    });
  });

  it('accepts a one-article query in the same section', () => {
    expect(resolveSearchPair(
      { value: 'Москва', selected: { title: 'Москва', lang: 'ru' } },
      { value: 'Москва', selected: { title: 'Москва', lang: 'ru' } },
    )).toEqual({
      from: { title: 'Москва', lang: 'ru' }, to: { title: 'Москва', lang: 'ru' }, multilingual: false,
    });
  });
});
