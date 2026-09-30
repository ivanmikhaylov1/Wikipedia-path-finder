import type { ParsedArticle } from './parseInput';

export function readSharedQuery(search: string): { from: string; to: string; lang: string; multilingual: boolean } {
  const params = new URLSearchParams(search);
  const lang = params.get('lang') ?? 'ru';
  return { from: params.get('from') ?? '', to: params.get('to') ?? '', lang: /^[a-z]{2,12}(?:-[a-z]{2,12})?$/.test(lang) ? lang : 'ru', multilingual: params.get('mode') === 'multilingual' };
}

export function queryUrl(from: ParsedArticle, to: ParsedArticle, multilingual = false): string {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('from', multilingual ? `https://${from.lang}.wikipedia.org/wiki/${from.title.replaceAll(' ', '_')}` : from.title);
  url.searchParams.set('to', multilingual ? `https://${to.lang}.wikipedia.org/wiki/${to.title.replaceAll(' ', '_')}` : to.title);
  url.searchParams.set('lang', from.lang);
  if (multilingual) url.searchParams.set('mode', 'multilingual');
  return url.href;
}
