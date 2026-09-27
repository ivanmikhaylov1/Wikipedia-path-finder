export interface LinkSource {
  getOutlinks(title: string, lang: string): Promise<string[]>;
  getInlinks(title: string, lang: string): Promise<string[]>;
  resolveRedirect(title: string, lang: string): Promise<string>;
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
