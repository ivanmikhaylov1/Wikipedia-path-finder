import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiLinkSource } from '../src/lib/apiLinkSource';
import { DEFAULT_LIMITS } from '../src/lib/searchLimits';
import { IDBFactory } from 'fake-indexeddb';

afterEach(() => vi.unstubAllGlobals());

describe('ApiLinkSource', () => {
  it('reads outlinks and byte size from a multi-title links|info request and caches them', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => ({
      ok: true, status: 200,
      json: async () => ({ query: { pages: [
        { title: 'A', ns: 0, length: 120, links: [{ title: 'B', ns: 0 }] },
        { title: 'B', ns: 0, length: 340, links: [{ title: 'C', ns: 0 }] },
      ] } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const source = new ApiLinkSource(DEFAULT_LIMITS);
    const batch = await source.getOutlinksBatch(['A', 'B'], 'ru', 50);
    expect(batch.get('A')).toEqual({ links: ['B'], sizeBytes: 120 });
    expect(batch.get('B')).toEqual({ links: ['C'], sizeBytes: 340 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('prop')).toBe('links|info');
    expect(url.searchParams.get('titles')).toBe('A|B');
    expect(await source.getOutlinks('A', 'ru', 50)).toEqual(['B']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips parenthetical and italic links in the first main-text paragraph', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ parse: { text: '<div class="mw-parser-output"><table><tr><td><a href="/wiki/Infobox">x</a></td></tr></table><p>(<a href="/wiki/Skipped">x</a>) <i><a href="/wiki/Italic">x</a></i> <a href="/wiki/Chosen" title="Chosen">chosen</a></p></div>' } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await new ApiLinkSource(DEFAULT_LIMITS).getFirstTextLink('A', 'en')).toBe('Chosen');
  });

  it('reuses a fresh IndexedDB entry across source instances', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    const fetchMock = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ query: { backlinks: [{ title: 'Source', ns: 0 }] } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await new ApiLinkSource(DEFAULT_LIMITS).getInlinks('Target', 'ru', 50)).toEqual(['Source']);
    expect(await new ApiLinkSource(DEFAULT_LIMITS).getInlinks('Target', 'ru', 50)).toEqual(['Source']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fills a second page when a hub occupies the first batched response', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const titles = new URL(String(input)).searchParams.get('titles');
      const response = titles === 'Hub|Small'
        ? { continue: { plcontinue: '1|0|Next', continue: '||info' }, query: { pages: [
          { title: 'Hub', ns: 0, length: 9000, links: Array.from({ length: 500 }, (_, i) => ({ title: `H${i}`, ns: 0 })) },
          { title: 'Small', ns: 0, length: 100 },
        ] } }
        : { query: { pages: [{ title: 'Small', ns: 0, length: 100, links: [{ title: 'Target', ns: 0 }] }] } };
      return { ok: true, status: 200, json: async () => response };
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await new ApiLinkSource(DEFAULT_LIMITS).getOutlinksBatch(['Hub', 'Small'], 'ru', 50);
    expect(result.get('Hub')?.links).toHaveLength(50);
    expect(result.get('Small')).toEqual({ links: ['Target'], sizeBytes: 100 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
