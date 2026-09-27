export interface SearchLimits {
  maxDepth: number;
  maxLinksPerPage: number;
  maxTotalRequests: number;
  concurrency: number;
  requestTimeout: number;
  searchTimeout: number;
  retryAttempts: number;
}

export const DEFAULT_LIMITS: Readonly<SearchLimits> = Object.freeze({
  maxDepth: 6,
  maxLinksPerPage: 500,
  maxTotalRequests: 1500,
  concurrency: 6,
  requestTimeout: 10_000,
  searchTimeout: 45_000,
  retryAttempts: 2,
});
