/// <reference lib="webworker" />
import { bidirectionalBfs, type BfsResumeState, type SearchProgress, type SearchResult } from './bfs';
import { ApiLinkSource } from './apiLinkSource';
import { LocalDatasetLinkSource } from './localLinkSource';
import { DEFAULT_LIMITS, type SearchLimits } from './searchLimits';

export type WorkerMessage =
  | { type: 'progress'; progress: SearchProgress }
  | { type: 'result'; result: SearchResult }
  | { type: 'error'; message: string };

export interface WorkerInput { from: string; to: string; lang: string; limits?: SearchLimits; resumeState?: BfsResumeState }

self.onmessage = async (event: MessageEvent<WorkerInput>) => {
  const { from, to, lang, limits = DEFAULT_LIMITS, resumeState } = event.data;
  const source = import.meta.env.VITE_LINK_SOURCE === 'local'
    ? new LocalDatasetLinkSource()
    : new ApiLinkSource(limits);
  try {
    const result = await bidirectionalBfs(source, resumeState?.start ?? from, resumeState?.end ?? to, lang, limits, progress => {
      self.postMessage({ type: 'progress', progress } satisfies WorkerMessage);
    }, { resumeState, onCandidate: candidate => self.postMessage({ type: 'result', result: candidate } satisfies WorkerMessage) });
    self.postMessage({ type: 'result', result } satisfies WorkerMessage);
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Неизвестная ошибка поиска' } satisfies WorkerMessage);
  }
};
