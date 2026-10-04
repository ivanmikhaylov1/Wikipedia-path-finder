export interface LinkSource {
  getOutlinks(title: string, lang: string, cap?: number): Promise<string[]>;
  getInlinks(title: string, lang: string, cap?: number): Promise<string[]>;
  resolveRedirect(title: string, lang: string): Promise<string>;
  getOutlinksBatch?(titles: string[], lang: string, cap?: number): Promise<Map<string, { links: string[]; sizeBytes: number }>>;
  getInlinksBatch?(titles: string[], lang: string, cap?: number): Promise<Map<string, { links: string[]; sizeBytes: number }>>;
  getPageSizesBatch?(titles: string[], lang: string): Promise<Map<string, number>>;
  getFirstTextLink?(title: string, lang: string): Promise<string | null>;
  getLanglinks?(title: string, lang: string): Promise<Array<{ title: string; lang: string }>>;
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

export type LinkDirection = 'out' | 'in';
export type QueryPurpose = 'explore' | 'validate';
export interface CanonicalArticle { lang: string; title: string; pageId?: number }
export interface LinkEvidence { from: CanonicalArticle; to: CanonicalArticle; rawTarget: string; fresh: boolean }
export interface LinkPage { edges: LinkEvidence[]; complete: boolean; cursor?: Record<string, string>; invalidatedEdges?: LinkEvidence[] }
export interface AnytimeLinkSource extends LinkSource {
  readonly forwardOnly?: boolean;
  canonicalize(titles: string[], lang: string, purpose?: QueryPurpose): Promise<Map<string, CanonicalArticle | null>>;
  readLinkPage(article: CanonicalArticle, direction: LinkDirection, purpose?: QueryPurpose): Promise<LinkPage>;
  probeLinks(from: CanonicalArticle[], to: CanonicalArticle[], purpose?: QueryPurpose): Promise<LinkEvidence[]>;
  probeLinkPage?(from: CanonicalArticle[], to: CanonicalArticle[], cursor?: Record<string, string>, purpose?: QueryPurpose): Promise<LinkPage>;
  validateEdges(edges: LinkEvidence[], onInvalid?: (edge: LinkEvidence) => void): Promise<boolean>;
  getRemainingRequests(): number;
  setDeadline(deadline: number): void;
}
export const articleIdentity = (article: CanonicalArticle) => JSON.stringify([article.lang, article.title]);
