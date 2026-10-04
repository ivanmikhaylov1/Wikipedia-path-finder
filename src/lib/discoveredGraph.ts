import { articleIdentity, type CanonicalArticle, type LinkDirection, type LinkEvidence } from './linkSource';
export interface GraphSnapshot { edges: LinkEvidence[] }
/** Directed evidence only; heuristic exploration never supplies parent distances. */
export class DiscoveredGraph {
  private edges = new Map<string, LinkEvidence>();
  private outgoing = new Map<string, Map<string, LinkEvidence>>();
  private incoming = new Map<string, Map<string, LinkEvidence>>();
  constructor(snapshot?: GraphSnapshot) { if (snapshot) this.add(snapshot.edges); }
  add(edges: LinkEvidence[]): void {
    for (const edge of edges) {
      const from = articleIdentity(edge.from), to = articleIdentity(edge.to); if (from === to) continue;
      const key = JSON.stringify([from,to]); const old = this.edges.get(key);
      if (old?.fresh && !edge.fresh) continue;
      this.edges.set(key, edge);
      const out = this.outgoing.get(from) ?? new Map<string, LinkEvidence>(); out.set(to, edge); this.outgoing.set(from,out);
      const incoming = this.incoming.get(to) ?? new Map<string, LinkEvidence>(); incoming.set(from,edge); this.incoming.set(to,incoming);
    }
  }
  discard(edges: LinkEvidence[]): void {
    for (const edge of edges) {
      const from = articleIdentity(edge.from), to = articleIdentity(edge.to), key = JSON.stringify([from,to]);
      if (this.edges.get(key)?.rawTarget !== edge.rawTarget) continue;
      this.edges.delete(key); this.outgoing.get(from)?.delete(to); this.incoming.get(to)?.delete(from);
    }
  }
  route(start: CanonicalArticle, end: CanonicalArticle, maxSteps: number): LinkEvidence[] | null {
    const startKey = articleIdentity(start), endKey = articleIdentity(end);
    if (startKey === endKey) return [];
    const queue = [{key:startKey,depth:0}], parents = new Map<string,LinkEvidence>(); const seen = new Set([startKey]);
    for (let i=0; i<queue.length; i++) {
      const current = queue[i]; if (current.depth >= maxSteps) continue;
      for (const [next, edge] of this.outgoing.get(current.key) ?? []) {
        if (seen.has(next)) continue; seen.add(next); parents.set(next,edge);
        if (next === endKey) {
          const result: LinkEvidence[] = []; let key = next;
          while (key !== startKey) { const previous = parents.get(key)!; result.push(previous); key=articleIdentity(previous.from); }
          return result.reverse();
        }
        queue.push({key:next,depth:current.depth+1});
      }
    }
    return null;
  }
  reachable(start: CanonicalArticle, direction: LinkDirection, maxDepth: number): Array<{article:CanonicalArticle;depth:number}> {
    const queue = [{article:start,depth:0}], seen = new Set([articleIdentity(start)]);
    for (let i=0; i<queue.length; i++) {
      const current=queue[i]; if(current.depth>=maxDepth) continue;
      const edges=direction==='out'?this.outgoing:this.incoming;
      for (const edge of edges.get(articleIdentity(current.article))?.values() ?? []) {
        const article=direction==='out'?edge.to:edge.from, key=articleIdentity(article); if(seen.has(key)) continue;
        seen.add(key); queue.push({article,depth:current.depth+1});
      }
    }
    return queue;
  }
  snapshot(): GraphSnapshot { return {edges:[...this.edges.values()]}; }
}
