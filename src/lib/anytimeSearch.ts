import { articleIdentity, ArticleNotFoundError, RequestBudgetExceededError, ImprovementLimitError, type AnytimeLinkSource, type CanonicalArticle } from './linkSource';
import { SearchDeadlineError } from './wikiApi';
import { DiscoveredGraph, type GraphSnapshot } from './discoveredGraph';
import { bfsStrategy, bridgeStrategy, guidedStrategy, type StrategyContext, type StrategyState, type SearchStrategy, type SearchStrategyName } from './searchStrategies';
import type { NotFoundReason, SearchProgress } from './bfs';
import type { SearchLimits } from './searchLimits';
const DEFAULT_IMPROVEMENT_TIMEOUT=8000, DEFAULT_IMPROVEMENT_REQUESTS=80;
export interface StrategyWork { strategy:SearchStrategyName;requests:number;durationMs:number;candidate:boolean }
export interface AnytimeResumeState {
  version:1;from:string;to:string;lang:string;forwardOnly:boolean;start:CanonicalArticle;end:CanonicalArticle;
  graph:GraphSnapshot;strategies:StrategyState;best:string[]|null;
}
export type AnytimeOutcome =
 | {status:'found';path:string[];exact:boolean;reason:'complete'|'budget'|'timeout'|'improvement';resumeState?:AnytimeResumeState}
 | {status:'not_found';reason:NotFoundReason;resumeState?:AnytimeResumeState};
export async function anytimeSearch(
 source:AnytimeLinkSource,from:string,to:string,lang:string,limits:SearchLimits,
 onProgress:(progress:SearchProgress)=>void=()=>{},
 options:{resumeState?:AnytimeResumeState;onCandidate?:(path:string[])=>void;onStrategyWork?:(sample:StrategyWork)=>void}={},
):Promise<AnytimeOutcome>{
 const deadline=Date.now()+limits.searchTimeout;source.setDeadline(deadline);
 const previous=options.resumeState;
 if(previous&&(previous.version!==1||previous.from!==from||previous.to!==to||previous.lang!==lang||previous.forwardOnly!==!!source.forwardOnly))throw new Error('Состояние продолжения не соответствует статьям');
 let start=previous?.start,end=previous?.end;
 let best=previous?.best??null,bestVerifiedNow=false;
 let improvementDeadline=Infinity, improvementRequestLimit=Infinity;
 const beginImprovement=()=>{
  if(improvementDeadline!==Infinity)return;
  improvementDeadline=Date.now()+(limits.improvementTimeout??DEFAULT_IMPROVEMENT_TIMEOUT);
  improvementRequestLimit=(source.getRequestCount?.()??0)+(limits.improvementMaxRequests??DEFAULT_IMPROVEMENT_REQUESTS);
  source.setDeadline(Math.min(deadline,improvementDeadline));source.setRequestLimit?.(improvementRequestLimit);
 };
 const effortExceeded=()=>best&&(Date.now()>=improvementDeadline||(source.getRequestCount?.()??0)>=improvementRequestLimit);
 if(best)beginImprovement();
 const graph=new DiscoveredGraph(previous?{edges:previous.graph.edges.map(e=>({...e,fresh:false}))}:undefined);
 let context:StrategyContext|undefined;
 const pathTitle=(article:CanonicalArticle)=>source.forwardOnly?articleIdentity(article):article.title;
 const snapshot=():AnytimeResumeState|undefined=>context?{
  version:1,from,to,lang,forwardOnly:!!source.forwardOnly,start:context.start,end:context.end,graph:graph.snapshot(),best,
  strategies:{completeOut:[...context.completeOut],completeIn:[...context.completeIn],probed:[...context.probed],pendingProbes:Object.fromEntries(context.pendingProbes ?? [])},
 }:undefined;
 const optimal=()=>{
  if(!best||!bestVerifiedNow||!context)return false;
  if(best.length<=2)return true;
  // Only full, live, same-language forward layers certify this lower bound.
  // Cached or partially acquired pages cannot prove missing shorter edges.
  if(source.forwardOnly)return false;
  const bound=best.length-2;
  for(const node of graph.reachable(context.start,'out',Math.min(12,2*limits.maxDepth))){
   if(node.depth>=bound)return true;
   if(!context.completeFreshOut?.has(articleIdentity(node.article)))return false;
  }
  return true;
 };
 const finish=(reason:'complete'|'budget'|'timeout'|'improvement'|'depth'|'no_path'):AnytimeOutcome=>{
  const resumeState=reason==='complete'||reason==='no_path'||reason==='depth'?undefined:snapshot();
  return best?{status:'found',path:best,exact:reason==='complete'&&optimal(),reason:reason==='depth'?'complete':reason==='no_path'?'complete':reason,...(resumeState?{resumeState}:{})}
   :{status:'not_found',reason:reason==='complete'||reason==='improvement'?'no_path':reason,...(resumeState?{resumeState}:{})};
 };
 const considerNext=async()=>{
  while (true) {
  const route=graph.route(start!,end!,Math.min(12,2*limits.maxDepth));if(!route)return;
  const candidate=[pathTitle(start!),...route.map(e=>pathTitle(e.to))];if(best&&candidate.length>=best.length)return;
  const invalid: typeof route = [];
  if(!await source.validateEdges(route, edge=>invalid.push(edge))){const rejected=invalid.length?invalid:route.filter(e=>!e.fresh);if(!rejected.length)return;graph.discard(rejected);continue;}
  best=candidate;bestVerifiedNow=true;beginImprovement();options.onCandidate?.(candidate);if(optimal())source.setDeadline(Date.now());return;
  }
 };
 let consideration=Promise.resolve();
 const consider=()=>{
  const next=consideration.then(considerNext);consideration=next.catch(()=>{});return next;
 };
 const runStrategy=async(strategy:SearchStrategy)=>{
  const begun=performance.now(),requests=source.getRequestCount?.()??0,oldLength=best?.length??Infinity;
  try{
   let changed:boolean;
   try{changed=await strategy.step(context!);}catch(error){await consider();throw error;}
   if(changed)await consider();
   return changed;
  }finally{
   options.onStrategyWork?.({strategy:strategy.name,requests:(source.getRequestCount?.()??0)-requests,durationMs:performance.now()-begun,candidate:(best?.length??Infinity)<oldLength});
  }
 };
 try{
  if(!start||!end){
   const resolved=await source.canonicalize([...new Set([from,to])],lang);
   start=resolved.get(from)??undefined;end=resolved.get(to)??undefined;
   if(!start)throw new ArticleNotFoundError(from,lang);if(!end)throw new ArticleNotFoundError(to,lang);
  }
  context={source,graph,start,end,onEvidence:consider,completeFreshOut:new Set(),concurrency:limits.concurrency,maxDepth:limits.maxDepth,completeOut:new Set(previous?.strategies.completeOut),completeIn:new Set(previous?.strategies.completeIn),probed:new Set(previous?.strategies.probed),pendingProbes:new Map(Object.entries(previous?.strategies.pendingProbes ?? {}))};
  onProgress({depth:0,visitedCount:articleIdentity(start)===articleIdentity(end)?1:2,round:1,roundCount:1,linkCap:500,frontierA:1,frontierB:source.forwardOnly?0:1});
  if(articleIdentity(start)===articleIdentity(end)){best=[pathTitle(start)];bestVerifiedNow=true;options.onCandidate?.(best);return finish('complete');}
  await consider();if(optimal()||best&&best.length<=2)return finish('complete');
  // A direct-link probe is cheap and bypasses the first-page truncation.
  if(!previous){await runStrategy(bridgeStrategy);if(optimal()||best&&best.length<=2)return finish('complete');}
  let rotation=0;
  while(Date.now()<deadline){
   rotation++;let worked=false,bfsWorked=false;
   for(const strategy of [bfsStrategy,bridgeStrategy,guidedStrategy]){
    if(strategy===guidedStrategy&&rotation%4!==0&&bfsWorked)continue;
    if(effortExceeded())return finish('improvement');
    if(Date.now()>=deadline)throw new SearchDeadlineError();
    const changed=await runStrategy(strategy);
    if(strategy===bfsStrategy)bfsWorked=changed;
    worked ||= changed;
    if(changed){
     const left=graph.reachable(start,'out',2*limits.maxDepth),right=source.forwardOnly?[]:graph.reachable(end,'in',limits.maxDepth);
     const visited=new Map([...left,...right].map(n=>[articleIdentity(n.article),n]));
     onProgress({depth:[...visited.values()].reduce((maximum,n)=>Math.max(maximum,n.depth),0),visitedCount:visited.size,round:1,roundCount:1,linkCap:500,frontierA:left.filter(n=>!context!.completeOut.has(articleIdentity(n.article))).length,frontierB:right.filter(n=>!context!.completeIn.has(articleIdentity(n.article))).length,sampleTitles:[...visited.values()].slice(-6).map(n=>n.article.title),strategy:strategy.name});
     if(optimal()||best&&best.length<=2)return finish('complete');
    }
   }
   if(!worked){
    const boundary=graph.reachable(start,'out',2*limits.maxDepth).some(n=>n.depth>=2*limits.maxDepth&&!context!.completeOut.has(articleIdentity(n.article)));
    return finish(boundary?'depth':best?'complete':'no_path');
   }
  }
  return finish(effortExceeded()?'improvement':'timeout');
 }catch(error){
  if(optimal())return finish('complete');
  if(error instanceof ImprovementLimitError||effortExceeded())return finish('improvement');
  if(error instanceof RequestBudgetExceededError)return finish('budget');
  if(error instanceof SearchDeadlineError||Date.now()>=deadline)return finish('timeout');
  throw error;
 }
}