import { DEFAULT_LIMITS, type SearchLimits } from './searchLimits';
import { RequestBudgetExceededError } from './linkSource';

export interface WikiPage { ns: number; title: string; missing?: boolean; links?: WikiPage[] }
export interface WikiResponse {
  continue?: Record<string, string>;
  error?: { code: string; info: string };
  query?: {
    pages?: WikiPage[];
    backlinks?: WikiPage[];
    search?: Array<{ title: string }>;
  };
}

function apiUrl(lang: string): string {
  if (!/^[a-z]{2,12}(?:-[a-z]{2,12})?$/.test(lang)) throw new Error('Некорректный код языка');
  return `https://${lang}.wikipedia.org/w/api.php`;
}

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export class WikiApiClient {
  private active = 0;
  private waiters: Array<() => void> = [];
  private requestCount = 0;

  constructor(private limits: SearchLimits = DEFAULT_LIMITS, private maxRequests = Infinity) {}

  private async slot(): Promise<() => void> {
    if (this.active >= this.limits.concurrency) await new Promise<void>(resolve => this.waiters.push(resolve));
    else this.active++;
    return () => {
      const next = this.waiters.shift();
      if (next) next();
      else this.active--;
    };
  }

  async query(lang: string, params: Record<string, string>): Promise<WikiResponse> {
    const url = new URL(apiUrl(lang));
    for (const [key, value] of Object.entries({ action: 'query', format: 'json', formatversion: '2', origin: '*', ...params })) {
      url.searchParams.set(key, value);
    }

    for (let attempt = 0; attempt <= this.limits.retryAttempts; attempt++) {
      const release = await this.slot();
      let retryable = false;
      try {
        if (this.requestCount >= this.maxRequests) throw new RequestBudgetExceededError();
        this.requestCount++;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.limits.requestTimeout);
        try {
          const response = await fetch(url, { signal: controller.signal });
          retryable = response.status === 429 || response.status >= 500;
          if (!response.ok) throw new Error(`Wikipedia API: HTTP ${response.status}`);
          const data = await response.json() as WikiResponse;
          if (data.error) throw new Error(`Wikipedia API: ${data.error.info}`);
          return data;
        } finally {
          clearTimeout(timer);
        }
      } catch (error) {
        if (!retryable || attempt === this.limits.retryAttempts) throw error;
      } finally {
        release();
      }
      await delay(350 * 2 ** attempt);
    }
    throw new Error('Wikipedia API недоступен');
  }

  async suggest(text: string, lang: string): Promise<string[]> {
    if (!text.trim()) return [];
    const data = await this.query(lang, {
      list: 'search', srsearch: text.trim(), srnamespace: '0', srlimit: '6',
    });
    return data.query?.search?.map(item => item.title) ?? [];
  }
}
