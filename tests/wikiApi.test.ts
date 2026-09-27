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
