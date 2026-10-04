import { expect, it, vi } from 'vitest';
import { anytimeSearch } from '../src/lib/anytimeSearch';
import { DEFAULT_LIMITS } from '../src/lib/searchLimits';
import { FixtureSource } from './fixtures/searchBenchmark';

it('publishes a bridge candidate before a wide BFS layer finishes and retains it after a budget stop', async()=>{
  const source=new FixtureSource({A:['B','Slow'],B:['D'],Slow:['Unused'],Unused:[],D:[]},1,7);
  const candidates:string[][]=[];let firstCalls=0;
  const result=await anytimeSearch(source,'A','D','en',{...DEFAULT_LIMITS,maxTotalRequests:7},undefined,{onCandidate:path=>{candidates.push(path);firstCalls=source.calls.length;}});
  expect(candidates).toEqual([['A','B','D']]);expect(firstCalls).toBeLessThan(7);
  expect(result).toMatchObject({status:'found',path:['A','B','D'],reason:'budget'});
});
it('finds a bridge beyond the first 500 neighbors with the same directed API evidence', async()=>{
  const noise=Array.from({length:501},(_,i)=>`N${i}`);
  const source=new FixtureSource({A:[...noise,'D'],D:[],...Object.fromEntries(noise.map(n=>[n,[]]))},500);
  const result=await anytimeSearch(source,'A','D','en',DEFAULT_LIMITS);
  expect(result).toMatchObject({status:'found',path:['A','D']});expect(source.calls.some(c=>c.kind==='bridge')).toBe(true);
});
it('never turns reverse links into a route and ends an exhaustive empty search',async()=>{
  const source=new FixtureSource({A:[],B:['A'],D:['B']});
  expect(await anytimeSearch(source,'A','D','en',DEFAULT_LIMITS)).toMatchObject({status:'not_found',reason:'no_path'});
});
it('keeps BFS work in each rotation while guided exploration can reach deeper promising nodes',async()=>{
  const source=new FixtureSource({A:['Wide','Goal bridge'],Wide:['Noise'],Noise:[], 'Goal bridge':['Goal second'],'Goal second':['Goal'],Goal:[]},1);
  const strategies:string[]=[];
  const result=await anytimeSearch(source,'A','Goal','en',DEFAULT_LIMITS,p=>{if(p.strategy)strategies.push(p.strategy);});
  expect(result).toMatchObject({status:'found',path:['A','Goal bridge','Goal second','Goal']});
  expect(strategies).toContain('guided');expect(strategies).toContain('bfs');
});
it('shortens a previously verified resumed route and rejects mismatched endpoints',async()=>{
  const source=new FixtureSource({A:['B','X'],B:['C'],C:['D'],X:['D'],D:[]},1,5);
  const first=await anytimeSearch(source,'A','D','en',{...DEFAULT_LIMITS,maxTotalRequests:5});
  expect(first.resumeState).toBeDefined();
  const second=new FixtureSource(source.graph,1);
  const improvements:string[][]=[];
  const result=await anytimeSearch(second,'A','D','en',DEFAULT_LIMITS,undefined,{resumeState:first.resumeState,onCandidate:p=>improvements.push(p)});
  expect(result).toMatchObject({status:'found',path:['A','X','D']});
  await expect(anytimeSearch(second,'B','D','en',DEFAULT_LIMITS,undefined,{resumeState:first.resumeState})).rejects.toThrow('соответствует');
});
it('finishes identical endpoints without any graph expansion',async()=>{
  const source=new FixtureSource({A:[]});expect(await anytimeSearch(source,'A','A','en',DEFAULT_LIMITS)).toMatchObject({status:'found',path:['A']});
  expect(source.calls.every(c=>c.kind==='canonical')).toBe(true);
});
it('publishes a longer verified route then replaces it strictly with a shorter one',async()=>{
  const source=new FixtureSource({A:['B','X'],B:['C'],C:['D'],X:['D'],D:[]},1);
  const edge=(from:string,to:string)=>({from:{title:from,lang:'en'},to:{title:to,lang:'en'},rawTarget:to,fresh:false});
  const resumeState={version:1 as const,from:'A',to:'D',lang:'en',forwardOnly:false,start:{title:'A',lang:'en'},end:{title:'D',lang:'en'},graph:{edges:[edge('A','B'),edge('B','C'),edge('C','D')]},strategies:{completeOut:[],completeIn:[],probed:[]},best:null};
  const candidates:string[][]=[];
  const result=await anytimeSearch(source,'A','D','en',DEFAULT_LIMITS,undefined,{resumeState,onCandidate:p=>candidates.push(p)});
  expect(candidates).toEqual([['A','B','C','D'],['A','X','D']]);expect(result).toMatchObject({path:['A','X','D']});
});
it('rejects an invalid shorter cached route without losing the previously verified best',async()=>{
  const source=new FixtureSource({A:['B'],B:['C'],C:['D'],D:[]});
  const edge=(from:string,to:string)=>({from:{title:from,lang:'en'},to:{title:to,lang:'en'},rawTarget:to,fresh:false});
  const resumeState={version:1 as const,from:'A',to:'D',lang:'en',forwardOnly:false,start:{title:'A',lang:'en'},end:{title:'D',lang:'en'},graph:{edges:[edge('A','B'),edge('B','C'),edge('C','D'),edge('A','D')]},strategies:{completeOut:[],completeIn:[],probed:[]},best:['A','B','C','D']};
  const candidates:string[][]=[];
  const result=await anytimeSearch(source,'A','D','en',DEFAULT_LIMITS,undefined,{resumeState,onCandidate:p=>candidates.push(p)});
  expect(candidates).toEqual([]);expect(result).toMatchObject({path:['A','B','C','D']});
});
it('retains a candidate when the deadline expires after publication',async()=>{
  const source=new FixtureSource({A:['B','Slow'],B:['D'],Slow:[],D:[]});
  const clock=vi.spyOn(Date,'now');const now=Date.now();
  try {
    const result=await anytimeSearch(source,'A','D','en',{...DEFAULT_LIMITS,searchTimeout:1000},undefined,{onCandidate:()=>clock.mockReturnValue(now+2000)});
    expect(result).toMatchObject({status:'found',path:['A','B','D'],reason:'timeout'});
  } finally {clock.mockRestore();}
});
