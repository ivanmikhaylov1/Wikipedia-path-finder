import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { parseArgs } from 'node:util';
import { encodeGraph } from '../src/lib/graphFormat';
import { dumpRows } from './sqlDump';

const { values } = parseArgs({ options: Object.fromEntries(['page', 'pagelinks', 'linktarget', 'redirect', 'lang', 'out'].map(name => [name, { type: 'string' as const }])) });
if (!values.page || !values.pagelinks || !values.lang || !/^[a-z]{2,12}(?:-[a-z]{2,12})?$/.test(values.lang)) throw new Error('Usage: npm run build:graph -- --lang ru --page page.sql.gz --pagelinks pagelinks.sql.gz [--linktarget linktarget.sql.gz] [--redirect redirect.sql.gz] [--out public/graphs/ru.bin.gz]');
const normalize = (title: string) => title.replaceAll('_', ' ');
const pageIds = new Map<number, number>();
const titleIds = new Map<string, number>();
const titles: string[] = [];
for await (const page of dumpRows(values.page, 'page')) {
  if (page.page_namespace !== 0) continue;
  const title = normalize(String(page.page_title));
  const id = titles.length;
  pageIds.set(Number(page.page_id), id); titleIds.set(title, id); titles.push(title);
}
const aliases: Record<string, string> = Object.create(null);
if (values.redirect) for await (const row of dumpRows(values.redirect, 'redirect')) {
  const id = pageIds.get(Number(row.rd_from));
  if (id !== undefined && row.rd_namespace === 0 && !row.rd_interwiki) aliases[titles[id]] = normalize(String(row.rd_title));
}
function canonical(id: number): number | undefined {
  const seen = new Set<string>();
  let title = titles[id];
  while (Object.hasOwn(aliases, title)) {
    if (seen.has(title)) return undefined;
    seen.add(title); title = aliases[title];
  }
  return titleIds.get(title);
}
const targets = new Map<number, number>();
if (values.linktarget) for await (const row of dumpRows(values.linktarget, 'linktarget')) {
  if (row.lt_namespace !== 0) continue;
  const id = titleIds.get(normalize(String(row.lt_title)));
  if (id !== undefined) { const resolved = canonical(id); if (resolved !== undefined) targets.set(Number(row.lt_id), resolved); }
}
async function* edges() {
  for await (const row of dumpRows(values.pagelinks!, 'pagelinks')) {
    if (row.pl_from_namespace !== undefined && row.pl_from_namespace !== 0) continue;
    const original = pageIds.get(Number(row.pl_from));
    if (original === undefined || Object.hasOwn(aliases, titles[original])) continue;
    let target: number | undefined;
    if (row.pl_target_id !== undefined) {
      if (!values.linktarget) throw new Error('This pagelinks schema needs --linktarget from the same Wikimedia snapshot');
      target = targets.get(Number(row.pl_target_id));
    } else if (row.pl_namespace === 0) {
      const id = titleIds.get(normalize(String(row.pl_title)));
      if (id !== undefined) target = canonical(id);
    }
    if (target !== undefined && original !== target) yield [original, target] as const;
  }
}
const outCounts = new Uint32Array(titles.length), inCounts = new Uint32Array(titles.length);
let edgeCount = 0;
for await (const [from, to] of edges()) { outCounts[from]++; inCounts[to]++; edgeCount++; }
if (edgeCount > 0xffffffff) throw new Error('Graph exceeds uint32 CSR capacity');
function offsets(counts: Uint32Array) {
  const result = new Uint32Array(counts.length + 1);
  for (let i = 0; i < counts.length; i++) result[i + 1] = result[i] + counts[i];
  return result;
}
const outOffsets = offsets(outCounts), inOffsets = offsets(inCounts);
const outTargets = new Uint32Array(edgeCount), inTargets = new Uint32Array(edgeCount);
const outCursor = outOffsets.slice(), inCursor = inOffsets.slice();
for await (const [from, to] of edges()) { outTargets[outCursor[from]++] = to; inTargets[inCursor[to]++] = from; }
for (let i = 0; i < titles.length; i++) { outTargets.subarray(outOffsets[i], outOffsets[i + 1]).sort(); inTargets.subarray(inOffsets[i], inOffsets[i + 1]).sort(); }
const bytes = encodeGraph({ metadata: { language: values.lang, titles, aliases }, outOffsets, outTargets, inOffsets, inTargets });
const compressed = gzipSync(bytes, { level: 9 });
const output = values.out ?? `public/graphs/${values.lang}.bin.gz`;
await mkdir(dirname(output), { recursive: true });
await writeFile(output, compressed);
console.log(JSON.stringify({ output, pages: titles.length, edges: edgeCount, bytes: bytes.length, gzipBytes: compressed.length }));
