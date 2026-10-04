import { expect, it } from 'vitest';
import { handleSearchRequest } from '../src/lib/searchWorker';
import type { WorkerMessage } from '../src/lib/bfs.worker';
import { FixtureSource } from './fixtures/searchBenchmark';
import { DEFAULT_LIMITS } from '../src/lib/searchLimits';
it('forwards an early API route before finishing and discriminates its continuation',async()=>{
 const messages:WorkerMessage[]=[];
 await handleSearchRequest(new FixtureSource({A:['B','Slow'],B:['D'],Slow:[],D:[]},1,7),{from:'A',to:'D',lang:'en',limits:{...DEFAULT_LIMITS,maxTotalRequests:7}},m=>messages.push(m),false);
 expect(messages.find(m=>m.type==='candidate')).toMatchObject({path:['A','B','D']});
 expect(messages.at(-1)).toMatchObject({type:'found',path:['A','B','D'],exact:false,reason:'budget',resumeState:{kind:'anytime'}});
 expect(messages.findIndex(m=>m.type==='candidate')).toBeLessThan(messages.length-1);
});
it('preserves complete local BFS semantics without API probes or validation',async()=>{
 const messages:WorkerMessage[]=[];const source=new FixtureSource({A:['B'],B:['D'],D:[]});
 await handleSearchRequest(source,{from:'A',to:'D',lang:'en'},m=>messages.push(m),true);
 expect(messages.at(-1)).toMatchObject({type:'found',path:['A','B','D'],exact:true});
 expect(source.calls.some(c=>c.kind==='bridge'||c.kind==='validate')).toBe(false);
});
it('rejects a resume snapshot from a different engine rather than mixing graph state',async()=>{
 const messages:WorkerMessage[]=[];
 await handleSearchRequest(new FixtureSource({A:[],D:[]}),{from:'A',to:'D',lang:'en',resumeState:{kind:'anytime',state:{version:1,from:'A',to:'D',lang:'en',forwardOnly:false,start:{title:'A',lang:'en'},end:{title:'D',lang:'en'},graph:{edges:[]},strategies:{completeOut:[],completeIn:[],probed:[]},best:null}}},m=>messages.push(m),true);
 expect(messages.at(-1)).toMatchObject({type:'error'});
});
