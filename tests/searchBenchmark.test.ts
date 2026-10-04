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
