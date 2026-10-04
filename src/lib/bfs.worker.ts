/// <reference lib="webworker" />
import type { BfsResumeState, NotFoundReason } from './bfs';
import type { AnytimeResumeState } from './anytimeSearch';
import { ApiLinkSource } from './apiLinkSource';
import { LocalDatasetLinkSource } from './localLinkSource';
import { DEFAULT_LIMITS, type SearchLimits } from './searchLimits';
import { handleSearchRequest } from './searchWorker';

export interface ThreadProgress { depth:number;visited:number;frontierA:number;frontierB:number;sampleTitles?:string[] }
export type SearchResumeState = {kind:'bfs';state:BfsResumeState}|{kind:'anytime';state:AnytimeResumeState};
export type WorkerMessage =
 | ({type:'progress'}&ThreadProgress)
 | {type:'candidate';path:string[]}
 | {type:'found';path:string[];exact?:boolean;reason?:'complete'|'budget'|'timeout'|'improvement';resumeState?:SearchResumeState}
 | {type:'notFound';limitsHit:string[];reason:NotFoundReason;visited:number;depth:number;resumeState?:SearchResumeState}
 | {type:'error';message:string};
export interface WorkerInput {from:string;to:string;lang:string;toLang?:string;multilingual?:boolean;limits?:SearchLimits;resumeState?:SearchResumeState}
self.onmessage=async(event:MessageEvent<WorkerInput>)=>{
 const local=import.meta.env.VITE_LINK_SOURCE==='local';
 const limits=event.data.limits??DEFAULT_LIMITS;
 const source=local?new LocalDatasetLinkSource():new ApiLinkSource({...limits,concurrency:Math.min(5,limits.concurrency)},{anytime:true});
 await handleSearchRequest(source,event.data,message=>self.postMessage(message),local);
};
