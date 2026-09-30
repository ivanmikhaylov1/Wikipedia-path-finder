import type { LinkSource } from './linkSource';
import type { ParsedArticle } from './parseInput';

export function articleKey(article: ParsedArticle): string { return JSON.stringify([article.lang, article.title]); }
export function articleFromKey(key: string): ParsedArticle {
  const value: unknown = JSON.parse(key);
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== 'string' || typeof value[1] !== 'string') throw new Error('Некорректная межъязыковая статья');
  return { lang: value[0], title: value[1] };
}

/** langlinks are directed. Without an inverse index, use forward BFS rather
 * than inventing reverse translation edges. BFS still sees only LinkSource. */
export class MultilingualLinkSource implements LinkSource {
  constructor(private source: LinkSource, private languages: string[]) {
    if (!source.getLanglinks) throw new Error('Межъязыковой поиск требует API-источник с langlinks');
  }
  getRequestCount(): number { return this.source.getRequestCount?.() ?? 0; }
  async resolveRedirect(key: string): Promise<string> {
    const article = articleFromKey(key);
    return articleKey({ ...article, title: await this.source.resolveRedirect(article.title, article.lang) });
  }
  async getOutlinks(key: string, _lang: string, cap?: number): Promise<string[]> {
    const article = articleFromKey(key);
    const [links, translations] = await Promise.all([
      this.source.getOutlinks(article.title, article.lang, cap),
      this.source.getLanglinks!(article.title, article.lang),
    ]);
    const translated = translations.filter(item => this.languages.includes(item.lang)).map(articleKey);
    return [...translated, ...links.map(title => articleKey({ lang: article.lang, title }))];
  }
  async getInlinks(): Promise<string[]> { return []; }
}
