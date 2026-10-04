import { RequestBudgetExceededError, type LinkSource } from './linkSource';
import type { SearchLimits } from './searchLimits';

export type NotFoundReason = 'depth' | 'budget' | 'timeout' | 'no_path';
type SearchNode = { title: string; parent: string | null; depth: number; sizeBytes?: number };
export interface BfsResumeState {
  start: string;
  end: string;
  forward: SearchNode[];
  backward: SearchNode[];
  expandedForward: Array<[string, number]>;
  expandedBackward: Array<[string, number]>;
  roundIndex: number;
  depth: number;
  side: 'forward' | 'backward';
  pending: string[] | null;
  pendingIndex: number;
  bestMeeting: string | null;
  fallbackDone: boolean;
}
export type SearchResult =
  | { status: 'found'; path: string[]; exact: boolean }
  | { status: 'not_found'; reason: NotFoundReason; resumeState?: BfsResumeState };
export interface SearchProgress {
  strategy?: 'bfs' | 'bridge' | 'guided';
  depth: number;
  visitedCount: number;
  round: number;
  roundCount: number;
  linkCap: number;
  frontierA?: number;
  frontierB?: number;
  sampleTitles?: string[];
}

class SearchExpired extends Error {}

function reconstruct(meeting: string, forward: Map<string, SearchNode>, backward: Map<string, SearchNode>): string[] {
  const left: string[] = [];
  let node: string | null = meeting;
  while (node !== null) { left.push(node); node = forward.get(node)?.parent ?? null; }
  left.reverse();
  node = backward.get(meeting)?.parent ?? null;
  while (node !== null) { left.push(node); node = backward.get(node)?.parent ?? null; }
  return left;
}

function currentCaps(limits: SearchLimits): number[] {
  return [...new Set(limits.widening.map(cap => Math.min(cap, limits.maxLinksPerPage)).filter(cap => cap > 0))]
    .sort((a, b) => a - b);
}

/** Directed BFS with complete layers, smaller-frontier expansion and cached widening rounds. */
export async function bidirectionalBfs(
  source: LinkSource,
  from: string,
  to: string,
  lang: string,
  limits: SearchLimits,
  onProgress: (progress: SearchProgress) => void = () => {},
  options: { resumeState?: BfsResumeState; onCandidate?: (result: Extract<SearchResult, { status: 'found' }>) => void } = {},
): Promise<SearchResult> {
  const caps = currentCaps(limits);
  if (!caps.length) throw new Error('Не задано ни одного раунда поиска');
  const deadline = Date.now() + limits.searchTimeout;
  let requestCount = 0;
  const requestBase = source.getRequestCount?.();
  const timed = async <T>(request: () => Promise<T>): Promise<T> => {
    if (Date.now() >= deadline) throw new SearchExpired();
    if (requestCount >= limits.maxTotalRequests) throw new RequestBudgetExceededError();
    if (requestBase === undefined) requestCount++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        request(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new SearchExpired()), Math.max(1, deadline - Date.now())); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      if (requestBase !== undefined) requestCount = Math.max(0, (source.getRequestCount?.() ?? requestBase) - requestBase);
    }
  };

  let state: BfsResumeState;
  if (options.resumeState) {
    state = structuredClone(options.resumeState);
    if (state.start !== from || state.end !== to) throw new Error('Состояние продолжения не соответствует статьям');
  } else {
    if (limits.maxTotalRequests < 2) return { status: 'not_found', reason: 'budget' };
    let start: string, end: string;
    try {
      start = await timed(() => source.resolveRedirect(from, lang));
      end = await timed(() => source.resolveRedirect(to, lang));
    } catch (error) {
      if (error instanceof RequestBudgetExceededError) return { status: 'not_found', reason: 'budget' };
      if (error instanceof SearchExpired) return { status: 'not_found', reason: 'timeout' };
      throw error;
    }
    if (start === end) return { status: 'found', path: [start], exact: true };
    state = {
      start, end,
      forward: [{ title: start, parent: null, depth: 0 }],
      backward: [{ title: end, parent: null, depth: 0 }],
      expandedForward: [], expandedBackward: [],
      roundIndex: 0, depth: 0, side: 'forward', pending: null, pendingIndex: 0,
      bestMeeting: null, fallbackDone: false,
    };
  }
  const forward = new Map(state.forward.map(node => [node.title, node]));
  const backward = new Map(state.backward.map(node => [node.title, node]));
  const allVisited = new Set([...forward.keys(), ...backward.keys()]);
  const expandedForward = new Map(state.expandedForward);
  const expandedBackward = new Map(state.expandedBackward);
  const save = (): BfsResumeState => ({
    ...state,
    forward: [...forward.values()], backward: [...backward.values()],
    expandedForward: [...expandedForward], expandedBackward: [...expandedBackward],
  });
  const frontierSize = (nodes: Map<string, SearchNode>, expanded: Map<string, number>) => {
    const eligible = [...nodes.values()].filter(node => node.depth < limits.maxDepth && (expanded.get(node.title) ?? 0) < caps[state.roundIndex]);
    const depth = eligible.reduce((minimum, node) => Math.min(minimum, node.depth), Infinity);
    return eligible.filter(node => node.depth === depth).length;
  };
  const progress = () => onProgress({
    depth: state.depth,
    visitedCount: allVisited.size,
    round: state.roundIndex + 1,
    roundCount: caps.length,
    linkCap: caps[state.roundIndex],
    // Observability only: expose the existing frontiers without changing expansion.
    frontierA: frontierSize(forward, expandedForward),
    frontierB: frontierSize(backward, expandedBackward),
    sampleTitles: [...allVisited].slice(-6),
  });
  progress();

  try {
    while (state.roundIndex < caps.length) {
      if (Date.now() >= deadline) throw new SearchExpired();
      const cap = caps[state.roundIndex];
      const frontier = (nodes: Map<string, SearchNode>, expanded: Map<string, number>) => {
        const eligible = [...nodes.values()].filter(node => node.depth < limits.maxDepth && (expanded.get(node.title) ?? 0) < cap);
        const depth = eligible.reduce((minimum, node) => Math.min(minimum, node.depth), Infinity);
        return eligible.filter(node => node.depth === depth);
      };
      if (state.pending === null) {
        const left = frontier(forward, expandedForward);
        const right = frontier(backward, expandedBackward);
        if (!left.length && !right.length) {
          if (state.roundIndex < caps.length - 1) {
            state.roundIndex++;
            // Larger caps introduce edges at earlier depths. Rebuild BFS layers
            // while LinkSource keeps its cache; old parent depths are not reused.
            forward.clear(); backward.clear(); expandedForward.clear(); expandedBackward.clear();
            forward.set(state.start, { title: state.start, parent: null, depth: 0 });
            backward.set(state.end, { title: state.end, parent: null, depth: 0 });
            state.bestMeeting = null;
            continue;
          }
          const reachedDepthLimit = [...forward.values(), ...backward.values()].some(node => node.depth >= limits.maxDepth);
          return { status: 'not_found', reason: reachedDepthLimit ? 'depth' : 'no_path' };
        }
        state.side = !right.length || (left.length > 0 && left.length <= right.length) ? 'forward' : 'backward';
        const candidates = state.side === 'forward' ? left : right;
        state.depth = candidates[0].depth;
        // Order only within a layer. Fetching info for an entire large frontier
        // would consume the search budget before traversing any links.
        candidates.sort((a, b) => (a.sizeBytes ?? Infinity) - (b.sizeBytes ?? Infinity));
        state.pending = candidates.map(node => node.title);
        state.pendingIndex = 0;
      }
      const own = state.side === 'forward' ? forward : backward;
      const other = state.side === 'forward' ? backward : forward;
      const expanded = state.side === 'forward' ? expandedForward : expandedBackward;
      if (state.pendingIndex >= state.pending.length) {
        state.pending = null; state.pendingIndex = 0;
        if (state.bestMeeting) return { status: 'found', path: reconstruct(state.bestMeeting, forward, backward), exact: true };
        progress();
        continue;
      }
      if (requestCount >= limits.maxTotalRequests) throw new RequestBudgetExceededError();
      const remaining = limits.maxTotalRequests - requestCount;
      const batchMethod = state.side === 'forward' ? source.getOutlinksBatch : source.getInlinksBatch;
      const size = batchMethod ? Math.min(50, remaining) : Math.min(6, limits.concurrency, remaining);
      const batch = state.pending.slice(state.pendingIndex, state.pendingIndex + size);
      if (!batch.length) throw new RequestBudgetExceededError();
      let lists: Array<{ links: string[]; sizeBytes?: number }>;
      if (batchMethod) {
        const data = await timed(() => batchMethod.call(source, batch, lang, cap));
        lists = batch.map(title => data.get(title) ?? { links: [] });
      } else {
        const received = await Promise.all(batch.map(title => timed(() => state.side === 'forward'
          ? source.getOutlinks(title, lang, cap) : source.getInlinks(title, lang, cap))));
        lists = received.map(links => ({ links }));
      }
      for (let i = 0; i < batch.length; i++) {
        const title = batch[i];
        const current = own.get(title)!;
        if (lists[i].sizeBytes !== undefined) current.sizeBytes = lists[i].sizeBytes;
        for (const neighbor of lists[i].links.slice(0, cap)) {
          const nextDepth = current.depth + 1;
          const existing = own.get(neighbor);
          if (!existing || nextDepth < existing.depth) {
            own.set(neighbor, { title: neighbor, parent: title, depth: nextDepth });
            allVisited.add(neighbor);
          }
          if (other.has(neighbor)) {
            const previous = state.bestMeeting ? reconstruct(state.bestMeeting, forward, backward).length : Infinity;
            const candidate = reconstruct(neighbor, forward, backward).length;
            if (candidate < previous) state.bestMeeting = neighbor;
          }
        }
        expanded.set(title, cap);
      }
      state.pendingIndex += batch.length;
      progress();
    }
    return { status: 'not_found', reason: 'no_path' };
  } catch (error) {
    if (error instanceof RequestBudgetExceededError) return { status: 'not_found', reason: 'budget', resumeState: save() };
    if (error instanceof SearchExpired) return { status: 'not_found', reason: 'timeout', resumeState: save() };
    throw error;
  }
}
