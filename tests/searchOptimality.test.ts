import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ApiLinkSource } from '../src/lib/apiLinkSource';
import { anytimeSearch } from '../src/lib/anytimeSearch';
import { DEFAULT_LIMITS } from '../src/lib/searchLimits';
import { fixtureFetch, benchmarkFixtures } from './fixtures/apiBenchmark';
afterEach(()=>vi.unstubAllGlobals());
it('stops a two-edge route once the entire live outgoing root page excludes a direct route', async () => {
 vi.stubGlobal('fetch',fixtureFetch(benchmarkFixtures.find(f=>f.name==='ordinary')!));
 const source=new ApiLinkSource(DEFAULT_LIMITS,{anytime:true});
 expect(await anytimeSearch(source,'A','D','en',DEFAULT_LIMITS)).toMatchObject({status:'found',path:['A','B','D'],reason:'complete',exact:true});
 expect(source.getRequestCount()).toBeLessThan(8);
});
it('does not treat complete cached adjacency as a proof of global shortestness', async () => {
 vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('fetch',fixtureFetch(benchmarkFixtures.find(f=>f.name==='ordinary')!));
 const first=new ApiLinkSource(DEFAULT_LIMITS,{anytime:true});
 await first.readLinkPage({title:'A',lang:'en'},'out');await first.readLinkPage({title:'B',lang:'en'},'out');
 const result=await anytimeSearch(new ApiLinkSource(DEFAULT_LIMITS,{anytime:true}),'A','D','en',DEFAULT_LIMITS);
 expect(result).toMatchObject({status:'found',path:['A','B','D'],exact:false});
});
