export interface SearchLimits {
  improvementTimeout?: number;
  improvementMaxRequests?: number;
  maxDepth: number;
  maxLinksPerPage: number;
  maxTotalRequests: number;
  concurrency: number;
  requestTimeout: number;
  searchTimeout: number;
  retryAttempts: number;
  widening: number[];
  fallbackChainMaxSteps: number;
  fallbackTimeBudget: number;
}

export const DEFAULT_LIMITS: Readonly<SearchLimits> = Object.freeze({
  improvementTimeout: 8_000,
  improvementMaxRequests: 80,
  maxDepth: 6,
  maxLinksPerPage: 500,
  maxTotalRequests: 4000,
  concurrency: 6,
  requestTimeout: 10_000,
  searchTimeout: 90_000,
  retryAttempts: 2,
  widening: [50, 200, 500],
  fallbackChainMaxSteps: 30,
  fallbackTimeBudget: 12_000,
});
