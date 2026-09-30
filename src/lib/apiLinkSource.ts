import { parseHTML } from 'linkedom';
import { ArticleNotFoundError, type LinkSource } from './linkSource';
import { DEFAULT_LIMITS, type SearchLimits } from './searchLimits';
import { WikiApiClient } from './wikiApi';

type Direction = 'out' | 'in';
type CachedLinks = { links: string[]; sizeBytes?: number; storedAt: number; complete: boolean };
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DB_NAME = 'wikipedia-path-finder-links';
const STORE_NAME = 'links';

/** A missing or blocked IndexedDB never prevents a live API search. */
class PersistentLinks {
  private dbPromise?: Promise<IDBDatabase | null>;
  private open(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    this.dbPromise = new Promise(resolve => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore(STORE_NAME); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
    return this.dbPromise;
  }
  async get(key: string): Promise<CachedLinks | null> {
    const db = await this.open();
    if (!db) return null;
    return new Promise(resolve => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      request.onsuccess = () => {
        const value = request.result as CachedLinks | undefined;
        resolve(value && Date.now() - value.storedAt < TTL_MS ? value : null);
      };
      request.onerror = () => resolve(null);
    });
  }
  async put(key: string, value: CachedLinks): Promise<void> {
    const db = await this.open();
    if (!db) return;
    await new Promise<void>(resolve => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  }
}

function firstTextLink(html: string): string | null {
  const { document } = parseHTML(html);
  const paragraphs = document.querySelectorAll('.mw-parser-output > p, .mw-parser-output > section > p');
  for (const paragraph of Array.from(paragraphs)) {
    let parentheses = 0;
    let found: string | null = null;
    const walk = (node: Node): void => {
      if (found) return;
      if (node.nodeType === 3) {
        for (const char of node.textContent ?? '') {
          if (char === '(' || char === '（') parentheses++;
          if (char === ')' || char === '）') parentheses = Math.max(0, parentheses - 1);
        }
        return;
      }
      if (node.nodeType !== 1) return;
      const element = node as Element;
      const tag = element.localName;
      if (tag === 'i' || tag === 'em' || tag === 'sup' || tag === 'table') return;
      if (tag === 'a' && parentheses === 0 && !element.classList.contains('new')) {
        const href = element.getAttribute('href') ?? '';
        if (href.startsWith('/wiki/') && !href.includes('#')) {
          const title = element.getAttribute('title') ?? decodeURIComponent(href.slice(6)).replaceAll('_', ' ');
          if (title && !title.includes(':')) { found = title; return; }
        }
      }
      for (const child of Array.from(element.childNodes)) walk(child);
    };
    for (const child of Array.from(paragraph.childNodes)) walk(child);
    if (found) return found;
  }
  return null;
}

export class ApiLinkSource implements LinkSource {
  private api: WikiApiClient;
  private persistent = new PersistentLinks();
  private linkCache = new Map<string, CachedLinks>();
  private resolveCache = new Map<string, Promise<string>>();
  private firstLinkCache = new Map<string, Promise<string | null>>();
  private sizeCache = new Map<string, number>();
  private linkCeiling: number;

  constructor(private limits: SearchLimits = DEFAULT_LIMITS) {
    this.api = new WikiApiClient(limits, limits.maxTotalRequests);
    this.linkCeiling = Math.min(500, limits.maxLinksPerPage);
  }

  getRequestCount(): number { return this.api.getRequestCount(); }
  private key(lang: string, title: string, direction: Direction): string { return `${lang}:${title}:${direction}`; }
  private async cachedLinks(key: string): Promise<CachedLinks | null> {
    const memory = this.linkCache.get(key);
    if (memory) return memory;
    const stored = await this.persistent.get(key);
    if (stored) this.linkCache.set(key, stored);
    return stored;
  }
  private async saveLinks(key: string, links: string[], complete: boolean, sizeBytes?: number): Promise<void> {
    const value: CachedLinks = { links: links.slice(0, this.linkCeiling), sizeBytes, complete, storedAt: Date.now() };
    this.linkCache.set(key, value);
    await this.persistent.put(key, value);
  }

  resolveRedirect(title: string, lang: string): Promise<string> {
    const key = `${lang}:${title}`;
    const existing = this.resolveCache.get(key);
    if (existing) return existing;
    const promise = this.api.query(lang, { titles: title, redirects: '1' }).then(data => {
      const page = data.query?.pages?.[0];
      if (!page || page.missing || page.ns !== 0) throw new ArticleNotFoundError(title, lang);
      return page.title;
    }).catch(error => { this.resolveCache.delete(key); throw error; });
    this.resolveCache.set(key, promise);
    return promise;
  }

  async getOutlinks(title: string, lang: string, cap = this.limits.maxLinksPerPage): Promise<string[]> {
    const results = await this.getOutlinksBatch([title], lang, cap);
    return results.get(title)?.links ?? [];
  }

  getOutlinksBatch(titles: string[], lang: string, cap = this.limits.maxLinksPerPage): Promise<Map<string, { links: string[]; sizeBytes: number }>> {
    return this.getLinksBatch(titles, lang, cap, 'out');
  }

  async getInlinks(title: string, lang: string, cap = this.limits.maxLinksPerPage): Promise<string[]> {
    return (await this.getInlinksBatch([title], lang, cap)).get(title)?.links ?? [];
  }

  getInlinksBatch(titles: string[], lang: string, cap = this.limits.maxLinksPerPage): Promise<Map<string, { links: string[]; sizeBytes: number }>> {
    return this.getLinksBatch(titles, lang, cap, 'in');
  }

  private async getLinksBatch(titles: string[], lang: string, cap: number, direction: Direction): Promise<Map<string, { links: string[]; sizeBytes: number }>> {
    const effectiveCap = Math.max(0, Math.min(cap, this.linkCeiling));
    const result = new Map<string, { links: string[]; sizeBytes: number }>();
    const missing: string[] = [];
    for (const title of [...new Set(titles)]) {
      const saved = await this.cachedLinks(this.key(lang, title, direction));
      if (saved && (saved.links.length >= effectiveCap || saved.complete)) {
        result.set(title, { links: saved.links.slice(0, effectiveCap), sizeBytes: saved.sizeBytes ?? 0 });
        if (saved.sizeBytes !== undefined) this.sizeCache.set(`${lang}:${title}`, saved.sizeBytes);
      } else missing.push(title);
    }
    for (let offset = 0; offset < missing.length; offset += 50) {
      const group = missing.slice(offset, offset + 50);
      const collected = new Map(group.map(title => [title, { links: new Set<string>(), sizeBytes: 0 }]));
      const normalized = new Map<string, string>();
      let continuation: Record<string, string> = {};
      do {
        const params: Record<string, string> = direction === 'out'
          ? { prop: 'links|info', plnamespace: '0', pllimit: 'max' }
          : { prop: 'linkshere|info', lhnamespace: '0', lhlimit: 'max', lhshow: '!redirect' };
        const data = await this.api.query(lang, { ...params, titles: group.join('|'), ...continuation });
        for (const item of data.query?.normalized ?? []) normalized.set(item.from, item.to);
        for (const title of group) {
          const page = data.query?.pages?.find(item => item.title === (normalized.get(title) ?? title));
          const entry = collected.get(title)!;
          if (!page || page.missing || page.ns !== 0) continue;
          entry.sizeBytes = page.length ?? entry.sizeBytes;
          for (const link of (direction === 'out' ? page.links : page.linkshere) ?? []) {
            if (link.ns === 0 && entry.links.size < this.linkCeiling) entry.links.add(link.title);
          }
        }
        continuation = data.continue ?? {};
      } while (Object.keys(continuation).length > 0 && group.some(title => collected.get(title)!.links.size < effectiveCap));
      for (const title of group) {
        const entry = collected.get(title)!;
        const links = [...entry.links];
        await this.saveLinks(this.key(lang, title, direction), links, !Object.keys(continuation).length, entry.sizeBytes);
        this.sizeCache.set(`${lang}:${title}`, entry.sizeBytes);
        result.set(title, { links: links.slice(0, effectiveCap), sizeBytes: entry.sizeBytes });
      }
    }
    return result;
  }

  async getPageSizesBatch(titles: string[], lang: string): Promise<Map<string, number>> {
    const sizes = new Map<string, number>();
    const unknown = titles.filter(title => {
      const size = this.sizeCache.get(`${lang}:${title}`);
      if (size !== undefined) { sizes.set(title, size); return false; }
      return true;
    });
    const fromDisk = await Promise.all(unknown.map(title => this.cachedLinks(this.key(lang, title, 'out'))));
    const needInfo = unknown.filter((title, index) => {
      const size = fromDisk[index]?.sizeBytes;
      if (size === undefined) return true;
      sizes.set(title, size);
      this.sizeCache.set(`${lang}:${title}`, size);
      return false;
    });
    for (let offset = 0; offset < needInfo.length; offset += 50) {
      const group = needInfo.slice(offset, offset + 50);
      const data = await this.api.query(lang, { prop: 'info', titles: group.join('|') });
      for (const page of data.query?.pages ?? []) {
        if (page.length === undefined) continue;
        sizes.set(page.title, page.length);
        this.sizeCache.set(`${lang}:${page.title}`, page.length);
      }
    }
    return sizes;
  }

  async getLanglinks(title: string, lang: string): Promise<Array<{ title: string; lang: string }>> {
    const result: Array<{ title: string; lang: string }> = [];
    let continuation: Record<string, string> = {};
    do {
      const data = await this.api.query(lang, { prop: 'langlinks', titles: title, lllimit: 'max', ...continuation });
      result.push(...(data.query?.pages?.[0]?.langlinks ?? []));
      continuation = data.continue ?? {};
    } while (Object.keys(continuation).length);
    return result;
  }

  getFirstTextLink(title: string, lang: string): Promise<string | null> {
    const key = `${lang}:${title}`;
    const existing = this.firstLinkCache.get(key);
    if (existing) return existing;
    const promise = this.api.query(lang, { action: 'parse', page: title, prop: 'text' })
      .then(data => firstTextLink(data.parse?.text ?? ''))
      .catch(error => { this.firstLinkCache.delete(key); throw error; });
    this.firstLinkCache.set(key, promise);
    return promise;
  }
}
