import { useEffect, useRef, useState } from 'react';
import type { ThreadProgress } from '../lib/bfs.worker';
import { stopExplanation, stopHeading, type NotFoundState } from '../lib/searchOutcome';

export interface SearchStatusProps {
  progress?: ThreadProgress | null; searching: boolean; error: string; notFound?: NotFoundState | null;
  canResume: boolean; onResume: () => void; onEdit?: () => void; onSwap?: () => void;
}

/** Owns runtime error announcements; field validation stays in SearchForm. */
export function SearchStatus({ searching, error, notFound, canResume, onResume, onEdit, onSwap, progress }: SearchStatusProps) {
  const latestProgress = useRef(progress);
  latestProgress.current = progress;
  const [summary, setSummary] = useState('');
  useEffect(() => {
    setSummary('');
    if (!searching) return;
    const timer = window.setInterval(() => {
      const current = latestProgress.current;
      if (current) setSummary(`Обнаружено статей: ${current.visited}. Глубина: ${current.depth}.`);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [searching]);
  const missing = !searching && !error && notFound;
  const resumable = missing && canResume && missing.limitsHit !== 'no_path';
  return <section className={`search-status${!searching && !error && !notFound ? ' is-empty' : ''}`}>
    <div role="status" aria-atomic="true">
      {searching ? <><h2>Ищем связь</h2><p>{summary || 'Проверяем ссылки выбранных статей.'}</p></>
        : missing ? <><h2>{stopHeading[missing.limitsHit]}</h2><p>{`Обнаружено статей: ${missing.visited}. Достигнутая глубина: ${missing.depth}. ${stopExplanation[missing.limitsHit]}`}</p></> : null}
    </div>
    <div role="alert" aria-atomic="true">
      {!searching && error ? <><h2>Поиск остановлен</h2><p>{error}</p></> : null}
    </div>
    {resumable && <button className="recovery-button" type="button" onClick={onResume}>Искать глубже</button>}
    {!searching && (error || missing) && !resumable && <div className="recovery-actions">
      {onEdit && <button className="recovery-button" type="button" onClick={onEdit}>Изменить статьи</button>}
      {onSwap && <button className="recovery-button" type="button" onClick={onSwap}>Поменять местами</button>}
    </div>}
  </section>;
}
