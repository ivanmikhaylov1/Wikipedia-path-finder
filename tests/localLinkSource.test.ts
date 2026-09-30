import { afterEach, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { decodeGraph } from '../src/lib/graphFormat';
import { LocalDatasetLinkSource } from '../src/lib/localLinkSource';
import { bidirectionalBfs } from '../src/lib/bfs';
import { DEFAULT_LIMITS } from '../src/lib/searchLimits';
import { tuples } from '../scripts/sqlDump';

afterEach(() => vi.unstubAllGlobals());

it('builds a modern gzip SQL snapshot and searches static CSR without Wikipedia requests', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'perehody-graph-'));
  try {
    const output = join(dir, 'en.bin.gz');
    const page = join(dir, 'page.sql.gz');
    writeFileSync(page, gzipSync(readFileSync('tests/fixtures/page.sql')));
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/build-graph.ts', '--lang', 'en', '--page', page, '--pagelinks', 'tests/fixtures/pagelinks.sql', '--linktarget', 'tests/fixtures/linktarget.sql', '--redirect', 'tests/fixtures/redirect.sql', '--out', output]);
    const bytes = readFileSync(output);
    const graph = decodeGraph(new Uint8Array(gunzipSync(bytes)));
    expect(graph.metadata.titles).toContain("Quoted's (page)");
    const fetchMock = vi.fn(async (url: string) => { expect(url).toBe('/graphs/en.bin.gz'); return new Response(bytes); });
    vi.stubGlobal('fetch', fetchMock);
    const source = new LocalDatasetLinkSource('/graphs/');
    expect(await source.resolveRedirect('alias', 'en')).toBe('D');
    expect(await source.getInlinks('D', 'en')).toEqual(['B', 'C']);
    const result = await bidirectionalBfs(source, 'A', 'D', 'en', { ...DEFAULT_LIMITS, maxLinksPerPage: Number.MAX_SAFE_INTEGER, widening: [Number.MAX_SAFE_INTEGER] });
    expect(result).toEqual({ status: 'found', path: ['A', 'B', 'D'], exact: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(source.getRequestCount()).toBe(0);
    await expect(source.resolveRedirect('Missing', 'en')).rejects.toThrow('не найдена');
    expect(bytes.length).toBeLessThan(gunzipSync(bytes).length);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it('supports legacy pagelinks without linktarget', () => {
  const dir = mkdtempSync(join(tmpdir(), 'perehody-legacy-'));
  try {
    const links = join(dir, 'links.sql');
    const out = join(dir, 'en.bin.gz');
    writeFileSync(links, "CREATE TABLE `pagelinks` (\n  `pl_from` int,\n  `pl_namespace` int,\n  `pl_title` text\n);\nINSERT INTO `pagelinks` VALUES (1,0,'D');\n");
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/build-graph.ts', '--lang', 'en', '--page', 'tests/fixtures/page.sql', '--pagelinks', links, '--out', out]);
    expect(decodeGraph(new Uint8Array(gunzipSync(readFileSync(out)))).outTargets).toEqual(new Uint32Array([3]));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it('rejects modern pagelinks without the linktarget dump', () => {
  expect(() => execFileSync(process.execPath, ['--import', 'tsx', 'scripts/build-graph.ts', '--lang', 'en', '--page', 'tests/fixtures/page.sql', '--pagelinks', 'tests/fixtures/pagelinks.sql'], { stdio: 'pipe' })).toThrow();
});

it('parses punctuation, escapes, NULL, and doubled apostrophes in SQL literals', () => {
  expect([...tuples("(1,'a,b(c)\\\'d',NULL),(2,'x''y\\n',0);")]).toEqual([[1, "a,b(c)'d", null], [2, "x'y\n", 0]]);
});

it('rejects malformed or truncated graph bytes', () => {
  expect(() => decodeGraph(new Uint8Array(4))).toThrow('заголовок');
  expect(() => decodeGraph(new Uint8Array(20))).toThrow('формат');
});
