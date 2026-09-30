/// <reference lib="webworker" />
import { bidirectionalBfs, type BfsResumeState, type SearchProgress, type SearchResult } from './bfs';
import { MultilingualLinkSource, articleKey } from './multilingualLinkSource';
import { ApiLinkSource } from './apiLinkSource';
import { LocalDatasetLinkSource } from './localLinkSource';
import { DEFAULT_LIMITS, type SearchLimits } from './searchLimits';

export type WorkerMessage =
  | { type: 'progress'; progress: SearchProgress }
  | { type: 'result'; result: SearchResult }
  | { type: 'error'; message: string };

export interface WorkerInput { from: string; to: string; lang: string; toLang?: string; multilingual?: boolean; limits?: SearchLimits; resumeState?: BfsResumeState }

self.onmessage = async (event: MessageEvent<WorkerInput>) => {
  const { from, to, lang, limits: requestedLimits = DEFAULT_LIMITS, resumeState, multilingual = false, toLang = lang } = event.data;
  const local = import.meta.env.VITE_LINK_SOURCE === 'local';
  const limits = local ? { ...requestedLimits, maxLinksPerPage: Number.MAX_SAFE_INTEGER, widening: [Number.MAX_SAFE_INTEGER] } : requestedLimits;
  const baseSource = import.meta.env.VITE_LINK_SOURCE === 'local'
    ? new LocalDatasetLinkSource()
    // Five search slots plus one suggestion slot keep the entire app at six.
    : new ApiLinkSource({ ...limits, concurrency: Math.min(5, limits.concurrency) });
  try {
    const source = multilingual ? new MultilingualLinkSource(baseSource, [...new Set([lang, toLang])]) : baseSource;
    const start = multilingual ? articleKey({ title: from, lang }) : from;
    const end = multilingual ? articleKey({ title: to, lang: toLang }) : to;
    const result = await bidirectionalBfs(source, resumeState?.start ?? start, resumeState?.end ?? end, lang, limits, progress => {
      self.postMessage({ type: 'progress', progress } satisfies WorkerMessage);
    }, { resumeState, onCandidate: candidate => self.postMessage({ type: 'result', result: candidate } satisfies WorkerMessage) });
    self.postMessage({ type: 'result', result } satisfies WorkerMessage);
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Неизвестная ошибка поиска' } satisfies WorkerMessage);
  }
};
