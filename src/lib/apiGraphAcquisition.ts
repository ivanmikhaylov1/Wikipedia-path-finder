import { articleIdentity, type CanonicalArticle, type LinkDirection, type LinkEvidence, type LinkPage, type QueryPurpose } from './linkSource';
import { LinkCache, withAdjacencyLock, type AdjacencyRecord } from './linkCache';
import { ApiQueryError, type WikiApiClient } from './wikiApi';

/** Progressive graph acquisition shares the legacy source's HTTP client and budget. */
export class ApiGraphAcquisition {
  private identities = new Map<string, CanonicalArticle | null>();
  private aliases = new Map<string, Set<string>>();
  private cache = new LinkCache();
  private liveCoverage = new Map<string,number>();
  private delivered = new Set<string>();
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
    const key = JSON.stringify([article.lang, article.title, direction, direction === 'out' ? 'namespace0-generator-v2' : 'namespace0-canonical-v1']);
    const existing = this.inFlight.get(key); if (existing) return existing;
    const promise = withAdjacencyLock(key, () => this.acquire(key, article, direction, purpose)).then(page => {
      const first = !this.delivered.has(key); this.delivered.add(key);
      return { ...page, newEdges: first ? page.edges : page.newEdges ?? [] };
    }).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise); return promise;
  }
  private async acquire(key: string, article: CanonicalArticle, direction: LinkDirection, purpose: QueryPurpose): Promise<LinkPage> {
    let record: AdjacencyRecord = await this.cache.get(key) ?? { edges: [], complete: false, storedAt: Date.now(), phase: 'direct', aliases: [], aliasIndex: 0 };
    if(this.liveCoverage.get(key)!==(record.revision??0))this.liveCoverage.delete(key);
    if (record.complete) return { edges: record.edges, complete: true, completeFresh:this.liveCoverage.has(key) };
    const coversFromStart=direction==='out'&&(this.liveCoverage.has(key)||(!record.cursor&&!record.edges.length));
    const incoming = direction === 'in';
    const aliasesPhase = incoming && record.phase === 'aliases';
    const title = incoming && record.phase === 'references' ? record.aliases![record.aliasIndex ?? 0] : article.title;
    const params: Record<string, string> = aliasesPhase ? { prop: 'redirects', rdnamespace: '0', rdlimit: 'max' }
      : incoming ? { prop: 'linkshere|info', lhnamespace: '0', lhshow: '!redirect', lhlimit: 'max' }
      : { generator: 'links', prop: 'info', gplnamespace: '0', gpllimit: 'max', redirects: '1' };
    let invalidatedEdges: LinkEvidence[] = [];
    if (incoming && record.phase === 'references') {
      // Saved alias membership is a hint, never current-search proof.
      this.identities.delete(JSON.stringify([article.lang, title]));
      const current = (await this.canonicalize([title], article.lang, purpose)).get(title);
      if (!current || articleIdentity(current) !== articleIdentity(article)) {
        invalidatedEdges = record.edges.filter(e => e.rawTarget === title);
        record.edges = record.edges.filter(e => e.rawTarget !== title);
        record.aliasIndex = (record.aliasIndex ?? 0) + 1;
        record.complete = record.aliasIndex >= (record.aliases?.length ?? 0);
        record.cursor = undefined; record.revision = (record.revision ?? 0) + 1;
        record = await this.cache.put(key, record);
        return { edges: record.edges, complete: record.complete, invalidatedEdges };
      }
    }
    let data;
    try { data = await this.api.query(article.lang, { ...params, titles: title, ...record.cursor }, purpose); }
    catch (error) {
      if (!(error instanceof ApiQueryError) || !['badcontinue', 'invalidcontinue'].includes(error.code) || !record.cursor) throw error;
      const invalidatedEdges = record.edges;this.liveCoverage.delete(key);
      // Restart the full adjacency generation, including its incoming phases.
      await this.cache.put(key, { edges: [], complete: false, storedAt: Date.now(), phase: 'direct', aliases: [], aliasIndex: 0, revision: (record.revision ?? 0) + 1 });
      const restarted = await this.acquire(key, article, direction, purpose);
      return { ...restarted, invalidatedEdges: [...invalidatedEdges, ...(restarted.invalidatedEdges ?? [])] };
    }
    const page = data.query?.pages?.find(p => p.title === title) ?? data.query?.pages?.[0];
    const edges: LinkEvidence[] = [];
    if (aliasesPhase) {
      const values = (page?.redirects ?? []).filter(p => p.ns === 0).map(p => p.title);
      record.aliases = [...new Set([...(record.aliases ?? []), ...values])];
      const set = this.aliases.get(articleIdentity(article)) ?? new Set<string>();
      values.forEach(v => set.add(v)); this.aliases.set(articleIdentity(article), set);
    } else if (!incoming) {
      const redirects = new Map([...(data.query?.normalized ?? []), ...(data.query?.redirects ?? [])].map(r => [r.from,r.to]));
      const intermediates = new Set(redirects.values());
      for (const neighbor of data.query?.pages ?? []) {
        if (neighbor.missing || neighbor.invalid || neighbor.ns !== 0 || neighbor.title === article.title) continue;
        const target: CanonicalArticle = { title: neighbor.title, lang: article.lang, ...(neighbor.pageid ? {pageId:neighbor.pageid} : {}) };
        this.identities.set(articleIdentity(target),target);
        let rawTarget = target.title;
        for (const raw of redirects.keys()) {
          if(intermediates.has(raw))continue;
          let resolved=raw;const seen=new Set<string>();
          while(redirects.has(resolved)&&!seen.has(resolved)){seen.add(resolved);resolved=redirects.get(resolved)!;}
          if(resolved!==target.title)continue;
          rawTarget=raw;this.identities.set(JSON.stringify([article.lang,raw]),target);
          const aliases=this.aliases.get(articleIdentity(target))??new Set<string>();aliases.add(raw);this.aliases.set(articleIdentity(target),aliases);
        }
        edges.push({ from:article,to:target,rawTarget,fresh:true });
      }
    } else if (page && !page.missing && !page.invalid && page.ns === 0) {
      // lhshow=!redirect excludes redirect source pages; their returned titles
      // already identify canonical namespace-0 articles.
      for (const raw of page.linkshere ?? []) {
        if(raw.ns!==0 || raw.title===article.title)continue;
        const neighbor:CanonicalArticle={title:raw.title,lang:article.lang,...(raw.pageid?{pageId:raw.pageid}:{})};
        this.identities.set(articleIdentity(neighbor),neighbor);
        edges.push({from:neighbor,to:article,rawTarget:title,fresh:true});
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
    record.storedAt = Date.now(); record.revision = (record.revision ?? 0) + 1;
    const writtenRevision=record.revision;record = await this.cache.put(key, record);
    if(coversFromStart&&record.revision===writtenRevision&&record.edges.every(e=>e.fresh))this.liveCoverage.set(key,writtenRevision);
    else this.liveCoverage.delete(key);
    // Include already acquired edges so a resumed/new source can rebuild its discovered graph.
    return { edges: record.edges, newEdges: edges, complete: record.complete, completeFresh:record.complete&&this.liveCoverage.has(key), cursor: record.cursor };
  }
  async probeLinks(from: CanonicalArticle[], to: CanonicalArticle[], purpose: QueryPurpose = 'explore'): Promise<LinkEvidence[]> {
    const result: LinkEvidence[] = []; let cursor: Record<string, string> | undefined;
    do { const page = await this.probeLinkPage(from, to, cursor, purpose); result.push(...page.edges); cursor = page.cursor; } while (cursor);
    return result;
  }
  /** One HTTP page per scheduling turn. Jobs and cursor travel with the resume state. */
  async probeLinkPage(from: CanonicalArticle[], to: CanonicalArticle[], cursor?: Record<string, string>, purpose: QueryPurpose = 'explore'): Promise<LinkPage> {
    type Job = { lang: string; sources: CanonicalArticle[]; targets: Array<[string, CanonicalArticle]> };
    const state: { jobs: Job[]; index: number; continuation?: Record<string, string> } = cursor
      ? JSON.parse(cursor.probe) : { jobs: [], index: 0 };
    if (!cursor) for (const lang of new Set(from.map(a => a.lang))) {
      const sources = from.filter(a => a.lang === lang), targets = to.filter(a => a.lang === lang);
      const raw = new Map<string, CanonicalArticle>();
      targets.forEach(a => { raw.set(a.title, a); this.aliases.get(articleIdentity(a))?.forEach(alias => raw.set(alias, a)); });
      const entries = [...raw];
      for (let i = 0; i < sources.length; i += 50) for (let j = 0; j < entries.length; j += 50)
        state.jobs.push({ lang, sources: sources.slice(i, i + 50), targets: entries.slice(j, j + 50) });
    }
    const job = state.jobs[state.index]; if (!job) return { edges: [], complete: true };
    const data = await this.api.query(job.lang, { prop: 'links', plnamespace: '0', pllimit: 'max', titles: job.sources.map(a => a.title).join('|'), pltitles: job.targets.map(([title]) => title).join('|'), ...state.continuation }, purpose);
    const wanted = new Map(job.targets), edges: LinkEvidence[] = [];
    for (const page of data.query?.pages ?? []) {
      const source = job.sources.find(a => a.title === page.title); if (!source || page.missing || page.invalid || page.ns !== 0) continue;
      for (const link of page.links ?? []) {
        const target = wanted.get(link.title);
        // Canonical targets are fresh; aliases restored in a resumed job require validation.
        if (target && link.ns === 0) edges.push({ from: source, to: target, rawTarget: link.title, fresh: link.title === target.title });
      }
    }
    state.continuation = data.continue; if (!data.continue) state.index++;
    const complete = state.index >= state.jobs.length;
    return { edges, complete, ...(!complete ? { cursor: { probe: JSON.stringify(state) } } : {}) };
  }
  async validateEdges(edges: LinkEvidence[], onInvalid?: (edge: LinkEvidence) => void): Promise<boolean> {
    for (const edge of edges) {
      if (edge.fresh) continue;
      if (edge.from.lang !== edge.to.lang) {
        const identities = await this.canonicalize([edge.rawTarget], edge.to.lang, 'validate');
        if (articleIdentity(identities.get(edge.rawTarget) ?? { lang: '', title: '' }) !== articleIdentity(edge.to)) { onInvalid?.(edge); return false; }
        let cursor: Record<string, string> | undefined; let exists = false;
        do {
          const data = await this.api.query(edge.from.lang, { prop: 'langlinks', titles: edge.from.title, lllimit: 'max', ...cursor }, 'validate');
          exists ||= !!data.query?.pages?.[0]?.langlinks?.some(l => l.lang === edge.to.lang && l.title === edge.rawTarget);
          cursor = data.continue;
        } while (cursor && !exists);
        if (!exists) { onInvalid?.(edge); return false; }
      } else {
        const identities = await this.canonicalize([edge.rawTarget], edge.to.lang, 'validate');
        if (articleIdentity(identities.get(edge.rawTarget) ?? { lang: '', title: '' }) !== articleIdentity(edge.to)) { onInvalid?.(edge); return false; }
        const data = await this.api.query(edge.from.lang, { prop: 'links', titles: edge.from.title, plnamespace: '0', pltitles: edge.rawTarget, pllimit: 'max' }, 'validate');
        if (!data.query?.pages?.some(p => !p.missing && p.ns === 0 && p.title === edge.from.title && p.links?.some(l => l.ns === 0 && l.title === edge.rawTarget))) { onInvalid?.(edge); return false; }
      }
    }
    return true;
  }
}
