import type { LinkEvidence } from './linkSource';
export interface AdjacencyRecord {
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
    const memory = this.memory.get(key); if (memory) return memory;
    const db = await this.open(); if (!db) return null;
    const saved = await new Promise<AdjacencyRecord | null>(resolve => {
      try {
        const request = db.transaction('adjacency').objectStore('adjacency').get(key);
        request.onsuccess = () => resolve(request.result ?? null); request.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
    if (!saved || !Array.isArray(saved.edges) || Date.now() - saved.storedAt >= 30 * 86400000) return null;
    const record = { ...saved, edges: saved.edges.map(edge => ({ ...edge, fresh: false })) };
    this.memory.set(key, record); return record;
  }
  async put(key: string, record: AdjacencyRecord): Promise<void> {
    this.memory.set(key, record);
    const db = await this.open(); if (!db) return;
    await new Promise<void>(resolve => {
      try {
        const tx = db.transaction('adjacency', 'readwrite');
        tx.objectStore('adjacency').put(record, key);
        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
      } catch { resolve(); }
    });
  }
}
