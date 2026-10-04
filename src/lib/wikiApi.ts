import { DEFAULT_LIMITS, type SearchLimits } from './searchLimits';
import { RequestBudgetExceededError, ImprovementLimitError, type QueryPurpose } from './linkSource';

export interface WikiPage { ns: number; title: string; pageid?: number; missing?: boolean; invalid?: boolean; links?: WikiPage[]; linkshere?: WikiPage[]; redirects?: WikiPage[]; langlinks?: Array<{ lang: string; title: string }>; length?: number }
export interface WikiResponse {
  continue?: Record<string, string>;
  error?: { code: string; info: string };
  query?: {
    pages?: WikiPage[];
    backlinks?: WikiPage[];
    search?: Array<{ title: string }>;
    normalized?: Array<{ from: string; to: string }>;
    redirects?: Array<{ from: string; to: string }>;
  };
  parse?: { text?: string };
}

function apiUrl(lang: string): string {
  if (!/^[a-z]{2,12}(?:-[a-z]{2,12})?$/.test(lang)) throw new Error('Некорректный код языка');
  return `https://${lang}.wikipedia.org/w/api.php`;
}

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export class ApiQueryError extends Error {
  constructor(public code: string, info: string) { super(`Wikipedia API: ${info}`); }
}
export class SearchDeadlineError extends Error {}

export class WikiApiClient {
  private active = 0;
  private waiters: Array<() => void> = [];
  private requestCount = 0;

  private deadline = Infinity;
  private requestLimit = Infinity;
  private controllers = new Map<AbortController, { expires: number; timer: ReturnType<typeof setTimeout> }>();
  constructor(private limits: SearchLimits = DEFAULT_LIMITS, private maxRequests = Infinity, private validationReserve = 0) {}

  getRequestCount(): number { return this.requestCount; }
  getRemainingRequests(): number { return Math.max(0, Math.min(this.maxRequests, this.requestLimit) - this.requestCount); }
  setRequestLimit(limit: number): void { this.requestLimit = Math.min(this.requestLimit, limit); }
  setDeadline(deadline: number): void {
    this.deadline = deadline;
    for (const [controller, active] of this.controllers) {
      clearTimeout(active.timer);
      active.timer = setTimeout(() => controller.abort(), Math.max(0, Math.min(active.expires, deadline) - Date.now()));
    }
  }

  private async slot(): Promise<() => void> {
    if (this.active >= Math.max(1, Math.min(6, this.limits.concurrency))) await new Promise<void>(resolve => this.waiters.push(resolve));
    else this.active++;
    return () => {
      const next = this.waiters.shift();
      if (next) next();
      else this.active--;
    };
  }

  async query(lang: string, params: Record<string, string>, purpose: QueryPurpose = 'explore'): Promise<WikiResponse> {
    const url = new URL(apiUrl(lang));
    for (const [key, value] of Object.entries({ action: 'query', format: 'json', formatversion: '2', origin: '*', ...params })) {
      url.searchParams.set(key, value);
    }

    for (let attempt = 0; attempt <= this.limits.retryAttempts; attempt++) {
      const release = await this.slot();
      let retryable = false;
      let retryAfter = 0;
      try {
        if (Date.now() >= this.deadline) throw new SearchDeadlineError('Время поиска закончилось');
        if (this.maxRequests - this.requestCount <= (purpose === 'explore' ? this.validationReserve : 0)) throw new RequestBudgetExceededError();
        if (this.requestCount >= this.requestLimit) throw new ImprovementLimitError('Лимит улучшения маршрута достигнут');
        this.requestCount++;
        const controller = new AbortController();
        const expires = Date.now() + this.limits.requestTimeout;
        this.controllers.set(controller, { expires, timer: setTimeout(() => controller.abort(), Math.max(0, Math.min(expires, this.deadline) - Date.now())) });
        try {
          const response = await fetch(url, { signal: controller.signal, headers: { 'Api-User-Agent': 'Perehody/1.0 (https://github.com/ivanmikhaylov1/Wikipedia-path-finder)' } });
          retryable = response.status === 429 || response.status >= 500;
          const header = response.headers?.get('Retry-After');
          if (header) retryAfter = /^\d+$/.test(header) ? Number(header) * 1000 : Math.max(0, Date.parse(header) - Date.now());
          if (!response.ok) throw new Error(`Wikipedia API: HTTP ${response.status}`);
          const data = await response.json() as WikiResponse;
          if (data.error) throw new ApiQueryError(data.error.code, data.error.info);
          return data;
        } finally {
          clearTimeout(this.controllers.get(controller)?.timer);
          this.controllers.delete(controller);
        }
      } catch (error) {
        if (Date.now() >= this.deadline) throw new SearchDeadlineError('Время поиска закончилось');
        if (!retryable || attempt === this.limits.retryAttempts) throw error;
      } finally {
        release();
      }
      await delay(Math.min(Math.max(350 * 2 ** attempt, retryAfter || 0), Math.max(0, this.deadline - Date.now())));
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
