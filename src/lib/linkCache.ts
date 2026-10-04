import type { LinkEvidence } from './linkSource';
export interface AdjacencyRecord {
  revision?: number;
  edges: LinkEvidence[];
  complete: boolean;
  storedAt: number;
  cursor?: Record<string, string>;
  phase?: 'direct' | 'aliases' | 'references';
  aliases?: string[];
  aliasIndex?: number;
}
/** Persistent records never imply current-search evidence. Memory survives IDB failures. */
export class LinkCache {
  private memory = new Map<string, AdjacencyRecord>();
  private database?: Promise<IDBDatabase | null>;
  private open(): Promise<IDBDatabase | null> {
    if (!this.database) this.database = new Promise(resolve => {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      try {
        const request = indexedDB.open('wikipedia-path-finder-links-v4', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('adjacency');
        request.onsuccess = () => resolve(request.result);
        request.onerror = request.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
    return this.database;
  }
  async get(key: string): Promise<AdjacencyRecord | null> {
    const memory = this.memory.get(key);
    const db = await this.open(); if (!db) return memory ?? null;
    const saved = await new Promise<AdjacencyRecord | null>(resolve => {
      try {
        const request = db.transaction('adjacency').objectStore('adjacency').get(key);
        request.onsuccess = () => resolve(request.result ?? null); request.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
    if (!saved || !Array.isArray(saved.edges) || Date.now() - saved.storedAt >= 30 * 86400000) return memory ?? null;
    const current = new Set(memory?.edges.filter(e => e.fresh).map(e => JSON.stringify([e.from, e.to, e.rawTarget])));
    const record = { ...saved, edges: saved.edges.map(edge => ({ ...edge, fresh: current.has(JSON.stringify([edge.from, edge.to, edge.rawTarget])) })) };
    this.memory.set(key, record); return record;
  }
  async put(key: string, record: AdjacencyRecord): Promise<AdjacencyRecord> {
    const db = await this.open();
    if (!db) {
      const old = this.memory.get(key);
      const chosen = old && (old.revision ?? 0) > (record.revision ?? 0) ? old : record;
      this.memory.set(key, chosen); return chosen;
    }
    const chosen = await new Promise<AdjacencyRecord>(resolve => {
      let selected = record;
      try {
        const tx = db.transaction('adjacency', 'readwrite'), store = tx.objectStore('adjacency');
        const read = store.get(key);
        read.onsuccess = () => {
          const old = read.result as AdjacencyRecord | undefined;
          // Revisions order whole query states, including opaque continuation tokens.
          // Never union cursors from independent acquisition generations.
          if (old && ((old.revision ?? 0) > (record.revision ?? 0) ||
              ((old.revision ?? 0) === (record.revision ?? 0) && old.complete && !record.complete))) {
            selected = { ...old, edges: old.edges.map(e => ({ ...e, fresh: false })) };
          } else store.put(record, key);
        };
        tx.oncomplete = tx.onerror = tx.onabort = () => resolve(selected);
      } catch { resolve(selected); }
    });
    this.memory.set(key, chosen); return chosen;
  }
}

const pending = new Map<string, Promise<unknown>>();
/** Web Locks serialize workers/tabs; the fallback also serializes source instances. */
export async function withAdjacencyLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(`wpf-adjacency:${key}`, action);
  const prior = pending.get(key) ?? Promise.resolve();
  const work = prior.catch(() => {}).then(action); pending.set(key, work);
  try { return await work; } finally { if (pending.get(key) === work) pending.delete(key); }
}
