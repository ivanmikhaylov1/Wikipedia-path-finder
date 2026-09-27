import { describe, expect, it, vi } from 'vitest';
import { bidirectionalBfs, type SearchResult } from '../src/lib/bfs';
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
  it('finds a short path in the first widening round and uses batch outlinks', async () => {
    const source = graph({ A: ['B'], B: ['D'], D: [] });
    source.getOutlinksBatch = vi.fn(async (titles: string[]) => new Map<string, { links: string[]; sizeBytes: number }>(titles.map(title => [title, { links: ({ A: ['B'], B: ['D'], D: [] } as Record<string, string[]>)[title], sizeBytes: title === 'A' ? 100 : 200 }])));
    const progress = vi.fn();
    expect(await bidirectionalBfs(source, 'A', 'D', 'ru', DEFAULT_LIMITS, progress)).toEqual({ status: 'found', path: ['A', 'B', 'D'], exact: true });
    expect(progress.mock.calls.every(([value]) => value.round === 1 && value.linkCap === 50)).toBe(true);
    expect(source.getOutlinksBatch).toHaveBeenCalled();
    expect(source.getOutlinks).not.toHaveBeenCalled();
  });

  it('emits a directed quick path before a shorter BFS result', async () => {
    const source = graph({ A: ['B', 'X'], B: ['D'], X: ['Y'], Y: ['D'], D: [] });
    const firstLinks: Record<string, string | null> = { A: 'X', X: 'Y', Y: 'D', D: null };
    source.getFirstTextLink = vi.fn(async title => firstLinks[title] ?? null);
    const candidates: SearchResult[] = [];
    const result = await bidirectionalBfs(source, 'A', 'D', 'ru', DEFAULT_LIMITS, undefined,
      { onCandidate: candidate => { expect(source.getOutlinks).not.toHaveBeenCalled(); candidates.push(candidate); } });
    expect(candidates).toEqual([{ status: 'found', path: ['A', 'X', 'Y', 'D'], exact: false }]);
    expect(result).toEqual({ status: 'found', path: ['A', 'B', 'D'], exact: true });
  });

  it('never reverses an unverified first-link chain', async () => {
    const source = graph({ A: ['Shared'], Z: ['Shared'], Shared: [] });
    source.getFirstTextLink = vi.fn(async title => ({ A: 'Shared', Z: 'Shared' } as Record<string, string>)[title] ?? null);
    const candidate = vi.fn();
    const result = await bidirectionalBfs(source, 'A', 'Z', 'ru', { ...DEFAULT_LIMITS, maxDepth: 1 }, undefined, { onCandidate: candidate });
    expect(candidate).not.toHaveBeenCalled();
    expect(result.status).toBe('not_found');
  });

  it('uses a shared first-link node only after verifying reverse edges', async () => {
    const source = graph({ A: ['Shared'], Z: ['Shared'], Shared: ['Z'] });
    source.getFirstTextLink = vi.fn(async title => ({ A: 'Shared', Z: 'Shared' } as Record<string, string>)[title] ?? null);
    source.getOutlinksBatch = vi.fn(async (titles: string[]) => new Map<string, { links: string[]; sizeBytes: number }>(titles.map(title => [title, { links: title === 'Shared' ? ['Z'] : [], sizeBytes: 100 }])));
    const candidate = vi.fn();
    await bidirectionalBfs(source, 'A', 'Z', 'ru', DEFAULT_LIMITS, undefined, { onCandidate: candidate });
    expect(candidate).toHaveBeenCalledWith({ status: 'found', path: ['A', 'Shared', 'Z'], exact: false });
  });

  it('resumes after the request budget with retained visited nodes', async () => {
    const source = graph({ A: ['B'], B: ['D'], D: [] });
    const limits = { ...DEFAULT_LIMITS, maxTotalRequests: 3 };
    const first = await bidirectionalBfs(source, 'A', 'D', 'ru', limits);
    expect(first.status).toBe('not_found');
    if (first.status !== 'not_found') return;
    expect(first.reason).toBe('budget');
    expect(first.resumeState).toBeDefined();
    const secondSource = graph({ A: ['B'], B: ['D'], D: [] });
    const second = await bidirectionalBfs(secondSource, 'A', 'D', 'ru', limits, undefined, { resumeState: first.resumeState });
    expect(second).toEqual({ status: 'found', path: ['A', 'B', 'D'], exact: true });
    expect(secondSource.resolveRedirect).not.toHaveBeenCalled();
  });

  it('stops at maxDepth without a meeting', async () => {
    const source = graph({ A: ['B'], B: ['C'], C: ['D'], D: [] });
    const result = await bidirectionalBfs(source, 'A', 'D', 'ru', { ...DEFAULT_LIMITS, maxDepth: 1 });
    expect(result).toEqual({ status: 'not_found', reason: 'depth' });
  });

  it('does not treat reverse links as a forward path', async () => {
    const source = graph({ B: ['A'], C: ['B'], A: [] });
    const result = await bidirectionalBfs(source, 'A', 'C', 'ru', DEFAULT_LIMITS);
    expect(result).toEqual({ status: 'not_found', reason: 'no_path' });
  });

  it('resolves both endpoints before comparing them', async () => {
    const source = graph({});
    source.resolveRedirect = vi.fn(async () => 'Canonical');
    expect(await bidirectionalBfs(source, 'Alias', 'Canonical', 'ru', DEFAULT_LIMITS)).toEqual({ status: 'found', path: ['Canonical'], exact: true });
  });
});
