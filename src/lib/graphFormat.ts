export interface GraphMetadata { language: string; titles: string[]; aliases: Record<string, string> }
export interface CsrGraph { metadata: GraphMetadata; outOffsets: Uint32Array; outTargets: Uint32Array; inOffsets: Uint32Array; inTargets: Uint32Array }
const MAGIC = 0x47504657; // WPFG, little endian

export function encodeGraph(graph: CsrGraph): Uint8Array {
  const metadata = new TextEncoder().encode(JSON.stringify(graph.metadata));
  const arrays = [graph.outOffsets, graph.outTargets, graph.inOffsets, graph.inTargets];
  const dataStart = (20 + metadata.length + 3) & ~3;
  const bytes = new Uint8Array(dataStart + arrays.reduce((sum, array) => sum + array.length * 4, 0));
  const view = new DataView(bytes.buffer);
  [MAGIC, 1, graph.metadata.titles.length, graph.outTargets.length, metadata.length].forEach((value, i) => view.setUint32(i * 4, value, true));
  bytes.set(metadata, 20);
  let offset = dataStart;
  for (const array of arrays) for (const value of array) { view.setUint32(offset, value, true); offset += 4; }
  return bytes;
}

export function decodeGraph(bytes: Uint8Array): CsrGraph {
  if (bytes.length < 20) throw new Error('Повреждён заголовок локального графа');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== 1) throw new Error('Неизвестный формат локального графа');
  const count = view.getUint32(8, true), edges = view.getUint32(12, true), metadataSize = view.getUint32(16, true);
  let offset = Math.ceil((20 + metadataSize) / 4) * 4;
  if (offset + (2 * (count + 1) + 2 * edges) * 4 !== bytes.length) throw new Error('Неверный размер локального графа');
  const metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(20, 20 + metadataSize))) as GraphMetadata;
  if (!/^[a-z]{2,12}(?:-[a-z]{2,12})?$/.test(metadata.language) || !Array.isArray(metadata.titles) || metadata.titles.length !== count || metadata.titles.some(title => typeof title !== 'string') || new Set(metadata.titles).size !== count || !metadata.aliases || typeof metadata.aliases !== 'object') throw new Error('Повреждены названия локального графа');
  const array = (size: number) => {
    const result = new Uint32Array(size);
    for (let i = 0; i < size; i++) { result[i] = view.getUint32(offset, true); offset += 4; }
    return result;
  };
  const graph = { metadata, outOffsets: array(count + 1), outTargets: array(edges), inOffsets: array(count + 1), inTargets: array(edges) };
  for (const [offsets, targets] of [[graph.outOffsets, graph.outTargets], [graph.inOffsets, graph.inTargets]]) {
    if (offsets[0] !== 0 || offsets[count] !== edges) throw new Error('Повреждены смещения CSR');
    for (let i = 1; i <= count; i++) if (offsets[i] < offsets[i - 1] || offsets[i] > edges) throw new Error('Повреждены смещения CSR');
    for (const target of targets) if (target >= count) throw new Error('Повреждено ребро CSR');
  }
  return graph;
}
