import type { CSSProperties } from 'react';
import type { ThreadProgress } from '../lib/bfs.worker';
import { articleFromKey } from '../lib/multilingualLinkSource';

export interface CollisionStageProps {
  searching: boolean; searchId: number; progress: ThreadProgress | null;
}

function sampleTitle(value: string) {
  try { return articleFromKey(value).title; }
  catch { return value; }
}

/** Printed fragments are observations from the worker, never a proposed route. */
export function CollisionStage({ searching, searchId, progress }: CollisionStageProps) {
  if (!searching) return null;
  return <div className="collision-stage" key={searchId}>
    <div className="search-fragments" aria-hidden="true">
      {progress?.sampleTitles?.map((title, index) => <span className="search-fragment" key={`${index}:${title}`} style={{ '--fragment': index } as CSSProperties}>{sampleTitle(title)}</span>)}
    </div>
    <p className="search-counts">
      <span>Проверено статей: {progress?.visited ?? 0}</span>
      <span>Глубина: {progress?.depth ?? 0}</span>
      <span>Со стороны начала: {progress?.frontierA ?? 0}</span>
      <span>Со стороны конца: {progress?.frontierB ?? 0}</span>
    </p>
  </div>;
}
