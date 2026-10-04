import { SearchDeadlineError } from './wikiApi';
import { RequestBudgetExceededError, ImprovementLimitError, articleIdentity, type AnytimeLinkSource, type CanonicalArticle, type LinkDirection, type LinkEvidence, type LinkPage, type LinkSource, type QueryPurpose } from './linkSource';
import type { ParsedArticle } from './parseInput';

export function articleKey(article: ParsedArticle): string { return JSON.stringify([article.lang, article.title]); }
export function articleFromKey(key: string): ParsedArticle {
  const value: unknown = JSON.parse(key);
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== 'string' || typeof value[1] !== 'string') throw new Error('Некорректная межъязыковая статья');
  return { lang: value[0], title: value[1] };
}

const isSearchLimit=(error:unknown)=>error instanceof RequestBudgetExceededError||error instanceof ImprovementLimitError||error instanceof SearchDeadlineError;

/** Bidirectional multilingual acquisition. Reverse language edges are verified
 * in their actual forward direction; reciprocal links are never assumed. */
export class MultilingualLinkSource implements LinkSource {
  private calls = 0;
  readonly forwardOnly = false;
  readonly articleKeys = true;
  readonly incompleteReverse = true;
  get searchLanguages():readonly string[]{return this.languages;}
  async prepareSearch(start:CanonicalArticle,end:CanonicalArticle,onEvidence?:(edges:LinkEvidence[])=>Promise<void>):Promise<LinkEvidence[]> {
    const publish=async(article:CanonicalArticle,direction:LinkDirection)=>{
      const edges=await this.languageEdges(article,direction);
      await onEvidence?.(edges);
      this.deliveredTranslations.add(JSON.stringify([articleIdentity(article),direction]));
      return edges;
    };
    const results=await Promise.allSettled([publish(start,'out'),publish(end,'in')]);
    const failure=results.find(result=>result.status==='rejected');
    if(failure?.status==='rejected')throw failure.reason;
    return results.flatMap(result=>result.status==='fulfilled'?result.value:[]);
  }
  private deliveredTranslations = new Set<string>();
  private languageLinks = new Map<string, Promise<Array<{title:string;lang:string}>>>();
  private languageQueue=new Map<string,Map<string,{resolve:(links:Array<{title:string;lang:string}>)=>void;reject:(error:unknown)=>void}>>();
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

  private langlinks(article: CanonicalArticle) {
    const key=articleIdentity(article);let pending=this.languageLinks.get(key);
    if(!pending){
      const request=this.source.getLanglinksBatch?new Promise<Array<{title:string;lang:string}>>((resolve,reject)=>{
        let queue=this.languageQueue.get(article.lang);
        if(!queue){queue=new Map();this.languageQueue.set(article.lang,queue);queueMicrotask(()=>{void this.flushLanguageQueue(article.lang);});}
        queue.set(article.title,{resolve,reject});
      }):this.source.getLanglinks!(article.title,article.lang);
      pending=request.catch(error=>{this.languageLinks.delete(key);throw error;});this.languageLinks.set(key,pending);
    }
    return pending;
  }
  private async flushLanguageQueue(lang:string):Promise<void>{
    const queue=this.languageQueue.get(lang);if(!queue)return;
    this.languageQueue.delete(lang);
    try{
      const pages=await this.source.getLanglinksBatch!([...queue.keys()],lang);
      for(const [title,waiter]of queue)waiter.resolve(pages.get(title)??[]);
    }catch(error){for(const waiter of queue.values())waiter.reject(error);}
  }
  private async canonical(article: CanonicalArticle): Promise<CanonicalArticle|null> {
    if('canonicalize' in this.source)return (await this.progressive().canonicalize([article.title],article.lang)).get(article.title)??null;
    return {...article,title:await this.source.resolveRedirect(article.title,article.lang)};
  }
  private async languageEdges(article:CanonicalArticle,direction:LinkDirection):Promise<LinkEvidence[]> {
    const key=JSON.stringify([articleIdentity(article),direction]);let pending=this.translations.get(key);
    if(!pending){
      pending=(async()=>{
        const targets=(await this.langlinks(article)).filter(target=>this.languages.includes(target.lang)&&target.lang!==article.lang);
        if(direction==='out'){
          const edges:LinkEvidence[]=[];
          for(const target of targets){
            const canonical=await this.canonical(target);if(canonical)edges.push({from:article,to:canonical,rawTarget:target.title,fresh:true});
          }
          return edges;
        }
        const candidates=new Map(targets.map(target=>[articleIdentity(target),target]));
        // Deliberately incomplete: a Wikibase candidate suppresses the manual
        // backlink lookup for that language, which may omit another article's
        // manual language link. Longer multilingual routes cannot certify global shortestness.
        for(const lang of this.languages.filter(lang=>lang!==article.lang&&!targets.some(target=>target.lang===lang))){
          try{
            for(const candidate of await this.source.getLangbacklinks?.(article.title,article.lang,lang)??[])candidates.set(articleIdentity(candidate),candidate);
          }catch(error){if(isSearchLimit(error))throw error;}
        }
        const verified=await Promise.allSettled([...candidates.values()].map(async candidate=>{
          const canonical=await this.canonical(candidate);if(!canonical)return null;
          for(const target of await this.langlinks(canonical)){
            if(target.lang!==article.lang)continue;
            const destination=target.title===article.title?article:await this.canonical(target);
            if(destination&&articleIdentity(destination)===articleIdentity(article))return {from:canonical,to:article,rawTarget:target.title,fresh:true};
          }
          return null;
        }));
        for(const result of verified)if(result.status==='rejected'&&isSearchLimit(result.reason))throw result.reason;
        const edges:LinkEvidence[]=verified.flatMap(result=>result.status==='fulfilled'&&result.value?[result.value]:[]);
        return edges;
      })().catch(error=>{
        if(direction==='in'&&!isSearchLimit(error))return [];
        this.translations.delete(key);throw error;
      });this.translations.set(key,pending);
    }
    return pending;
  }
  async readLinkPage(article: CanonicalArticle, direction: LinkDirection, purpose?: QueryPurpose): Promise<LinkPage> {
    const key=JSON.stringify([articleIdentity(article),direction]),firstTranslationPage=!this.deliveredTranslations.has(key);
    const languageEdges=await this.languageEdges(article,direction);
    const page=await this.progressive().readLinkPage(article,direction,purpose);
    this.deliveredTranslations.add(key);
    return {...page,completeFresh:false,edges:[...languageEdges,...page.edges],newEdges:[...(firstTranslationPage?languageEdges:[]),...(page.newEdges??page.edges)]};
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
  async getInlinks(key: string, _lang: string, cap?: number): Promise<string[]> {
    const article=articleFromKey(key);
    const [links,translations]=await Promise.all([this.source.getInlinks(article.title,article.lang,cap),this.languageEdges(article,'in')]);
    return [...translations.map(edge=>articleIdentity(edge.from)),...links.map(title=>articleKey({title,lang:article.lang}))];
  }
}
