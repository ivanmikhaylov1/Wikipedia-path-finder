export interface LinkSource {
  getOutlinks(title: string, lang: string, cap?: number): Promise<string[]>;
  getInlinks(title: string, lang: string, cap?: number): Promise<string[]>;
  resolveRedirect(title: string, lang: string): Promise<string>;
  getOutlinksBatch?(titles: string[], lang: string, cap?: number): Promise<Map<string, { links: string[]; sizeBytes: number }>>;
  getInlinksBatch?(titles: string[], lang: string, cap?: number): Promise<Map<string, { links: string[]; sizeBytes: number }>>;
  getPageSizesBatch?(titles: string[], lang: string): Promise<Map<string, number>>;
  getFirstTextLink?(title: string, lang: string): Promise<string | null>;
  getRequestCount?(): number;
}

export class ArticleNotFoundError extends Error {
  constructor(title: string, lang: string) {
    super(`Статья «${title}» не найдена в ${lang}.wikipedia.org`);
    this.name = 'ArticleNotFoundError';
  }
}

export class RequestBudgetExceededError extends Error {
  constructor() {
    super('Исчерпан лимит запросов к Wikipedia API');
    this.name = 'RequestBudgetExceededError';
  }
}
