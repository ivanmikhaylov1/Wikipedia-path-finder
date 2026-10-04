import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import { ApiLinkSource } from '../src/lib/apiLinkSource';
import { MultilingualLinkSource } from '../src/lib/multilingualLinkSource';
import { anytimeSearch } from '../src/lib/anytimeSearch';
import { bidirectionalBfs } from '../src/lib/bfs';
import { DEFAULT_LIMITS } from '../src/lib/searchLimits';
import { articleIdentity, type CanonicalArticle } from '../src/lib/linkSource';
import { benchmarkFixtures, fixtureFetch, type BenchmarkFixture } from '../tests/fixtures/apiBenchmark';
export { benchmarkFixtures };
export interface BenchmarkRecord {
 algorithm:'baseline'|'anytime';pair:string;cache:'cold'|'warm';run:number;success:boolean;path:string[];
 firstVerifiedRouteMs:number|null;finalTransitions:number|null;actualHttpRequests:number;stopReason:string;
 warmupComplete:boolean;warmupHttpRequests:number;warmupError?:string;
 limits:{maxTotalRequests:number;searchTimeout:number};
}
const limits={...DEFAULT_LIMITS,maxTotalRequests:100,searchTimeout:15000,concurrency:5};
async function comparePair(pair:Pick<BenchmarkFixture,'name'|'from'|'to'>,algorithm:BenchmarkRecord['algorithm'],cache:BenchmarkRecord['cache'],run:number):Promise<BenchmarkRecord>{
 const multi=pair.from.lang!==pair.to.lang;let warmupComplete=true,warmupHttpRequests=0,warmupError:string|undefined;
 if(cache==='warm'){
  const warmer=new ApiLinkSource(limits,{anytime:algorithm==='anytime'});
  warmer.setDeadline(Date.now()+limits.searchTimeout);
  try { for(const article of [pair.from,pair.to])for(const direction of ['out','in'] as const){
   if(algorithm==='anytime'){let complete=false;while(!complete)complete=(await warmer.readLinkPage(article,direction)).complete;}
   else if(direction==='out')await warmer.getOutlinks(article.title,article.lang,500);else await warmer.getInlinks(article.title,article.lang,500);
  } } catch(error) { warmupComplete=false;warmupError=error instanceof Error?error.message:String(error); }
  warmupHttpRequests=warmer.getRequestCount();
 }
 const base=new ApiLinkSource(limits,{anytime:algorithm==='anytime'});
 const source=multi?new MultilingualLinkSource(base,[pair.from.lang,pair.to.lang]):base;
 const from=multi?articleIdentity(pair.from):pair.from.title,to=multi?articleIdentity(pair.to):pair.to.title;
 const begun=performance.now();let first:number|null=null;let path:string[]=[];let stopReason='error';
 try{
  const result=algorithm==='anytime'?await anytimeSearch(source,from,to,pair.from.lang,limits,undefined,{onCandidate:()=>{first??=performance.now()-begun;}}):await bidirectionalBfs(source,from,to,pair.from.lang,limits);
  if(result.status==='found'){path=result.path;first??=performance.now()-begun;stopReason='reason'in result&&typeof result.reason==='string'?result.reason:'found';}else stopReason=result.reason;
 }catch(error){stopReason=error instanceof Error?error.message:String(error);}
 return {algorithm,pair:pair.name,cache,run,warmupComplete,warmupHttpRequests,...(warmupError?{warmupError}:{}),success:path.length>0,path:path.map(title=>multi?title:articleIdentity({title,lang:pair.from.lang})),firstVerifiedRouteMs:first,finalTransitions:path.length?path.length-1:null,actualHttpRequests:base.getRequestCount(),stopReason,limits:{maxTotalRequests:limits.maxTotalRequests,searchTimeout:limits.searchTimeout}};
}
export async function runFixtureBenchmark(runs=3):Promise<BenchmarkRecord[]>{
 const originalFetch=globalThis.fetch,originalIDB=globalThis.indexedDB;const records:BenchmarkRecord[]=[];
 try{
  for(let run=1;run<=runs;run++)for(const fixture of benchmarkFixtures)for(const cache of ['cold','warm'] as const)for(const algorithm of ['baseline','anytime'] as const){
   globalThis.fetch=fixtureFetch(fixture);Reflect.set(globalThis,'indexedDB',new IDBFactory());
   records.push(await comparePair(fixture,algorithm,cache,run));
  }
 }finally{globalThis.fetch=originalFetch;if(originalIDB)Reflect.set(globalThis,'indexedDB',originalIDB);else Reflect.deleteProperty(globalThis,'indexedDB');}
 return records;
}
async function runLiveBenchmark(runs:number):Promise<BenchmarkRecord[]>{
 const originalIDB=globalThis.indexedDB;const records:BenchmarkRecord[]=[];
 const node=(title:string):CanonicalArticle=>({title,lang:'en'});
 const pairs=[{name:'ordinary-live',from:node('Cat'),to:node('Animal')},{name:'redirect-live',from:node('USA'),to:node('North America')}];
 try{
  for(let run=1;run<=runs;run++)for(const pair of pairs)for(const cache of ['cold','warm'] as const)for(const algorithm of ['baseline','anytime'] as const){
   Reflect.set(globalThis,'indexedDB',new IDBFactory());records.push(await comparePair(pair,algorithm,cache,run));await new Promise(r=>setTimeout(r,1000));
  }
 }finally{if(originalIDB)Reflect.set(globalThis,'indexedDB',originalIDB);else Reflect.deleteProperty(globalThis,'indexedDB');}
 return records;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {values}=parseArgs({options:{live:{type:'boolean'},runs:{type:'string'},out:{type:'string'}}});
 const runs=Number(values.runs??3);if(!Number.isInteger(runs)||runs<1||runs>20)throw new Error('--runs must be between 1 and 20');
 const records=values.live?await runLiveBenchmark(runs):await runFixtureBenchmark(runs);
 const summary=Object.fromEntries((['baseline','anytime'] as const).map(algorithm=>{const rows=records.filter(r=>r.algorithm===algorithm);return [algorithm,{successes:rows.filter(r=>r.success).length,total:rows.length}];}));
 const output=values.out??'docs/verification/anytime-benchmark.json';await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify({mode:values.live?'live':'fixture',summary,records},null,2)+'\n');
 console.log(JSON.stringify({output,mode:values.live?'live':'fixture',summary},null,2));
}
