import { RequestBudgetExceededError, type LinkSource } from './linkSource';
import type { SearchLimits } from './searchLimits';

export type NotFoundReason = 'depth' | 'budget' | 'timeout' | 'no_path';
export type SearchResult = { path: string[] } | { notFound: true; reason: NotFoundReason };
export interface SearchProgress { depth: number; visitedCount: number }

function reconstruct(meeting: string, forward: Map<string, string | null>, backward: Map<string, string | null>): string[] {
  const left: string[] = [];
  let node: string | null = meeting;
  while (node !== null) { left.push(node); node = forward.get(node) ?? null; }
  left.reverse();
  node = backward.get(meeting) ?? null;
  while (node !== null) { left.push(node); node = backward.get(node) ?? null; }
  return left;
}

/** Directed bidirectional BFS. One layer is completed before returning a meeting. */
export async function bidirectionalBfs(
  source: LinkSource,
  from: string,
  to: string,
  lang: string,
  limits: SearchLimits,
  onProgress: (progress: SearchProgress) => void = () => {},
): Promise<SearchResult> {
  const deadline = Date.now() + limits.searchTimeout;
  let requestCount = 0;
  const timed = async <T>(request: () => Promise<T>): Promise<T> => {
    if (Date.now() >= deadline) throw new SearchExpired();
    requestCount++;
    const remaining = Math.max(1, deadline - Date.now());
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        request(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new SearchExpired()), remaining); }),
      ]);
    } finally { clearTimeout(timer!); }
  };

  try {
    if (limits.maxTotalRequests < 2) return { notFound: true, reason: 'budget' };
    const start = await timed(() => source.resolveRedirect(from, lang));
    const end = await timed(() => source.resolveRedirect(to, lang));
    if (start === end) return { path: [start] };

    const forward = new Map<string, string | null>([[start, null]]);
    const backward = new Map<string, string | null>([[end, null]]);
    let forwardFrontier = [start];
    let backwardFrontier = [end];
    let forwardDepth = 0;
    let backwardDepth = 0;
    let visitedCount = 2;
    onProgress({ depth: 0, visitedCount: 2 });

    while (forwardFrontier.length && backwardFrontier.length) {
      if (Date.now() >= deadline) return { notFound: true, reason: 'timeout' };
      const canForward = forwardDepth < limits.maxDepth;
      const canBackward = backwardDepth < limits.maxDepth;
      if (!canForward && !canBackward) return { notFound: true, reason: 'depth' };
      if (requestCount >= limits.maxTotalRequests) return { notFound: true, reason: 'budget' };

      const expandForward = canForward && (!canBackward || forwardFrontier.length <= backwardFrontier.length);
      const frontier = expandForward ? forwardFrontier : backwardFrontier;
      const own = expandForward ? forward : backward;
      const other = expandForward ? backward : forward;
      const next: string[] = [];
      let meeting: string | null = null;
      let bestLength = Infinity;

      for (let offset = 0; offset < frontier.length; ) {
        if (Date.now() >= deadline) return { notFound: true, reason: 'timeout' };
        const available = limits.maxTotalRequests - requestCount;
        if (available <= 0) break;
        const batch = frontier.slice(offset, offset + Math.min(limits.concurrency, available));
        offset += batch.length;
        const linkLists = await Promise.all(batch.map(page => timed(() =>
          expandForward ? source.getOutlinks(page, lang) : source.getInlinks(page, lang),
        )));
        for (let i = 0; i < batch.length; i++) {
          for (const neighbor of linkLists[i].slice(0, limits.maxLinksPerPage)) {
            if (!own.has(neighbor)) {
              own.set(neighbor, batch[i]);
              next.push(neighbor);
              if (!other.has(neighbor)) visitedCount++;
            }
            if (other.has(neighbor)) {
              const pathLength = reconstruct(neighbor, forward, backward).length;
              if (pathLength < bestLength) { meeting = neighbor; bestLength = pathLength; }
            }
          }
        }
        onProgress({
          depth: Math.max(forwardDepth + Number(expandForward), backwardDepth + Number(!expandForward)),
          visitedCount,
        });
      }
      if (meeting !== null) return { path: reconstruct(meeting, forward, backward) };
      if (requestCount >= limits.maxTotalRequests) return { notFound: true, reason: 'budget' };
      if (expandForward) { forwardFrontier = next; forwardDepth++; }
      else { backwardFrontier = next; backwardDepth++; }
    }
    return { notFound: true, reason: 'no_path' };
  } catch (error) {
    if (error instanceof SearchExpired) return { notFound: true, reason: 'timeout' };
    if (error instanceof RequestBudgetExceededError) return { notFound: true, reason: 'budget' };
    throw error;
  }
}

class SearchExpired extends Error {}
