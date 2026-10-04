import { expect, it } from 'vitest';
import { ApiLinkSource } from '../src/lib/apiLinkSource';
import { MultilingualLinkSource, articleKey } from '../src/lib/multilingualLinkSource';
import { anytimeSearch } from '../src/lib/anytimeSearch';
import { DEFAULT_LIMITS } from '../src/lib/searchLimits';
import { fixtureFetch, type BenchmarkFixture } from './fixtures/apiBenchmark';
const a=(title:string,lang='ru')=>({title,lang});
const k=(title:string,lang='ru')=>articleKey(a(title,lang));
it('joins a wide Russian forward frontier with a verified English reverse language bridge',async()=>{
 const graph:Record<string,string[]>={
  [k('Start')]:[...Array.from({length:600},(_,i)=>k(`Noise ${i}`)),k('Bridge')],
  [k('Bridge')]:[k('Bridge','en')],
  [k('Bridge','en')]:[k('Goal','en'),k('Bridge')],
  [k('Goal','en')]:[],
 };
 for(let i=0;i<600;i++)graph[k(`Noise ${i}`)]=[];
 const fixture:BenchmarkFixture={name:'wide-language',from:a('Start'),to:a('Goal','en'),graph,aliases:{},canonical:articleKey,hasEdge:(from,to)=>(graph[from]??[]).includes(to)};
 const original=globalThis.fetch;globalThis.fetch=fixtureFetch(fixture);
 try{
  const base=new ApiLinkSource({...DEFAULT_LIMITS,maxTotalRequests:80},{anytime:true});
  const source=new MultilingualLinkSource(base,['ru','en']);const reverse:number[]=[];
  const result=await anytimeSearch(source,k('Start'),k('Goal','en'),'ru',DEFAULT_LIMITS,p=>reverse.push(p.frontierB??0));
  expect(result).toMatchObject({status:'found',path:[k('Start'),k('Bridge'),k('Bridge','en'),k('Goal','en')],exact:false});
  expect(reverse.some(n=>n>1)).toBe(true);
 }finally{globalThis.fetch=original;}
});
it('does not manufacture a reverse translation from an unreciprocated language link',async()=>{
 const source=new MultilingualLinkSource({
  resolveRedirect:async title=>title,getOutlinks:async()=>[],getInlinks:async()=>[],
  getLanglinks:async(title,lang)=>title==='Goal'&&lang==='en'?[a('Candidate')]:[],
 },['ru','en']);
 expect(await source.getInlinks(k('Goal','en'),'en')).toEqual([]);
});
it('discovers a nonreciprocal incoming language link from the reverse API and verifies its direction',async()=>{
 const source=new MultilingualLinkSource({
  resolveRedirect:async title=>title,getOutlinks:async()=>[],getInlinks:async()=>[],
  getLanglinks:async(title,lang)=>title==='Candidate'&&lang==='ru'?[a('Goal','en')]:[],
  getLangbacklinks:async()=>[a('Candidate')],
 },['ru','en']);
 expect(await source.getInlinks(k('Goal','en'),'en')).toEqual([k('Candidate')]);
});
it('retains verified translations when the ordinary page fails before they are delivered',async()=>{
 const fixture:BenchmarkFixture={name:'translation-retry',from:a('Start'),to:a('Goal','en'),graph:{[k('Start')]:[k('Goal','en')],[k('Goal','en')]:[]},aliases:{},canonical:articleKey,hasEdge:()=>true};
 const original=globalThis.fetch,respond=fixtureFetch(fixture);let fail=true;
 globalThis.fetch=async(input,init)=>{if(new URL(String(input)).searchParams.get('generator')==='links'&&fail){fail=false;throw new Error('page failed');}return respond(input,init);};
 try{
  const source=new MultilingualLinkSource(new ApiLinkSource(DEFAULT_LIMITS,{anytime:true}),['ru','en']);
  await expect(source.readLinkPage(a('Start'),'out')).rejects.toThrow('page failed');
  expect((await source.readLinkPage(a('Start'),'out')).newEdges).toContainEqual(expect.objectContaining({from:a('Start'),to:expect.objectContaining(a('Goal','en')),rawTarget:'Goal',fresh:true}));
 }finally{globalThis.fetch=original;}
});
it('uses the actual Wikipedia host for language codes that differ from their domain',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({query:{pages:[{title:'Bauhaus',ns:0,langlinks:[{lang:'gsw',title:'Bauhaus',url:'https://als.wikipedia.org/wiki/Bauhaus'}]}]}}));
 try{expect(await new ApiLinkSource(DEFAULT_LIMITS).getLanglinks('Bauhaus','en')).toEqual([{lang:'als',title:'Bauhaus'}]);}finally{globalThis.fetch=original;}
});
it('seeds endpoint language versions and searches the destination version before a huge foreign root',async()=>{
 const noise=Array.from({length:10000},(_,i)=>k(`English incoming ${i}`,'en'));
 const graph:Record<string,string[]>={
  [k('Start')]:[k('One'),k('Start','en')],[k('One')]:[k('Two')],[k('Two')]:[k('Goal')],
  [k('Goal')]:[k('Goal','en')],[k('Goal','en')]:[k('Goal')],
  [k('Start','en')]:[],...Object.fromEntries(noise.map(node=>[node,[k('Goal','en')]])),
 };
 const fixture:BenchmarkFixture={name:'destination-language',from:a('Start'),to:a('Goal','en'),graph,aliases:{},canonical:articleKey,hasEdge:(from,to)=>(graph[from]??[]).includes(to)};
 const original=globalThis.fetch;globalThis.fetch=fixtureFetch(fixture);
 try{
  const limits={...DEFAULT_LIMITS,maxTotalRequests:40};
  const source=new MultilingualLinkSource(new ApiLinkSource(limits,{anytime:true}),['ru','en']);
  expect(await anytimeSearch(source,k('Start'),k('Goal','en'),'ru',limits)).toMatchObject({status:'found',path:[k('Start'),k('One'),k('Two'),k('Goal'),k('Goal','en')]});
 }finally{globalThis.fetch=original;}
});
it('keeps a verified direct translation when reverse endpoint seeding exhausts its budget',async()=>{
 const {RequestBudgetExceededError}=await import('../src/lib/linkSource');
 const fixture:BenchmarkFixture={name:'seed-partial-error',from:a('Start'),to:a('Goal','en'),graph:{[k('Start')]:[k('Goal','en')],[k('Goal','en')]:[]},aliases:{},canonical:articleKey,hasEdge:()=>true};
 const original=globalThis.fetch,respond=fixtureFetch(fixture);
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));if(url.hostname.startsWith('en.')&&url.searchParams.get('prop')==='langlinks')throw new RequestBudgetExceededError();
  return respond(input,init);
 };
 try{
  const source=new MultilingualLinkSource(new ApiLinkSource(DEFAULT_LIMITS,{anytime:true}),['ru','en']);
  expect(await anytimeSearch(source,k('Start'),k('Goal','en'),'ru',DEFAULT_LIMITS)).toMatchObject({status:'found',path:[k('Start'),k('Goal','en')],exact:true});
 }finally{globalThis.fetch=original;}
});
it('can switch language at the start and complete the route in the destination section',async()=>{
 const graph:Record<string,string[]>={
  [k('Start')]:[k('Start','en')],[k('Start','en')]:[k('Middle','en')],
  [k('Middle','en')]:[k('Goal','en')],[k('Goal','en')]:[k('Goal')],[k('Goal')]:[k('Goal','en')],
 };
 const fixture:BenchmarkFixture={name:'switch-at-start',from:a('Start'),to:a('Goal','en'),graph,aliases:{},canonical:articleKey,hasEdge:(from,to)=>(graph[from]??[]).includes(to)};
 const original=globalThis.fetch;globalThis.fetch=fixtureFetch(fixture);
 try{
  const source=new MultilingualLinkSource(new ApiLinkSource(DEFAULT_LIMITS,{anytime:true}),['ru','en']);
  expect(await anytimeSearch(source,k('Start'),k('Goal','en'),'ru',DEFAULT_LIMITS)).toMatchObject({status:'found',path:[k('Start'),k('Start','en'),k('Middle','en'),k('Goal','en')]});
 }finally{globalThis.fetch=original;}
});
