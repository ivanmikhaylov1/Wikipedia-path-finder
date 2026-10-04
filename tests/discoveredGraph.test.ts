import { expect, it } from 'vitest';
import { DiscoveredGraph } from '../src/lib/discoveredGraph';
const a = (title: string, lang = 'en') => ({ title, lang });
const edge = (from: string, to: string, fresh = true) => ({ from: a(from), to: a(to), rawTarget: to, fresh });
it('reconstructs directed paths and recalculates distances after earlier-depth edges arrive', () => {
  const graph = new DiscoveredGraph(); graph.add([edge('A','B'), edge('B','C'), edge('C','D'), edge('D','A')]);
  expect(graph.route(a('A'), a('D'), 12)?.map(e => e.to.title)).toEqual(['B','C','D']);
  graph.add([edge('A','C')]);
  expect(graph.route(a('A'), a('D'), 12)?.map(e => e.to.title)).toEqual(['C','D']);
  expect(graph.route(a('A'), a('D'), 1)).toBeNull();
  expect(graph.route(a('A'), a('A'), 12)).toEqual([]);
});
it('never traverses an incoming edge as an outgoing edge and keeps languages separate', () => {
  const graph = new DiscoveredGraph(); graph.add([edge('B','A'), { from: a('A','ru'), to: a('B','en'), rawTarget:'B', fresh:true }]);
  expect(graph.route(a('A'), a('B'), 12)).toBeNull();
  expect(graph.route(a('A','ru'), a('B','en'), 12)).toHaveLength(1);
  expect(graph.reachable(a('A'), 'in', 6).map(n => [n.article.lang,n.article.title])).toEqual([['en','A'],['en','B'],['ru','A']]);
});
it('preserves raw aliases and evidence freshness in snapshots and invalidates unsupported edges', () => {
  const graph = new DiscoveredGraph(); graph.add([{ ...edge('A','B',false), rawTarget:'Alias' }]);
  const restored = new DiscoveredGraph(graph.snapshot());
  expect(restored.route(a('A'),a('B'),12)?.[0]).toMatchObject({ rawTarget:'Alias', fresh:false });
  restored.add([edge('A','B')]); expect(restored.route(a('A'),a('B'),12)?.[0].fresh).toBe(true);
  restored.discard([edge('A','B')]); expect(restored.route(a('A'),a('B'),12)).toBeNull();
});
it('bounds paths to twelve transitions even with reachable thirteen-edge chains', () => {
  const graph = new DiscoveredGraph(); graph.add(Array.from({length:13},(_,i)=>edge(String(i),String(i+1))));
  expect(graph.route(a('0'),a('13'),12)).toBeNull();
  expect(graph.route(a('0'),a('12'),12)).toHaveLength(12);
});
it('reuses reachable results until new evidence changes distances', () => {
  const graph = new DiscoveredGraph();
  const a = (title: string) => ({ title, lang: 'en' });
  graph.add([{ from:a('A'),to:a('B'),rawTarget:'B',fresh:true }]);
  const first = graph.reachable(a('A'),'out',6);
  expect(graph.reachable(a('A'),'out',6)).toBe(first);
  graph.add([{from:a('Elsewhere'),to:a('Unrelated'),rawTarget:'Unrelated',fresh:true}]);
  expect(graph.reachable(a('A'),'out',6)).toBe(first);
  graph.add([{from:a('B'),to:a('D'),rawTarget:'D',fresh:true}]);
  expect(graph.route(a('A'),a('D'),6)?.map(e=>e.to.title)).toEqual(['B','D']);
  expect(graph.reachable(a('A'),'out',6).map(n=>[n.article.title,n.depth])).toEqual([['A',0],['B',1],['D',2]]);
});
it('maintains directed shortest distances through random insertions and invalidations', () => {
  const a = (title: string) => ({title,lang:'en'});
  const graph = new DiscoveredGraph(); const adjacency = new Map<string,Set<string>>();
  let seed=17; const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  const oracle=(start:string,reverse=false)=>{
    const distance=new Map([[start,0]]),queue=[start];
    for(let i=0;i<queue.length;i++)for(const next of reverse
      ? [...adjacency].filter(([,out])=>out.has(queue[i])).map(([title])=>title)
      : adjacency.get(queue[i])??[]){
      if(distance.has(next))continue;distance.set(next,distance.get(queue[i])!+1);queue.push(next);
    }
    return distance;
  };
  for(let i=0;i<200;i++){
    const from=String(random()%25),to=String(random()%25),edge={from:a(from),to:a(to),rawTarget:to,fresh:true};
    const out=adjacency.get(from)??new Set<string>();adjacency.set(from,out);
    if(i%7===0){out.delete(to);graph.discard([edge]);}else if(from!==to){out.add(to);graph.add([edge]);}
    for(const direction of ['out','in'] as const){
      const expected=oracle('0',direction==='in');
      expect(new Map(graph.reachable(a('0'),direction,25).map(n=>[n.article.title,n.depth]))).toEqual(expected);
    }
    const route=graph.route(a('0'),a('7'),25),distance=oracle('0').get('7');
    expect(route?.length??null).toBe(distance??null);
    if(route)for(const e of route)expect(adjacency.get(e.from.title)?.has(e.to.title)).toBe(true);
  }
});
