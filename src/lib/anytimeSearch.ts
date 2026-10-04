import { articleIdentity, ArticleNotFoundError, RequestBudgetExceededError, type AnytimeLinkSource, type CanonicalArticle } from './linkSource';
import { SearchDeadlineError } from './wikiApi';
import { DiscoveredGraph, type GraphSnapshot } from './discoveredGraph';
import { bfsStrategy, bridgeStrategy, guidedStrategy, type StrategyContext, type StrategyState } from './searchStrategies';
import type { NotFoundReason, SearchProgress } from './bfs';
import type { SearchLimits } from './searchLimits';
export interface AnytimeResumeState {
  version:1;from:string;to:string;lang:string;forwardOnly:boolean;start:CanonicalArticle;end:CanonicalArticle;
  graph:GraphSnapshot;strategies:StrategyState;best:string[]|null;
}
export type AnytimeOutcome =
 | {status:'found';path:string[];exact:false;reason:'complete'|'budget'|'timeout';resumeState?:AnytimeResumeState}
 | {status:'not_found';reason:NotFoundReason;resumeState?:AnytimeResumeState};
export async function anytimeSearch(
 source:AnytimeLinkSource,from:string,to:string,lang:string,limits:SearchLimits,
 onProgress:(progress:SearchProgress)=>void=()=>{},
 options:{resumeState?:AnytimeResumeState;onCandidate?:(path:string[])=>void}={},
):Promise<AnytimeOutcome>{
 const deadline=Date.now()+limits.searchTimeout;source.setDeadline(deadline);
 const previous=options.resumeState;
 if(previous&&(previous.version!==1||previous.from!==from||previous.to!==to||previous.lang!==lang||previous.forwardOnly!==!!source.forwardOnly))throw new Error('Состояние продолжения не соответствует статьям');
 let start=previous?.start,end=previous?.end;
 let best=previous?.best??null;
 const graph=new DiscoveredGraph(previous?{edges:previous.graph.edges.map(e=>({...e,fresh:false}))}:undefined);
 let context:StrategyContext|undefined;
 const pathTitle=(article:CanonicalArticle)=>source.forwardOnly?articleIdentity(article):article.title;
 const snapshot=():AnytimeResumeState|undefined=>context?{
  version:1,from,to,lang,forwardOnly:!!source.forwardOnly,start:context.start,end:context.end,graph:graph.snapshot(),best,
  strategies:{completeOut:[...context.completeOut],completeIn:[...context.completeIn],probed:[...context.probed]},
 }:undefined;
 const finish=(reason:'complete'|'budget'|'timeout'|'depth'|'no_path'):AnytimeOutcome=>{
  const resumeState=reason==='complete'||reason==='no_path'?undefined:snapshot();
  return best?{status:'found',path:best,exact:false,reason:reason==='depth'?'complete':reason==='no_path'?'complete':reason,...(resumeState?{resumeState}:{})}
   :{status:'not_found',reason:reason==='complete'?'no_path':reason,...(resumeState?{resumeState}:{})};
 };
 const consider=async()=>{
  const route=graph.route(start!,end!,Math.min(12,2*limits.maxDepth));if(!route)return;
  const candidate=[pathTitle(start!),...route.map(e=>pathTitle(e.to))];if(best&&candidate.length>=best.length)return;
  if(!await source.validateEdges(route)){graph.discard(route.filter(e=>!e.fresh));return;}
  best=candidate;options.onCandidate?.(candidate);
 };
 try{
  if(!start||!end){
   const resolved=await source.canonicalize([...new Set([from,to])],lang);
   start=resolved.get(from)??undefined;end=resolved.get(to)??undefined;
   if(!start)throw new ArticleNotFoundError(from,lang);if(!end)throw new ArticleNotFoundError(to,lang);
  }
  context={source,graph,start,end,maxDepth:limits.maxDepth,completeOut:new Set(previous?.strategies.completeOut),completeIn:new Set(previous?.strategies.completeIn),probed:new Set(previous?.strategies.probed)};
  if(articleIdentity(start)===articleIdentity(end)){best=[pathTitle(start)];options.onCandidate?.(best);return finish('complete');}
  // A direct-link probe is cheap and bypasses the first-page truncation.
  if(!previous){await bridgeStrategy.step(context);await consider();if(best&&best.length<=2)return finish('complete');}
  while(Date.now()<deadline){
   let worked=false;
   for(const strategy of [bfsStrategy,bridgeStrategy,guidedStrategy]){
    if(Date.now()>=deadline)throw new SearchDeadlineError();
    const changed=await strategy.step(context);worked ||= changed;
    if(changed){
     await consider();
     const left=graph.reachable(start,'out',2*limits.maxDepth),right=source.forwardOnly?[]:graph.reachable(end,'in',limits.maxDepth);
     const visited=new Map([...left,...right].map(n=>[articleIdentity(n.article),n]));
     onProgress({depth:[...visited.values()].reduce((maximum,n)=>Math.max(maximum,n.depth),0),visitedCount:visited.size,round:1,roundCount:1,linkCap:500,frontierA:left.filter(n=>!context!.completeOut.has(articleIdentity(n.article))).length,frontierB:right.filter(n=>!context!.completeIn.has(articleIdentity(n.article))).length,sampleTitles:[...visited.values()].slice(-6).map(n=>n.article.title),strategy:strategy.name});
     if(best&&best.length<=2)return finish('complete');
    }
   }
   if(!worked){
    const boundary=graph.reachable(start,'out',2*limits.maxDepth).some(n=>n.depth>=2*limits.maxDepth&&!context!.completeOut.has(articleIdentity(n.article)));
    return finish(boundary?'depth':best?'complete':'no_path');
   }
  }
  return finish('timeout');
 }catch(error){
  if(error instanceof RequestBudgetExceededError)return finish('budget');
  if(error instanceof SearchDeadlineError||Date.now()>=deadline)return finish('timeout');
  throw error;
 }
}