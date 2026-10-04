import { articleIdentity, RequestBudgetExceededError, type AnytimeLinkSource, type CanonicalArticle, type LinkDirection, type LinkEvidence, type LinkPage } from '../../src/lib/linkSource';
export const node = (title: string, lang = 'en'): CanonicalArticle => ({title,lang});
/** Deterministic external-graph fixture. All searches exercise the real coordinator. */
export class FixtureSource implements AnytimeLinkSource {
  calls: Array<{kind:string;title?:string}> = [];
  private offsets = new Map<string,number>();
  constructor(public graph: Record<string,string[]>, private pageSize=1, private budget=4000, public forwardOnly=false) {}
  private request(kind:string,title?:string) { if(this.calls.length>=this.budget) throw new RequestBudgetExceededError(); this.calls.push({kind,title}); }
  setDeadline(_deadline:number) {}
  getRequestCount(){return this.calls.length;}
  getRemainingRequests(){return this.budget-this.calls.length;}
  async resolveRedirect(title:string){this.request('resolve',title);return title;}
  async canonicalize(titles:string[],lang:string){this.request('canonical');return new Map(titles.map(title=>[title, title in this.graph?node(title,lang):null]));}
  async getOutlinks(title:string,_lang:string,cap=500){this.request('out',title);return (this.graph[title]??[]).slice(0,cap);}
  async getInlinks(title:string,_lang:string,cap=500){this.request('in',title);return Object.keys(this.graph).filter(t=>this.graph[t].includes(title)).slice(0,cap);}
  async readLinkPage(article:CanonicalArticle,direction:LinkDirection):Promise<LinkPage>{
    this.request(direction,article.title);
    const key=JSON.stringify([articleIdentity(article),direction]);const offset=this.offsets.get(key)??0;
    const values=direction==='out'?this.graph[article.title]??[]:Object.keys(this.graph).filter(t=>this.graph[t].includes(article.title));
    const next=Math.min(values.length,offset+this.pageSize);this.offsets.set(key,next);
    return {edges:values.slice(0,next).map(title=>({from:direction==='out'?article:node(title,article.lang),to:direction==='out'?node(title,article.lang):article,rawTarget:direction==='out'?title:article.title,fresh:true})),complete:next>=values.length};
  }
  async probeLinks(from:CanonicalArticle[],to:CanonicalArticle[]):Promise<LinkEvidence[]>{
    this.request('bridge');const edges:LinkEvidence[]=[];
    for(const a of from)for(const b of to)if(a.lang===b.lang&&this.graph[a.title]?.includes(b.title))edges.push({from:a,to:b,rawTarget:b.title,fresh:true});
    return edges;
  }
  async validateEdges(edges:LinkEvidence[]){this.request('validate');return edges.every(e=>this.graph[e.from.title]?.includes(e.rawTarget));}
}
