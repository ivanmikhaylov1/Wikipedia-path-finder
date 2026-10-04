import { articleIdentity, type AnytimeLinkSource, type CanonicalArticle, type LinkDirection } from './linkSource';
import type { DiscoveredGraph } from './discoveredGraph';
export type SearchStrategyName='bfs'|'bridge'|'guided';
export interface StrategyState { completeOut:string[];completeIn:string[];probed:string[]; pendingProbes?:Record<string,Record<string,string>> }
export interface StrategyContext {
  source:AnytimeLinkSource;graph:DiscoveredGraph;start:CanonicalArticle;end:CanonicalArticle;maxDepth:number;
  completeOut:Set<string>;completeIn:Set<string>;probed:Set<string>;pendingProbes?:Map<string,Record<string,string>>;
}
export interface SearchStrategy { name:SearchStrategyName;step(context:StrategyContext):Promise<boolean> }
const done=(c:StrategyContext,d:LinkDirection)=>d==='out'?c.completeOut:c.completeIn;
async function acquire(c:StrategyContext,article:CanonicalArticle,direction:LinkDirection){
  const page=await c.source.readLinkPage(article,direction);c.graph.discard(page.invalidatedEdges ?? []);c.graph.add(page.edges);
  if(page.complete)done(c,direction).add(articleIdentity(article));return true;
}
function frontier(c:StrategyContext,direction:LinkDirection,depth=c.maxDepth){
  if(direction==='in'&&c.source.forwardOnly)return [];
  return c.graph.reachable(direction==='out'?c.start:c.end,direction,depth)
    .filter(n=>n.depth<depth&&!done(c,direction).has(articleIdentity(n.article)));
}
export const bfsStrategy:SearchStrategy={name:'bfs',async step(c){
  const layer=(direction:LinkDirection)=>{const nodes=frontier(c,direction);const min=nodes.reduce((m,n)=>Math.min(m,n.depth),Infinity);return nodes.filter(n=>n.depth===min);};
  const left=layer('out'),right=layer('in');if(!left.length&&!right.length)return false;
  const direction=!right.length||(left.length>0&&left.length<=right.length)?'out':'in';
  return acquire(c,(direction==='out'?left:right)[0].article,direction);
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
  const nodes=frontier(c,'out',2*c.maxDepth);
  const rank=(article:CanonicalArticle)=>{
    const intersections=c.graph.reachable(article,'out',1).filter(n=>n.depth===1&&opposite.has(articleIdentity(n.article))).length;
    const overlap=[...tokens(article.title)].filter(t=>target.has(t)).length;return [intersections,overlap];
  };
  nodes.sort((a,b)=>{const x=rank(a.article),y=rank(b.article);return y[0]-x[0]||y[1]-x[1]||a.article.title.localeCompare(b.article.title)||a.article.lang.localeCompare(b.article.lang);});
  const beam=nodes.slice(0,8);if(!beam.length)return false;return acquire(c,beam[0].article,'out');
}};
