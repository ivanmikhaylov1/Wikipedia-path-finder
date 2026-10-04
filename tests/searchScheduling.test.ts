import { expect, it } from 'vitest';
import { bfsStrategy, type StrategyContext } from '../src/lib/searchStrategies';
import { DiscoveredGraph } from '../src/lib/discoveredGraph';
import { RequestBudgetExceededError } from '../src/lib/linkSource';
import { FixtureSource, node } from './fixtures/searchBenchmark';
const initial = () => new DiscoveredGraph({ edges: ['B','C','D'].map(title => ({ from: node('A'), to: node(title), rawTarget: title, fresh: true })) });
function context(source: FixtureSource): StrategyContext {
  return { source, graph: initial(), start: node('A'), end: node('Goal'), maxDepth: 6,
    completeOut: new Set([JSON.stringify(['en','A'])]), completeIn: new Set([JSON.stringify(['en','Goal'])]), probed: new Set(), concurrency: 3 };
}
it('acquires several articles from the same BFS layer concurrently', async () => {
  const source = new FixtureSource({ A: ['B','C','D'], B: ['Goal'], C: [], D: [], Goal: [] });
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const read = source.readLinkPage.bind(source); const started: string[] = [];
  source.readLinkPage = async (article, direction) => { started.push(article.title); await gate; return read(article,direction); };
  const c = context(source), work = bfsStrategy.step(c);
  try { await Promise.resolve(); await Promise.resolve(); expect(started).toEqual(['B','C','D']); }
  finally { release(); await work; }
  expect(c.graph.route(node('A'), node('Goal'), 6)?.map(e => e.to.title)).toEqual(['B','Goal']);
});
it('keeps completed prefetched evidence even when another page exhausts the budget', async () => {
  const source = new FixtureSource({ A: ['B','C','D'], B: ['Goal'], C: [], D: [], Goal: [] });
  const read = source.readLinkPage.bind(source);
  source.readLinkPage = async (article, direction) => { if (article.title === 'C') throw new RequestBudgetExceededError(); return read(article,direction); };
  const c = context(source);
  await expect(bfsStrategy.step(c)).rejects.toThrow('лимит');
  expect(c.graph.route(node('A'), node('Goal'), 6)?.map(e => e.to.title)).toEqual(['B','Goal']);
});
