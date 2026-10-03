import { stopExplanation, type NotFoundState } from '../lib/searchOutcome';

export interface SearchStatusProps {
  searching: boolean; error: string; notFound?: NotFoundState | null;
  canResume: boolean; onResume: () => void; onEdit?: () => void; onSwap?: () => void;
}

/** Owns runtime error announcements; field validation stays in SearchForm. */
export function SearchStatus({ searching, error, notFound, canResume, onResume, onEdit, onSwap }: SearchStatusProps) {
  if (!searching && !error && !notFound) return null;
  const missing = !searching && !error && notFound;
  const resumable = missing && canResume && missing.limitsHit !== 'no_path';
  return <section className="search-status">
    <div role={error && !searching ? 'alert' : 'status'} aria-atomic="true">
      <h2>{searching ? 'Ищем связь' : error ? 'Поиск остановлен' : 'Путь не найден'}</h2>
      <p>{searching ? 'Проверяем ссылки выбранных статей.' : error || (missing ? `Проверено статей: ${missing.visited}. Достигнутая глубина: ${missing.depth}. ${stopExplanation[missing.limitsHit]}` : '')}</p>
    </div>
    {resumable && <button className="recovery-button" type="button" onClick={onResume}>Искать глубже</button>}
    {!searching && !resumable && <div className="recovery-actions">
      {onEdit && <button className="recovery-button" type="button" onClick={onEdit}>Изменить статьи</button>}
      {onSwap && <button className="recovery-button" type="button" onClick={onSwap}>Поменять местами</button>}
    </div>}
  </section>;
}
