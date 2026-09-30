import { expect, it, vi } from 'vitest';
import { bidirectionalBfs } from '../src/lib/bfs';
import type { LinkSource } from '../src/lib/linkSource';
import { DEFAULT_LIMITS } from '../src/lib/searchLimits';

// Enumerate simple paths independently of bidirectional BFS, pruning only paths
// already longer than the best. A shortest path never needs a repeated vertex.
function shortestByEnumeration(edges: string[][], start: number, end: number): number {
  let shortest = Infinity;
  function visit(node: number, path: Set<number>, distance: number) {
    if (distance >= shortest) return;
    if (node === end) { shortest = distance; return; }
    for (const title of edges[node]) {
      const next = Number(title);
      if (!path.has(next)) { path.add(next); visit(next, path, distance + 1); path.delete(next); }
    }
  }
  visit(start, new Set([start]), 0);
  return shortest;
}

it('matches exhaustive shortest paths for every pair in 200 seeded random directed graphs', async () => {
  let seed = 0x20260930;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
  for (let sample = 0; sample < 200; sample++) {
    const count = 2 + Math.floor(random() * 7);
    const density = random() * 0.8;
    const edges = Array.from({ length: count }, (_, i) => Array.from({ length: count }, (_, j) => j).filter(j => i !== j && random() < density).map(String));
    const source: LinkSource = {
      resolveRedirect: async title => title,
      getOutlinks: async title => edges[Number(title)],
      getInlinks: async title => edges.flatMap((links, i) => links.includes(title) ? [String(i)] : []),
    };
    if (sample % 2 === 0) {
      source.getOutlinksBatch = async titles => new Map(titles.map(title => [title, { links: edges[Number(title)], sizeBytes: 0 }]));
      source.getInlinksBatch = async titles => new Map(await Promise.all(titles.map(async title => [title, { links: await source.getInlinks(title, 'en'), sizeBytes: 0 }] as const)));
    }
    for (let start = 0; start < count; start++) for (let end = 0; end < count; end++) {
      const expected = shortestByEnumeration(edges, start, end);
      const result = await bidirectionalBfs(source, String(start), String(end), 'en', { ...DEFAULT_LIMITS, maxDepth: count, widening: [50] });
      const context = JSON.stringify({ sample, edges, start, end });
      if (expected === Infinity) expect(result.status, context).toBe('not_found');
      else {
        expect(result.status, context).toBe('found');
        if (result.status === 'found') {
          expect(result.path.length - 1, context).toBe(expected);
          expect(result.path[0]).toBe(String(start));
          expect(result.path.at(-1)).toBe(String(end));
          for (let i = 1; i < result.path.length; i++) expect(edges[Number(result.path[i - 1])], context).toContain(result.path[i]);
        }
      }
    }
  }
}, 20_000);

it('chooses a small reverse frontier instead of traversing a hub and preserves shortest paths', async () => {
  const edges: Record<string, string[]> = { A: Array.from({ length: 40 }, (_, i) => `H${i}`), H39: ['D'], D: [] };
  const out = vi.fn(async (title: string) => edges[title] ?? []);
  const source: LinkSource = { resolveRedirect: async title => title, getOutlinks: out, getInlinks: async title => Object.keys(edges).filter(key => edges[key].includes(title)) };
  const result = await bidirectionalBfs(source, 'A', 'D', 'en', DEFAULT_LIMITS);
  expect(result).toEqual({ status: 'found', path: ['A', 'H39', 'D'], exact: true });
  expect(out).toHaveBeenCalledTimes(1);
});
