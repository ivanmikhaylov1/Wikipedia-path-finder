import { expect, it } from 'vitest';
import { ApiLinkSource } from '../src/lib/apiLinkSource';
import { MultilingualLinkSource, articleKey } from '../src/lib/multilingualLinkSource';
import { anytimeSearch } from '../src/lib/anytimeSearch';
import { DEFAULT_LIMITS } from '../src/lib/searchLimits';
import { benchmarkFixtures, fixtureFetch } from './fixtures/apiBenchmark';

for(const refused of ['langbacklinks','reverse-langlinks'] as const)it(`continues toward the first route when optional ${refused} fails`,async()=>{
 const fixture=benchmarkFixtures.find(f=>f.name==='multilingual')!;
 const original=globalThis.fetch,respond=fixtureFetch(fixture);let refusals=0;
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input)),q=url.searchParams;
  if(refused==='langbacklinks'?q.get('list')==='langbacklinks':url.hostname.startsWith('en.')&&q.get('prop')==='langlinks'&&q.get('titles')==='Goal'&&refusals===0){
   refusals++;return new Response('refused',{status:403});
  }
  return respond(input,init);
 };
 try{
  const source=new MultilingualLinkSource(new ApiLinkSource(DEFAULT_LIMITS,{anytime:true}),['ru','en']);
  expect(await anytimeSearch(source,articleKey(fixture.from),articleKey(fixture.to),'ru',DEFAULT_LIMITS)).toMatchObject({status:'found',path:[articleKey(fixture.from),articleKey({title:'Bridge',lang:'en'}),articleKey(fixture.to)]});
  expect(refusals).toBeGreaterThan(0);
 }finally{globalThis.fetch=original;}
});
it('coalesces language-link requests for five same-language frontier articles',async()=>{
 const original=globalThis.fetch;const requests:string[][]=[];
 globalThis.fetch=async(input)=>{
  const q=new URL(String(input)).searchParams,titles=(q.get('titles')??'').split('|');
  if(q.get('prop')==='langlinks')requests.push(titles);
  return new Response(JSON.stringify({query:{pages:titles.map(title=>({title,ns:0,langlinks:[],redirects:[]}))}}));
 };
 try{
  const source=new MultilingualLinkSource(new ApiLinkSource(DEFAULT_LIMITS,{anytime:true}),['ru','en']);
  await Promise.all(['A','B','C','D','E'].map(title=>source.readLinkPage({title,lang:'ru'},'out')));
  expect(requests).toEqual([['A','B','C','D','E']]);
 }finally{globalThis.fetch=original;}
});
it('keeps batched language pages separate across a shared continuation',async()=>{
 const original=globalThis.fetch;const requests:URL[]=[];
 globalThis.fetch=async(input)=>{
  const url=new URL(String(input));requests.push(url);const continued=url.searchParams.has('llcontinue');
  return new Response(JSON.stringify({query:{pages:[continued?{title:'B',ns:0,langlinks:[{title:'Y',lang:'ru'}]}:{title:'A',ns:0,langlinks:[{title:'X',lang:'fr'}]}]},...(!continued?{continue:{llcontinue:'cursor',continue:'||'}}:{})}));
 };
 try{
  expect(await new ApiLinkSource(DEFAULT_LIMITS).getLanglinksBatch(['A','B'],'en')).toEqual(new Map([['A',[{title:'X',lang:'fr'}]],['B',[{title:'Y',lang:'ru'}]]]));
  expect(requests).toHaveLength(2);expect(requests[1].searchParams.get('titles')).toBe('A|B');expect(requests[1].searchParams.get('continue')).toBe('||');
 }finally{globalThis.fetch=original;}
});
for(const limit of ['budget','deadline'] as const)it(`does not swallow the shared ${limit} during optional reverse work`,async()=>{
 const {RequestBudgetExceededError}=await import('../src/lib/linkSource');
 const {SearchDeadlineError}=await import('../src/lib/wikiApi');
 const fixture=benchmarkFixtures.find(f=>f.name==='multilingual')!;
 const original=globalThis.fetch,respond=fixtureFetch(fixture);
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));if(url.hostname.startsWith('en.')&&url.searchParams.get('prop')==='langlinks'&&url.searchParams.get('titles')==='Goal')throw limit==='budget'?new RequestBudgetExceededError():new SearchDeadlineError();
  return respond(input,init);
 };
 try{
  const source=new MultilingualLinkSource(new ApiLinkSource(DEFAULT_LIMITS,{anytime:true}),['ru','en']);
  expect(await anytimeSearch(source,articleKey(fixture.from),articleKey(fixture.to),'ru',DEFAULT_LIMITS)).toMatchObject({status:'not_found',reason:limit==='budget'?'budget':'timeout'});
 }finally{globalThis.fetch=original;}
});
