import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestBudgetExceededError } from '../src/lib/linkSource';
import { DEFAULT_LIMITS } from '../src/lib/searchLimits';
import { WikiApiClient } from '../src/lib/wikiApi';

afterEach(() => vi.unstubAllGlobals());

describe('WikiApiClient request budget', () => {
  it('counts successful HTTP calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ query: {} }) });
    vi.stubGlobal('fetch', fetchMock);
    const client = new WikiApiClient(DEFAULT_LIMITS, 1);
    await client.query('ru', { titles: 'Москва' });
    await expect(client.query('ru', { titles: 'Казань' })).rejects.toBeInstanceOf(RequestBudgetExceededError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('counts failed attempts before retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    vi.stubGlobal('fetch', fetchMock);
    const client = new WikiApiClient({ ...DEFAULT_LIMITS, retryAttempts: 2 }, 1);
    await expect(client.query('ru', { titles: 'Москва' })).rejects.toBeInstanceOf(RequestBudgetExceededError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

it('clamps transport concurrency to six and sends the application identity', async () => {
  let active = 0, peak = 0;
  const fetchMock = vi.fn(async (_url: URL, init: RequestInit) => {
    expect((init.headers as Record<string, string>)['Api-User-Agent']).toContain('Perehody/1.0');
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return { ok: true, status: 200, json: async () => ({ query: {} }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  const client = new WikiApiClient({ ...DEFAULT_LIMITS, concurrency: 99 });
  await Promise.all(Array.from({ length: 18 }, (_, i) => client.query('en', { titles: String(i) })));
  expect(peak).toBe(6);
  expect(client.getRequestCount()).toBe(18);
});

it('retries a server error successfully and counts both attempts', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ query: {} }) });
  vi.stubGlobal('fetch', fetchMock);
  const client = new WikiApiClient(DEFAULT_LIMITS, 2);
  await expect(client.query('en', { titles: 'A' })).resolves.toEqual({ query: {} });
  expect(client.getRequestCount()).toBe(2);
});
it('caps queued requests when the background-improvement allowance is reduced', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ query: {} }) })));
  const client = new WikiApiClient(DEFAULT_LIMITS, 100);
  client.setRequestLimit(2);
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => client.query('en', { titles: 'A' })));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(2);
  expect(client.getRequestCount()).toBe(2);
});
