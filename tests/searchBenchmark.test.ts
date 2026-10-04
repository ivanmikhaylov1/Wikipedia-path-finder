import { expect, it } from 'vitest';
import { runFixtureBenchmark, benchmarkFixtures } from '../scripts/benchmark-search';
it('compares both real algorithms against isolated cold and equivalent warmed API fixtures',async()=>{
 const records=await runFixtureBenchmark(1);
 expect(records).toHaveLength(benchmarkFixtures.length*4);
 for(const fixture of benchmarkFixtures){
  const pair=records.filter(r=>r.pair===fixture.name);expect(pair.map(r=>[r.algorithm,r.cache])).toEqual([['baseline','cold'],['anytime','cold'],['baseline','warm'],['anytime','warm']]);
  for(const result of pair){
   expect(result.warmupComplete).toBe(true);
   expect(result.warmupHttpRequests).toBeLessThanOrEqual(result.limits.maxTotalRequests);
   expect(result.actualHttpRequests).toBeLessThanOrEqual(result.limits.maxTotalRequests);
   if(result.success){expect(result.path[0]).toBe(fixture.canonical(fixture.from));expect(result.path.at(-1)).toBe(fixture.canonical(fixture.to));
    for(let i=1;i<result.path.length;i++)expect(fixture.hasEdge(result.path[i-1],result.path[i])).toBe(true);
   }
  }
 }
 const hard=records.filter(r=>r.pair==='high-degree'&&r.cache==='cold');
 expect(hard.find(r=>r.algorithm==='baseline')?.success).toBe(false);
 expect(hard.find(r=>r.algorithm==='anytime')?.success).toBe(true);
 expect(records.filter(r=>r.pair==='impossible'||r.pair==='empty').every(r=>!r.success)).toBe(true);
},20000);
it('reports first-route HTTP cost, total duration and reproducible seeded graph cases', async () => {
 const records=await runFixtureBenchmark(1);
 expect(records.some(r=>r.pair.startsWith('seeded-'))).toBe(true);
 for(const row of records){
  expect(row.totalDurationMs).toBeGreaterThanOrEqual(0);
  if(row.success){
   expect(row.requestsToFirstRoute).toBeGreaterThanOrEqual(0);
   expect(row.requestsToFirstRoute).toBeLessThanOrEqual(row.actualHttpRequests);
   expect(row.firstVerifiedRouteMs).toBeLessThanOrEqual(row.totalDurationMs);
  }else expect(row.requestsToFirstRoute).toBeNull();
  expect(row.strategyRequests.guided).toBeGreaterThanOrEqual(0);
 }
},20000);
it('reports an optimality certificate only for an independently shortest fixture route', async () => {
 const records=await runFixtureBenchmark(1);
 for(const fixture of benchmarkFixtures){
  const start=fixture.canonical(fixture.from),end=fixture.canonical(fixture.to),queue=[start],distance=new Map([[start,0]]);
  for(let i=0;i<queue.length;i++)for(const raw of fixture.graph[queue[i]]??[]){
   const [lang,title]=JSON.parse(raw),next=fixture.canonical({lang,title});
   if(distance.has(next)||!(next in fixture.graph))continue;distance.set(next,distance.get(queue[i])!+1);queue.push(next);
  }
  for(const row of records.filter(r=>r.pair===fixture.name&&r.algorithm==='anytime')){
   expect(typeof row.exact).toBe('boolean');
   if(row.exact)expect(row.finalTransitions).toBe(distance.get(end));
  }
 }
 expect(records.some(r=>r.algorithm==='anytime'&&r.exact)).toBe(true);
},20000);
