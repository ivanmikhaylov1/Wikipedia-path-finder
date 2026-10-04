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
