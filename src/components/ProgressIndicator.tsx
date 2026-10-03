import type { SearchResult } from '../lib/bfs';
import type { ThreadProgress } from '../lib/bfs.worker';
import { stopExplanation, type NotFoundState } from '../lib/searchOutcome';
import type { Phase } from '../lib/threadMotion';
export function ProgressIndicator({ searching, phase, progress, result, candidate, error, canResume, onResume, notFound, onEdit, onSwap }: {
  searching: boolean; phase: Phase; progress: ThreadProgress | null; result: SearchResult | null;
  candidate: Extract<SearchResult, { status: 'found' }> | null;
  notFound?: NotFoundState | null; onEdit?: () => void; onSwap?: () => void;
  error: string; canResume: boolean; onResume: () => void;
}) {
  const found = result?.status === 'found' || (!searching && Boolean(candidate) && !error);
  const missing = notFound && !searching && !found && !error;
  const resumable = missing && canResume && notFound.limitsHit !== 'no_path';
  return <section className="status-section page-width">
    <div className="sr-only" aria-live="polite" aria-atomic="true">{searching ? `Глубина ${progress?.depth ?? 0}, просмотрено ${progress?.visited ?? 0} статей.` : ''}</div>
    {(!searching && !found && !error) && <img className="empty-illustration" src={`${import.meta.env.BASE_URL}images/empty.webp`} alt={missing ? 'Путь не найден' : 'Нить выходит из созвездия и продолжается в свободное пространство.'} width="800" height="500" loading="lazy" decoding="async" />}
    <div className="status-message" aria-live="polite" aria-atomic="true"><strong>{searching ? candidate ? 'Есть быстрая цепочка. Ищем короче…' : 'Ищем точку встречи…' : error ? 'Поиск остановлен' : missing ? 'Путь не найден' : found ? phase === 'done' ? 'Нить найдена' : 'Связь найдена. Протягиваем нить…' : 'Две статьи. Одна нить.'}</strong>
      <p>{searching ? 'Поиск идёт от двух статей навстречу друг другу.' : error || (missing ? `Проверено статей: ${notFound.visited}. Достигнутая глубина: ${notFound.depth}. ${stopExplanation[notFound.limitsHit]}` : found ? 'Внутри одного раздела шаг — гиперссылка; между разделами — переход к языковой версии статьи. Откройте статьи из цепочки.' : 'Назовите начало и конец — остальное свяжем.')}</p>
      {resumable && <button type="button" className="resume-button" onClick={onResume}>Искать глубже</button>}
      {missing && !resumable && <div className="recovery-actions">
        <button type="button" className="resume-button" onClick={onEdit}>Изменить статьи</button>
        <button type="button" className="resume-button" onClick={onSwap}>Поменять местами</button>
      </div>}
    </div>
  </section>;
}
