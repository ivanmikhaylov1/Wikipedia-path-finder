import { articleIdentity, type CanonicalArticle, type LinkDirection, type LinkEvidence, type LinkPage, type QueryPurpose } from './linkSource';
import { LinkCache, type AdjacencyRecord } from './linkCache';
import { ApiQueryError, type WikiApiClient } from './wikiApi';

/** Progressive graph acquisition shares the legacy source's HTTP client and budget. */
export class ApiGraphAcquisition {
  private identities = new Map<string, CanonicalArticle | null>();
  private aliases = new Map<string, Set<string>>();
  private cache = new LinkCache();
  private inFlight = new Map<string, Promise<LinkPage>>();
  constructor(private api: WikiApiClient) {}
  async canonicalize(titles: string[], lang: string, purpose: QueryPurpose = 'explore'): Promise<Map<string, CanonicalArticle | null>> {
    const result = new Map<string, CanonicalArticle | null>();
    const unknown = [...new Set(titles)].filter(title => {
      const key = JSON.stringify([lang, title]);
      if (purpose !== 'validate' && this.identities.has(key)) { result.set(title, this.identities.get(key)!); return false; }
      return true;
    });
    for (let i = 0; i < unknown.length; i += 50) {
      const group = unknown.slice(i, i + 50);
      const data = await this.api.query(lang, { titles: group.join('|'), redirects: '1' }, purpose);
      const redirect = new Map([...(data.query?.normalized ?? []), ...(data.query?.redirects ?? [])].map(r => [r.from, r.to]));
      for (const raw of group) {
        let title = raw; const seen = new Set<string>();
        while (redirect.has(title) && !seen.has(title)) { seen.add(title); title = redirect.get(title)!; }
        const page = seen.has(title) ? undefined : data.query?.pages?.find(p => p.title === title);
        const article = page && !page.missing && !page.invalid && page.ns === 0 ? { title: page.title, lang, ...(page.pageid ? { pageId: page.pageid } : {}) } : null;
        result.set(raw, article); this.identities.set(JSON.stringify([lang, raw]), article);
        if (article) {
          this.identities.set(articleIdentity(article), article);
          if (raw !== article.title) {
            const key = articleIdentity(article); const set = this.aliases.get(key) ?? new Set<string>();
            set.add(raw); this.aliases.set(key, set);
          }
        }
      }
    }
    return result;
  }
  readLinkPage(article: CanonicalArticle, direction: LinkDirection, purpose: QueryPurpose = 'explore'): Promise<LinkPage> {
    const key = JSON.stringify([article.lang, article.title, direction, 'namespace0-canonical-v1']);
    const existing = this.inFlight.get(key); if (existing) return existing;
    const promise = this.acquire(key, article, direction, purpose).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise); return promise;
  }
  private async acquire(key: string, article: CanonicalArticle, direction: LinkDirection, purpose: QueryPurpose): Promise<LinkPage> {
    const record: AdjacencyRecord = await this.cache.get(key) ?? { edges: [], complete: false, storedAt: Date.now(), phase: 'direct', aliases: [], aliasIndex: 0 };
    if (record.complete) return { edges: record.edges, complete: true };
    const incoming = direction === 'in';
    const aliasesPhase = incoming && record.phase === 'aliases';
    const title = incoming && record.phase === 'references' ? record.aliases![record.aliasIndex ?? 0] : article.title;
    const params: Record<string, string> = aliasesPhase ? { prop: 'redirects', rdnamespace: '0', rdlimit: 'max' }
      : incoming ? { prop: 'linkshere|info', lhnamespace: '0', lhshow: '!redirect', lhlimit: 'max' }
      : { prop: 'links|info', plnamespace: '0', pllimit: 'max' };
    let data;
    try { data = await this.api.query(article.lang, { ...params, titles: title, ...record.cursor }, purpose); }
    catch (error) {
      if (!(error instanceof ApiQueryError) || !['badcontinue', 'invalidcontinue'].includes(error.code) || !record.cursor) throw error;
      record.cursor = undefined;
      data = await this.api.query(article.lang, { ...params, titles: title }, purpose);
    }
    const page = data.query?.pages?.find(p => p.title === title) ?? data.query?.pages?.[0];
    const edges: LinkEvidence[] = [];
    if (aliasesPhase) {
      const values = (page?.redirects ?? []).filter(p => p.ns === 0).map(p => p.title);
      record.aliases = [...new Set([...(record.aliases ?? []), ...values])];
      const set = this.aliases.get(articleIdentity(article)) ?? new Set<string>();
      values.forEach(v => set.add(v)); this.aliases.set(articleIdentity(article), set);
    } else if (page && !page.missing && !page.invalid && page.ns === 0) {
      const raw = (incoming ? page.linkshere : page.links) ?? [];
      const titles = raw.filter(p => p.ns === 0).map(p => p.title);
      const identities = await this.canonicalize(titles, article.lang, purpose);
      for (const rawTitle of titles) {
        const neighbor = identities.get(rawTitle); if (!neighbor || articleIdentity(neighbor) === articleIdentity(article)) continue;
        edges.push({ from: incoming ? neighbor : article, to: incoming ? article : neighbor, rawTarget: incoming ? title : rawTitle, fresh: true });
      }
    }
    const combined = new Map(record.edges.map(e => [JSON.stringify([articleIdentity(e.from), articleIdentity(e.to), e.rawTarget]), e]));
    edges.forEach(e => combined.set(JSON.stringify([articleIdentity(e.from), articleIdentity(e.to), e.rawTarget]), e));
    record.edges = [...combined.values()]; record.cursor = data.continue;
    if (!data.continue) {
      if (!incoming) record.complete = true;
      else if (record.phase === 'direct') record.phase = 'aliases';
      else if (record.phase === 'aliases') { record.phase = 'references'; record.complete = !record.aliases?.length; }
      else { record.aliasIndex = (record.aliasIndex ?? 0) + 1; record.complete = record.aliasIndex >= (record.aliases?.length ?? 0); }
    }
    record.storedAt = Date.now(); await this.cache.put(key, record);
    // Include already acquired edges so a resumed/new source can rebuild its discovered graph.
    return { edges: record.edges, complete: record.complete, cursor: record.cursor };
  }
  async probeLinks(from: CanonicalArticle[], to: CanonicalArticle[], purpose: QueryPurpose = 'explore'): Promise<LinkEvidence[]> {
    const result: LinkEvidence[] = [];
    for (const lang of new Set(from.map(a => a.lang))) {
      const sources = from.filter(a => a.lang === lang); const targets = to.filter(a => a.lang === lang);
      const rawTargets = new Map<string, CanonicalArticle>();
      targets.forEach(a => { rawTargets.set(a.title, a); this.aliases.get(articleIdentity(a))?.forEach(alias => rawTargets.set(alias, a)); });
      const entries = [...rawTargets];
      for (let i = 0; i < sources.length; i += 50) for (let j = 0; j < entries.length; j += 50) {
        const group = sources.slice(i, i + 50); const wanted = new Map(entries.slice(j, j + 50)); let cursor: Record<string, string> | undefined;
        do {
          const data = await this.api.query(lang, { prop: 'links', plnamespace: '0', pllimit: 'max', titles: group.map(a => a.title).join('|'), pltitles: [...wanted.keys()].join('|'), ...cursor }, purpose);
          for (const page of data.query?.pages ?? []) {
            const source = group.find(a => a.title === page.title); if (!source || page.missing || page.ns !== 0) continue;
            for (const link of page.links ?? []) { const target = wanted.get(link.title); if (target && link.ns === 0) result.push({ from: source, to: target, rawTarget: link.title, fresh: true }); }
          }
          cursor = data.continue;
        } while (cursor);
      }
    }
    return result;
  }
  async validateEdges(edges: LinkEvidence[]): Promise<boolean> {
    for (const edge of edges) {
      if (edge.fresh) continue;
      if (edge.from.lang !== edge.to.lang) {
        let cursor: Record<string, string> | undefined; let exists = false;
        do {
          const data = await this.api.query(edge.from.lang, { prop: 'langlinks', titles: edge.from.title, lllimit: 'max', ...cursor }, 'validate');
          exists ||= !!data.query?.pages?.[0]?.langlinks?.some(l => l.lang === edge.to.lang && l.title === edge.rawTarget);
          cursor = data.continue;
        } while (cursor && !exists);
        if (!exists) return false;
      } else {
        const identities = await this.canonicalize([edge.rawTarget], edge.to.lang, 'validate');
        if (articleIdentity(identities.get(edge.rawTarget) ?? { lang: '', title: '' }) !== articleIdentity(edge.to)) return false;
        const data = await this.api.query(edge.from.lang, { prop: 'links', titles: edge.from.title, plnamespace: '0', pltitles: edge.rawTarget, pllimit: 'max' }, 'validate');
        if (!data.query?.pages?.some(p => !p.missing && p.ns === 0 && p.title === edge.from.title && p.links?.some(l => l.ns === 0 && l.title === edge.rawTarget))) return false;
      }
    }
    return true;
  }
}
