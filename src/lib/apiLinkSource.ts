import { ArticleNotFoundError, type LinkSource } from './linkSource';
import { DEFAULT_LIMITS, type SearchLimits } from './searchLimits';
import { WikiApiClient } from './wikiApi';

export class ApiLinkSource implements LinkSource {
  private api: WikiApiClient;
  private cache = new Map<string, Promise<string[] | string>>();

  constructor(private limits: SearchLimits = DEFAULT_LIMITS) {
    this.api = new WikiApiClient(limits, limits.maxTotalRequests);
  }

  private cached<T extends string[] | string>(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.cache.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = load().catch(error => { this.cache.delete(key); throw error; });
    this.cache.set(key, promise);
    return promise;
  }

  resolveRedirect(title: string, lang: string): Promise<string> {
    return this.cached(`resolve:${lang}:${title}`, async () => {
      const data = await this.api.query(lang, { titles: title, redirects: '1' });
      const page = data.query?.pages?.[0];
      if (!page || page.missing || page.ns !== 0) throw new ArticleNotFoundError(title, lang);
      return page.title;
    });
  }

  getOutlinks(title: string, lang: string): Promise<string[]> {
    return this.cached(`out:${lang}:${title}`, async () => {
      const result: string[] = [];
      let continuation: Record<string, string> = {};
      do {
        const data = await this.api.query(lang, {
          titles: title, prop: 'links', plnamespace: '0',
          pllimit: String(Math.min(500, this.limits.maxLinksPerPage - result.length)),
          ...continuation,
        });
        result.push(...(data.query?.pages?.[0]?.links ?? []).map(link => link.title));
        continuation = data.continue ?? {};
      } while (continuation.plcontinue && result.length < this.limits.maxLinksPerPage);
      return result.slice(0, this.limits.maxLinksPerPage);
    });
  }

  getInlinks(title: string, lang: string): Promise<string[]> {
    return this.cached(`in:${lang}:${title}`, async () => {
      const result: string[] = [];
      let continuation: Record<string, string> = {};
      do {
        const data = await this.api.query(lang, {
          list: 'backlinks', bltitle: title, blnamespace: '0',
          bllimit: String(Math.min(500, this.limits.maxLinksPerPage - result.length)),
          ...continuation,
        });
        result.push(...(data.query?.backlinks ?? []).map(link => link.title));
        continuation = data.continue ?? {};
      } while (continuation.blcontinue && result.length < this.limits.maxLinksPerPage);
      return result.slice(0, this.limits.maxLinksPerPage);
    });
  }
}
