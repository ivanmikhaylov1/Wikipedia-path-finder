import { describe, expect, it, vi } from 'vitest';
import { bidirectionalBfs } from '../src/lib/bfs';
import type { LinkSource } from '../src/lib/linkSource';
import { DEFAULT_LIMITS } from '../src/lib/searchLimits';

function graph(edges: Record<string, string[]>): LinkSource {
  return {
    resolveRedirect: vi.fn(async title => title),
    getOutlinks: vi.fn(async title => edges[title] ?? []),
    getInlinks: vi.fn(async title => Object.keys(edges).filter(page => edges[page].includes(title))),
  };
}

describe('bidirectionalBfs', () => {
  it('restores a directed path when frontiers meet', async () => {
    const source = graph({ A: ['B', 'X'], B: ['C'], C: ['D'], X: [], D: [] });
    const progress = vi.fn();
    expect(await bidirectionalBfs(source, 'A', 'D', 'ru', DEFAULT_LIMITS, progress)).toEqual({ path: ['A', 'B', 'C', 'D'] });
    expect(progress).toHaveBeenCalled();
  });

  it('does not treat reverse links as a forward path', async () => {
    const source = graph({ B: ['A'], C: ['B'], A: [] });
    expect(await bidirectionalBfs(source, 'A', 'C', 'ru', DEFAULT_LIMITS)).toEqual({ notFound: true, reason: 'no_path' });
  });

  it('stops at maxDepth without a meeting', async () => {
    const source = graph({ A: ['B'], B: ['C'], C: ['D'], D: [] });
    const limits = { ...DEFAULT_LIMITS, maxDepth: 1 };
    expect(await bidirectionalBfs(source, 'A', 'D', 'ru', limits)).toEqual({ notFound: true, reason: 'depth' });
  });

  it('stops at maxTotalRequests on a hub without a meeting', async () => {
    const source = graph({ A: Array.from({ length: 1000 }, (_, i) => `Hub ${i}`), Z: [] });
    const limits = { ...DEFAULT_LIMITS, maxTotalRequests: 3, maxLinksPerPage: 500 };
    const progress = vi.fn();
    expect(await bidirectionalBfs(source, 'A', 'Z', 'ru', limits, progress)).toEqual({ notFound: true, reason: 'budget' });
    expect(source.getOutlinks).toHaveBeenCalledTimes(1);
    expect(progress.mock.lastCall?.[0].visitedCount).toBe(502);
  });

  it('resolves both endpoints before comparing them', async () => {
    const source = graph({});
    source.resolveRedirect = vi.fn(async () => 'Canonical');
    expect(await bidirectionalBfs(source, 'Alias', 'Canonical', 'ru', DEFAULT_LIMITS)).toEqual({ path: ['Canonical'] });
  });
});
