import { articleIdentity, type CanonicalArticle } from '../../src/lib/linkSource';
import type { WikiPage, WikiResponse } from '../../src/lib/wikiApi';
const article=(title:string,lang='en')=>({title,lang});
const key=(title:string,lang='en')=>articleIdentity(article(title,lang));
export interface BenchmarkFixture {
 name:string;from:CanonicalArticle;to:CanonicalArticle;graph:Record<string,string[]>;aliases:Record<string,string>;
 canonical(article:CanonicalArticle):string;hasEdge(from:string,to:string):boolean;
}
function fixture(name:string,graph:Record<string,string[]>,from:CanonicalArticle=article('A'),to:CanonicalArticle=article('D'),aliases:Record<string,string>={}):BenchmarkFixture{
 const resolve=(raw:string)=>{const seen=new Set<string>();let current=raw;while(aliases[current]&&!seen.has(current)){seen.add(current);current=aliases[current];}return current;};
 return {name,graph,aliases,from,to,canonical:a=>resolve(articleIdentity(a)),hasEdge:(a,b)=>(graph[a]??[]).some(raw=>resolve(raw)===b)};
}
const single=(edges:Record<string,string[]>)=>Object.fromEntries(Object.entries(edges).map(([a,links])=>[key(a),links.map(b=>key(b))]));
const noise=Array.from({length:501},(_,i)=>`A outgoing ${String(i).padStart(4,'0')}`);
const incoming=Array.from({length:501},(_,i)=>`A incoming ${String(i).padStart(4,'0')}`);
export const benchmarkFixtures:BenchmarkFixture[]=[
 fixture('ordinary',single({A:['B'],B:['D'],D:[]})),
 fixture('weakly-connected',single({A:['N1'],N1:['N2'],N2:['N3'],N3:['N4'],N4:['N5'],N5:['N6'],N6:['N7'],N7:['N8'],N8:['D'],D:[]})),
 fixture('high-degree',single({...Object.fromEntries(noise.map(n=>[n,[]])),...Object.fromEntries(incoming.map(n=>[n,['Goal']])),Start:[...noise,'Goal bridge'],'Goal bridge':['Goal'],Goal:[]}),article('Start'),article('Goal')),
 fixture('redirect-heavy',single({A:['Alias'],B:['D'],D:[]}),article('Start alias'),article('D'),{[key('Start alias')]:key('A'),[key('Alias')]:key('B')}),
 fixture('multilingual',{[key('А','ru')]:[key('Bridge')],[key('Bridge')]:[key('Goal')],[key('Goal')]:[]},article('А','ru'),article('Goal')),
 fixture('impossible',single({A:['B'],B:[],D:['E'],E:[]})),
 fixture('empty',single({A:[],D:[]})),
];
/** Seeded directed graphs include aliases, cycles and disconnected components. */
export function seededFixtures(): BenchmarkFixture[] {
 return Array.from({length:8},(_,i)=>{
  const seed=1009+i*7919;let state=seed;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
  const count=64+i*8,split=i%4===3,aliases:Record<string,string>={},graph:Record<string,string[]>={};
  for(let from=0;from<count;from++){
   const targets=new Set<string>(),low=split&&from>=count/2?count/2:0,span=split?count/2:count;
   for(let j=0;j<3+i%3;j++){
    const to=low+random()%span;if(to===from)continue;
    const target=key(`N${to}`),raw=random()%4===0?key(`Alias ${to}`):target;
    if(raw!==target)aliases[raw]=target;targets.add(raw);
   }
   graph[key(`N${from}`)]=[...targets];
  }
  return fixture(`seeded-${seed}${split?'-disconnected':''}`,graph,article('N0'),article(`N${count-1}`),aliases);
 });
}
benchmarkFixtures.push(...seededFixtures());

/** HTTP-shaped fixture with shared 500-result continuation, redirects and actual filters. */
export function fixtureFetch(f:BenchmarkFixture):typeof fetch{
 const inverse=new Map<string,string[]>();
 for(const [source,targets]of Object.entries(f.graph))for(const target of targets){const values=inverse.get(target)??[];values.push(source);inverse.set(target,values);}
 return async(input)=>{
  const url=new URL(String(input)),q=url.searchParams,lang=url.hostname.split('.')[0],rawTitles=(q.get('titles')??'').split('|');
  if(q.get('list')==='langbacklinks'){
   const target=key(q.get('lbltitle')??'',q.get('lbllang')??''),offset=Number(q.get('lblcontinue')??0);
   const sources=(inverse.get(target)??[]).filter(source=>JSON.parse(source)[0]===lang).sort();
   return new Response(JSON.stringify({query:{langbacklinks:sources.slice(offset,offset+500).map(source=>({title:JSON.parse(source)[1],ns:0}))},...(sources.length>offset+500?{continue:{lblcontinue:String(offset+500),continue:'||'}}:{})}));
  }
  if(q.get('generator')==='links'){
   const source=key(rawTitles[0],lang),offset=Number(q.get('gplcontinue')??0);
   const targets=(f.graph[source]??[]).filter(t=>JSON.parse(t)[0]===lang).sort();
   const selected=targets.slice(offset,offset+500),redirects:Array<{from:string;to:string}>=[];
   const pages:WikiPage[]=[];
   for(const raw of selected){
    const resolved=f.canonical({title:JSON.parse(raw)[1],lang}),title=JSON.parse(resolved)[1];
    if(raw!==resolved)redirects.push({from:JSON.parse(raw)[1],to:title});
    if(!pages.some(p=>p.title===title))pages.push({title,ns:0,pageid:Object.keys(f.graph).indexOf(resolved)+1,...(!(resolved in f.graph)?{missing:true}:{})});
   }
   return new Response(JSON.stringify({query:{pages,redirects},...(targets.length>offset+500?{continue:{gplcontinue:String(offset+500),continue:'||'}}:{})}),{status:200,headers:{'content-type':'application/json'}});
  }
  const canonical=(raw:string)=>f.canonical({title:raw,lang});
  const redirects:Array<{from:string;to:string}>=[];
  const pages:WikiPage[]=rawTitles.map(raw=>{
   const rawKey=key(raw,lang),resolved=q.has('redirects')?canonical(raw):rawKey;
   const [resolvedLang,title]=JSON.parse(resolved) as [string,string];
   if(resolved!==rawKey)redirects.push({from:raw,to:title});
   return {title,ns:0,pageid:Object.keys(f.graph).indexOf(resolved)+1,...(!(resolved in f.graph)&&!(resolved in f.aliases)?{missing:true}:{}),...(resolvedLang!==lang?{missing:true}:{})};
  });
  const prop=q.get('prop')??'';
  const links:Array<{index:number;value:WikiPage}>=[];
  pages.forEach((page,index)=>{
   const pageKey=key(page.title,lang);
   if(prop.includes('langlinks'))page.langlinks=(f.graph[pageKey]??[]).map(raw=>JSON.parse(raw) as [string,string]).filter(([other])=>other!==lang).map(([lang,title])=>({lang,title}));
   const values=prop==='redirects'?Object.keys(f.aliases).filter(a=>f.aliases[a]===pageKey):prop.includes('linkshere')?inverse.get(pageKey)??[]:prop.includes('links')?f.graph[pageKey]??[]:[];
   for(const raw of [...values].sort()){
    const [other,title]=JSON.parse(raw) as [string,string];if(other!==lang)continue;
    if(q.has('pltitles')&&!q.get('pltitles')!.split('|').includes(title))continue;
    links.push({index,value:{title,ns:0}});
   }
  });
  const continuation=prop==='redirects'?'rdcontinue':prop.includes('linkshere')?'lhcontinue':'plcontinue';
  const offset=Number(q.get(continuation)??0),field=prop==='redirects'?'redirects':prop.includes('linkshere')?'linkshere':'links';
  for(const {index,value}of links.slice(offset,offset+500)){const list=pages[index][field]??[];list.push(value);pages[index][field]=list;}
  const data:WikiResponse={query:{pages,redirects},...(links.length>offset+500?{continue:{[continuation]:String(offset+500),continue:'||'}}:{})};
  return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 };
}
