import { articleIdentity, type AnytimeLinkSource, type CanonicalArticle, type LinkDirection } from './linkSource';
import type { DiscoveredGraph } from './discoveredGraph';
export type SearchStrategyName='bfs'|'bridge'|'guided';
export interface StrategyState { completeOut:string[];completeIn:string[];probed:string[]; pendingProbes?:Record<string,Record<string,string>> }
export interface StrategyContext {
  bfsTurn?:number;onEvidence?:()=>Promise<void>;concurrency?:number;source:AnytimeLinkSource;graph:DiscoveredGraph;start:CanonicalArticle;end:CanonicalArticle;maxDepth:number;
  completeFreshOut?:Set<string>;completeOut:Set<string>;completeIn:Set<string>;probed:Set<string>;pendingProbes?:Map<string,Record<string,string>>;
}
export interface SearchStrategy { name:SearchStrategyName;step(context:StrategyContext):Promise<boolean> }
const done=(c:StrategyContext,d:LinkDirection)=>d==='out'?c.completeOut:c.completeIn;
async function acquire(c:StrategyContext,article:CanonicalArticle,direction:LinkDirection){
  const page=await c.source.readLinkPage(article,direction);c.graph.discard(page.invalidatedEdges ?? []);c.graph.add(page.newEdges ?? page.edges);
  if(direction==='out'){c.completeFreshOut??=new Set();if(page.completeFresh)c.completeFreshOut.add(articleIdentity(article));else c.completeFreshOut.delete(articleIdentity(article));}
  if(page.complete)done(c,direction).add(articleIdentity(article));await c.onEvidence?.();return true;
}
function frontier(c:StrategyContext,direction:LinkDirection,depth=c.maxDepth){
  if(direction==='in'&&c.source.forwardOnly)return [];
  return c.graph.reachable(direction==='out'?c.start:c.end,direction,depth)
    .filter(n=>n.depth<depth&&!done(c,direction).has(articleIdentity(n.article)));
}
export const bfsStrategy:SearchStrategy={name:'bfs',async step(c){
  const languages=c.source.searchLanguages,language=languages?.[(c.bfsTurn??0)%languages.length];c.bfsTurn=(c.bfsTurn??0)+1;
  const layer=(direction:LinkDirection)=>{let nodes=frontier(c,direction);if(language&&nodes.some(n=>n.article.lang===language))nodes=nodes.filter(n=>n.article.lang===language);const min=nodes.reduce((m,n)=>Math.min(m,n.depth),Infinity);return nodes.filter(n=>n.depth===min);};
  const left=layer('out'),right=layer('in');if(!left.length&&!right.length)return false;
  const direction=!right.length||(left.length>0&&left.length<=right.length)?'out':'in';
  const batch=(direction==='out'?left:right).slice(0,Math.max(1,Math.min(5,c.concurrency??1)));
  const results=await Promise.allSettled(batch.map(n=>acquire(c,n.article,direction)));
  const failed=results.find(r=>r.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
  return true;
}};
export const bridgeStrategy:SearchStrategy={name:'bridge',async step(c){
  const left=c.graph.reachable(c.start,'out',2*c.maxDepth).filter(n=>n.depth<2*c.maxDepth).slice(0,50);
  const right=(c.source.forwardOnly?[{article:c.end,depth:0}]:c.graph.reachable(c.end,'in',c.maxDepth)).slice(0,50);
  if(!left.length||!right.length)return false;
  let key=JSON.stringify([left.map(n=>articleIdentity(n.article)),right.map(n=>articleIdentity(n.article))]);
  c.pendingProbes ??= new Map();
  const pending=c.pendingProbes.keys().next().value;
  if(pending)key=pending;
  if(c.probed.has(key))return false;
  if (c.source.probeLinkPage) {
    const page = await c.source.probeLinkPage(left.map(n=>n.article),right.map(n=>n.article),c.pendingProbes.get(key));
    c.graph.add(page.edges);
    if (page.complete) { c.probed.add(key); c.pendingProbes.delete(key); }
    else if (page.cursor) c.pendingProbes.set(key,page.cursor);
  } else { c.graph.add(await c.source.probeLinks(left.map(n=>n.article),right.map(n=>n.article)));c.probed.add(key); }
  return true;
}};
const tokens=(title:string)=>new Set(title.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu)??[]);
export const guidedStrategy:SearchStrategy={name:'guided',async step(c){
  const target=tokens(c.end.title),opposite=new Set(c.graph.reachable(c.end,'in',c.maxDepth).map(n=>articleIdentity(n.article)));
  const nodes=frontier(c,'out',2*c.maxDepth).slice(0,128);
  const rank=(article:CanonicalArticle)=>{
    const intersections=c.graph.countConnections(article,opposite);
    const overlap=[...tokens(article.title)].filter(t=>target.has(t)).length;return [intersections,overlap];
  };
  const ranked=nodes.map(n=>({...n,rank:rank(n.article)}));
  ranked.sort((a,b)=>b.rank[0]-a.rank[0]||b.rank[1]-a.rank[1]||a.article.title.localeCompare(b.article.title)||a.article.lang.localeCompare(b.article.lang));
  const beam=ranked.slice(0,8);if(!beam.length)return false;return acquire(c,beam[0].article,'out');
}};
