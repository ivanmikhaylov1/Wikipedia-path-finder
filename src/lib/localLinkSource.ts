import { ArticleNotFoundError, type LinkSource } from './linkSource';
import { decodeGraph, type CsrGraph } from './graphFormat';

/** A static gzip CSR graph, loaded once per language; never calls Wikipedia. */
export class LocalDatasetLinkSource implements LinkSource {
  private graphs = new Map<string, Promise<{ graph: CsrGraph; ids: Map<string, number> }>>();
  constructor(private baseUrl = `${import.meta.env.BASE_URL}graphs/`) {}
  getRequestCount(): number { return 0; }

  private load(lang: string) {
    if (!/^[a-z]{2,12}(?:-[a-z]{2,12})?$/.test(lang)) throw new Error('Некорректный код языка');
    let promise = this.graphs.get(lang);
    if (!promise) {
      promise = (async () => {
        const response = await fetch(`${this.baseUrl}${lang}.bin.gz`);
        if (!response.ok) throw new Error(`Локальный граф ${lang} не найден (HTTP ${response.status})`);
        let bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
          const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
          bytes = new Uint8Array(await new Response(stream).arrayBuffer());
        }
        const graph = decodeGraph(bytes);
        if (graph.metadata.language !== lang) throw new Error('Язык локального графа не соответствует запросу');
        return { graph, ids: new Map(graph.metadata.titles.map((title, id) => [title, id])) };
      })().catch(error => { this.graphs.delete(lang); throw error; });
      this.graphs.set(lang, promise);
    }
    return promise;
  }

  private canonical(title: string, graph: CsrGraph, ids: Map<string, number>, lang: string): string {
    let current = title.trim().replaceAll('_', ' ');
    if (!ids.has(current)) current = current.charAt(0).toLocaleUpperCase(lang) + current.slice(1);
    const seen = new Set<string>();
    while (Object.hasOwn(graph.metadata.aliases, current)) {
      if (seen.has(current)) throw new Error('Циклический редирект в локальном графе');
      seen.add(current); current = graph.metadata.aliases[current];
    }
    if (!ids.has(current)) throw new ArticleNotFoundError(title, lang);
    return current;
  }

  async resolveRedirect(title: string, lang: string): Promise<string> {
    const { graph, ids } = await this.load(lang);
    return this.canonical(title, graph, ids, lang);
  }
  private async links(title: string, lang: string, incoming: boolean, cap = Infinity): Promise<string[]> {
    const { graph, ids } = await this.load(lang);
    const canonical = this.canonical(title, graph, ids, lang);
    const id = ids.get(canonical)!;
    const offsets = incoming ? graph.inOffsets : graph.outOffsets;
    const targets = incoming ? graph.inTargets : graph.outTargets;
    return [...targets.subarray(offsets[id], Math.min(offsets[id + 1], offsets[id] + cap))].map(target => graph.metadata.titles[target]);
  }
  getOutlinks(title: string, lang: string, cap?: number): Promise<string[]> { return this.links(title, lang, false, cap); }
  getInlinks(title: string, lang: string, cap?: number): Promise<string[]> { return this.links(title, lang, true, cap); }
}
