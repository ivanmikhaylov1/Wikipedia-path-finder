import { articleIdentity, type AnytimeLinkSource, type CanonicalArticle, type LinkDirection, type LinkEvidence, type LinkPage, type LinkSource, type QueryPurpose } from './linkSource';
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
  private calls = 0;
  readonly forwardOnly = true;
  private translations = new Map<string, Promise<LinkEvidence[]>>();
  constructor(private source: LinkSource, private languages: string[]) {
    if (!source.getLanglinks) throw new Error('Межъязыковой поиск требует API-источник с langlinks');
  }
  getRequestCount(): number { return this.source.getRequestCount?.() ?? this.calls; }
  private progressive(): AnytimeLinkSource {
    if (!('readLinkPage' in this.source) || !('canonicalize' in this.source)) throw new Error('Источник не поддерживает последовательную загрузку графа');
    return this.source as AnytimeLinkSource;
  }
  getRemainingRequests(): number { return this.progressive().getRemainingRequests(); }
  setRequestLimit(limit: number): void { this.progressive().setRequestLimit?.(limit); }
  setDeadline(deadline: number): void { this.progressive().setDeadline(deadline); }
  async canonicalize(titles: string[], _lang: string, purpose?: QueryPurpose): Promise<Map<string, CanonicalArticle | null>> {
    const result = new Map<string, CanonicalArticle | null>();
    for (const key of titles) {
      const article = articleFromKey(key);
      result.set(key, (await this.progressive().canonicalize([article.title], article.lang, purpose)).get(article.title) ?? null);
    }
    return result;
  }
  async readLinkPage(article: CanonicalArticle, direction: LinkDirection, purpose?: QueryPurpose): Promise<LinkPage> {
    if (direction === 'in') return { edges: [], complete: false };
    const page = await this.progressive().readLinkPage(article, direction, purpose);
    const key = articleIdentity(article);
    let translated = this.translations.get(key);
    const firstTranslationPage = !translated;
    if (!translated) {
      translated = (async () => {
        const result: LinkEvidence[] = [];
        for (const target of await this.source.getLanglinks!(article.title, article.lang)) {
          if (!this.languages.includes(target.lang)) continue;
          const canonical = (await this.progressive().canonicalize([target.title], target.lang, purpose)).get(target.title);
          if (canonical) result.push({ from: article, to: canonical, rawTarget: target.title, fresh: true });
        }
        return result;
      })().catch(error => { this.translations.delete(key); throw error; });
      this.translations.set(key, translated);
    }
    const languageEdges=await translated;
    return { ...page, edges: [...page.edges, ...languageEdges], newEdges: [...(page.newEdges ?? page.edges), ...(firstTranslationPage ? languageEdges : [])] };
  }
  probeLinkPage(from: CanonicalArticle[], to: CanonicalArticle[], cursor?: Record<string, string>, purpose?: QueryPurpose) { return this.progressive().probeLinkPage!(from, to, cursor, purpose); }
  probeLinks(from: CanonicalArticle[], to: CanonicalArticle[], purpose?: QueryPurpose) { return this.progressive().probeLinks(from, to, purpose); }
  validateEdges(edges: LinkEvidence[], onInvalid?: (edge: LinkEvidence) => void) { return this.progressive().validateEdges(edges, onInvalid); }
  async resolveRedirect(key: string): Promise<string> {
    const article = articleFromKey(key);
    this.calls++;
    return articleKey({ ...article, title: await this.source.resolveRedirect(article.title, article.lang) });
  }
  async getOutlinks(key: string, _lang: string, cap?: number): Promise<string[]> {
    const article = articleFromKey(key);
    this.calls += 2;
    const [links, translations] = await Promise.all([
      this.source.getOutlinks(article.title, article.lang, cap),
      this.source.getLanglinks!(article.title, article.lang),
    ]);
    const translated = translations.filter(item => this.languages.includes(item.lang)).map(articleKey);
    return [...translated, ...links.map(title => articleKey({ lang: article.lang, title }))];
  }
  async getInlinks(): Promise<string[]> { return []; }
}
