import { bidirectionalBfs, type SearchProgress } from './bfs';
import { anytimeSearch } from './anytimeSearch';
import { MultilingualLinkSource, articleKey } from './multilingualLinkSource';
import { DEFAULT_LIMITS } from './searchLimits';
import type { AnytimeLinkSource, LinkSource } from './linkSource';
import type { WorkerInput, WorkerMessage } from './bfs.worker';
/** Engine boundary shared by the actual Worker and protocol tests. */
export async function handleSearchRequest(baseSource:LinkSource,input:WorkerInput,post:(message:WorkerMessage)=>void,local:boolean):Promise<void>{
 const {from,to,lang,multilingual=false,toLang=lang,resumeState}=input;
 const requested=input.limits??DEFAULT_LIMITS;
 const limits=local?{...requested,maxLinksPerPage:Number.MAX_SAFE_INTEGER,widening:[Number.MAX_SAFE_INTEGER]}:requested;
 let visited=0,depth=0;
 const progress=(value:SearchProgress)=>{visited=Math.max(visited,value.visitedCount);depth=Math.max(depth,value.depth);post({type:'progress',depth:value.depth,visited:value.visitedCount,frontierA:value.frontierA??0,frontierB:value.frontierB??0,sampleTitles:value.sampleTitles});};
 try{
  if(resumeState&&resumeState.kind!==(local?'bfs':'anytime'))throw new Error('Состояние продолжения не соответствует режиму поиска');
  const source=multilingual?new MultilingualLinkSource(baseSource,[...new Set([lang,toLang])]):baseSource;
  const start=multilingual?articleKey({title:from,lang}):from,end=multilingual?articleKey({title:to,lang:toLang}):to;
  if(local){
   const resume=resumeState?.kind==='bfs'?resumeState.state:undefined;
   const result=await bidirectionalBfs(source,start,end,lang,limits,progress,{resumeState:resume});
   if(result.status==='found')post({type:'found',path:result.path,exact:true,reason:'complete'});
   else post({type:'notFound',limitsHit:result.reason==='no_path'?[]:[result.reason],reason:result.reason,visited,depth,...(result.resumeState?{resumeState:{kind:'bfs',state:result.resumeState}}:{})});
  }else{
   if(!('canonicalize' in source)||!('readLinkPage' in source))throw new Error('Источник не поддерживает последовательный поиск');
   const result=await anytimeSearch(source as AnytimeLinkSource,start,end,lang,limits,progress,{resumeState:resumeState?.kind==='anytime'?resumeState.state:undefined,onCandidate:path=>post({type:'candidate',path})});
   const resume=result.resumeState?{kind:'anytime' as const,state:result.resumeState}:undefined;
   if(result.status==='found')post({type:'found',path:result.path,exact:result.exact,reason:result.reason,resumeState:resume});
   else post({type:'notFound',limitsHit:result.reason==='no_path'?[]:[result.reason],reason:result.reason,visited,depth,resumeState:resume});
  }
 }catch(error){post({type:'error',message:error instanceof Error?error.message:'Не удалось получить данные. Проверьте соединение и повторите поиск.'});}
}
