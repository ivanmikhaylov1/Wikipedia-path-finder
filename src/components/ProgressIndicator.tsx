import type { SearchResult } from '../lib/bfs';
import type { ThreadProgress } from '../lib/bfs.worker';
import type { Phase } from '../lib/threadMotion';
export function ProgressIndicator({ searching, phase, progress, result, candidate, error, canResume, onResume }: {
  searching: boolean; phase: Phase; progress: ThreadProgress | null; result: SearchResult | null;
  candidate: Extract<SearchResult, { status: 'found' }> | null;
  error: string; canResume: boolean; onResume: () => void;
}) {
  const found = result?.status === 'found' || (!searching && Boolean(candidate) && !error);
  const missing = result?.status === 'not_found' && !found;
  return <section className="status-section page-width">
    <div className="sr-only" aria-live="polite" aria-atomic="true">{searching ? `Глубина ${progress?.depth ?? 0}, просмотрено ${progress?.visited ?? 0} статей.` : ''}</div>
    {(!searching && !found && !error) && <img className="empty-illustration" src={`${import.meta.env.BASE_URL}images/empty.webp`} alt={missing ? 'Нить обрывается у края созвездия; путь пока не найден.' : 'Нить выходит из созвездия и продолжается в свободное пространство.'} width="800" height="500" loading="lazy" decoding="async" />}
    <div className="status-message" aria-live="polite" aria-atomic="true"><strong>{searching ? candidate ? 'Есть быстрая цепочка. Ищем короче…' : 'Ищем точку встречи…' : error ? 'Поиск остановлен' : missing ? 'В пределах лимитов путь не найден.' : found ? phase === 'done' ? 'Нить найдена' : 'Связь найдена. Протягиваем нить…' : 'Две статьи. Одна нить.'}</strong>
      <p>{searching ? 'Поиск идёт от двух статей навстречу друг другу.' : error || (missing ? 'Путь может быть длиннее. Увеличьте глубину поиска или выберите другую пару статей.' : found ? 'Каждый переход — прямая ссылка в Википедии. Откройте статьи из цепочки.' : 'Назовите начало и конец — остальное свяжем.')}</p>
      {canResume && !searching && <button type="button" className="resume-button" onClick={onResume}>Искать глубже</button>}
    </div>
  </section>;
}
