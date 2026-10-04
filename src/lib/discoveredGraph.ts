import { articleIdentity, type CanonicalArticle, type LinkDirection, type LinkEvidence } from './linkSource';
export interface GraphSnapshot { edges: LinkEvidence[] }
type Reachable = Array<{ article: CanonicalArticle; depth: number }>;
interface Traversal {
  direction: LinkDirection; maxDepth: number;
  articles: Map<string, CanonicalArticle>; distances: Map<string, number>;
  parents: Map<string, LinkEvidence>; result?: Reachable;
}
/** Directed evidence with incrementally maintained shortest-distance indexes.
 * Deletions invalidate the indexes; additions relax only affected descendants. */
export class DiscoveredGraph {
  private edges = new Map<string, LinkEvidence>();
  private outgoing = new Map<string, Map<string, LinkEvidence>>();
  private incoming = new Map<string, Map<string, LinkEvidence>>();
  private traversals = new Map<string, Traversal>();
  constructor(snapshot?: GraphSnapshot) { if (snapshot) this.add(snapshot.edges); }
  private adjacency(direction: LinkDirection) { return direction === 'out' ? this.outgoing : this.incoming; }
  private relax(index: Traversal, queue: string[]): void {
    for (let i = 0; i < queue.length; i++) {
      const key = queue[i], depth = index.distances.get(key)!;
      if (depth >= index.maxDepth) continue;
      for (const edge of this.adjacency(index.direction).get(key)?.values() ?? []) this.offer(index, edge, queue);
    }
  }
  private offer(index: Traversal, edge: LinkEvidence, queue: string[]): void {
    const origin = articleIdentity(index.direction === 'out' ? edge.from : edge.to);
    const article = index.direction === 'out' ? edge.to : edge.from, next = articleIdentity(article);
    const depth = index.distances.get(origin);
    if (depth === undefined || depth >= index.maxDepth) return;
    if (depth + 1 < (index.distances.get(next) ?? Infinity)) {
      index.distances.set(next, depth + 1); index.articles.set(next, article);
      index.parents.set(next, edge); index.result = undefined; queue.push(next);
    } else {
      const parent = index.parents.get(next);
      if (parent && articleIdentity(parent.from) === articleIdentity(edge.from) && articleIdentity(parent.to) === articleIdentity(edge.to)) index.parents.set(next, edge);
    }
  }
  private traversal(start: CanonicalArticle, direction: LinkDirection, maxDepth: number): Traversal {
    const startKey = articleIdentity(start), key = JSON.stringify([startKey, direction, maxDepth]);
    let index = this.traversals.get(key);
    if (!index) {
      index = { direction, maxDepth, articles: new Map([[startKey,start]]), distances: new Map([[startKey,0]]), parents: new Map() };
      this.traversals.set(key,index); this.relax(index,[startKey]);
    }
    return index;
  }
  add(edges: LinkEvidence[]): void {
    const queues = new Map<Traversal,string[]>();
    for (const edge of edges) {
      const from = articleIdentity(edge.from), to = articleIdentity(edge.to); if (from === to) continue;
      const key = JSON.stringify([from,to]), old = this.edges.get(key);
      if (old?.fresh && !edge.fresh) continue;
      if (old?.fresh === edge.fresh && old?.rawTarget === edge.rawTarget) continue;
      this.edges.set(key, edge);
      const out = this.outgoing.get(from) ?? new Map<string, LinkEvidence>(); out.set(to, edge); this.outgoing.set(from,out);
      const incoming = this.incoming.get(to) ?? new Map<string, LinkEvidence>(); incoming.set(from,edge); this.incoming.set(to,incoming);
      for (const index of this.traversals.values()) {
        const queue = queues.get(index) ?? []; queues.set(index,queue); this.offer(index,edge,queue);
      }
    }
    for (const [index,queue] of queues) this.relax(index,queue);
  }
  discard(edges: LinkEvidence[]): void {
    let changed = false;
    for (const edge of edges) {
      const from = articleIdentity(edge.from), to = articleIdentity(edge.to), key = JSON.stringify([from,to]);
      if (this.edges.get(key)?.rawTarget !== edge.rawTarget) continue;
      this.edges.delete(key); this.outgoing.get(from)?.delete(to); this.incoming.get(to)?.delete(from); changed = true;
    }
    if (changed) this.traversals.clear();
  }
  route(start: CanonicalArticle, end: CanonicalArticle, maxSteps: number): LinkEvidence[] | null {
    const startKey = articleIdentity(start), endKey = articleIdentity(end);
    if (startKey === endKey) return [];
    const index = this.traversal(start,'out',maxSteps);
    if (!index.distances.has(endKey)) return null;
    const result: LinkEvidence[] = []; let key = endKey;
    while (key !== startKey) {
      const edge = index.parents.get(key)!; result.push(edge); key = articleIdentity(edge.from);
    }
    return result.reverse();
  }
  reachable(start: CanonicalArticle, direction: LinkDirection, maxDepth: number): Reachable {
    const index = this.traversal(start,direction,maxDepth);
    if (!index.result) {
      const layers: Reachable[] = Array.from({length:maxDepth+1},()=>[]);
      for (const [key,depth] of index.distances) layers[depth].push({article:index.articles.get(key)!,depth});
      index.result = layers.flat();
    }
    return index.result;
  }
  countConnections(article: CanonicalArticle, targets: Set<string>, scanLimit = 128): number {
    let count = 0, scanned = 0;
    for (const target of this.outgoing.get(articleIdentity(article))?.keys() ?? []) {
      if (scanned++ >= scanLimit) break;
      if (targets.has(target)) count++;
    }
    return count;
  }
  snapshot(): GraphSnapshot { return {edges:[...this.edges.values()]}; }
}
