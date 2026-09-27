import { Activity, AlertCircle, Check, LoaderCircle } from 'lucide-react';
import type { SearchProgress, SearchResult } from '../lib/bfs';

const reasons = {
  depth: 'Путь не найден в пределах лимита глубины. Возможно, он длиннее.',
  budget: 'Путь не найден в пределах лимита поиска, но, возможно, существует более длинный.',
  timeout: 'Поиск достиг лимита времени. Попробуйте другую пару статей.',
  no_path: 'Путь между этими статьями не найден.',
};

export function ProgressIndicator({ searching, progress, result, candidate, error, canResume, onResume }: {
  searching: boolean; progress: SearchProgress | null; result: SearchResult | null;
  candidate: Extract<SearchResult, { status: 'found' }> | null;
  error: string; canResume: boolean; onResume: () => void;
}) {
  const found = result?.status === 'found' || Boolean(candidate);
  const detail = error || (result?.status === 'not_found' ? reasons[result.reason] : '');
  const quick = Boolean(candidate && result?.status !== 'found');
  return <section className="status-section page-width" aria-live="polite">
    <div className="status-top"><span><Activity size={16} /> 03 / СОСТОЯНИЕ ПОИСКА</span><span>LIVE STATUS</span></div>
    <div className={`status-panel ${searching ? 'is-searching' : ''} ${detail ? 'has-error' : ''}`}>
      <div className="status-icon">{searching ? <LoaderCircle className="spin" size={23} /> : found ? <Check size={23} /> : detail ? <AlertCircle size={23} /> : <span className="status-idle-dot" />}</div>
      <div className="status-message"><strong>{searching ? candidate ? 'Быстрый маршрут найден. Ищем короче…' : 'Ищем точку встречи…' : quick ? 'Быстрый маршрут найден' : found ? 'Маршрут построен' : detail ? 'Поиск завершён' : 'Готов к поиску'}</strong><p>{searching ? `Раунд ${progress?.round ?? 1} из ${progress?.roundCount ?? 3}, до ${progress?.linkCap ?? 50} ссылок на статью.` : quick ? 'Поиск кратчайшего маршрута пока не завершён.' : found ? 'Откройте любую статью из цепочки выше.' : detail || 'Введите две статьи и запустите поиск.'}</p>{canResume && !searching && <button type="button" className="resume-button" onClick={onResume}>{candidate ? 'ИСКАТЬ ТОЧНЕЕ' : 'ИСКАТЬ ДАЛЬШЕ'} →</button>}</div>
      <div className="status-stats"><div><span>ПРОВЕРЕНО СТАТЕЙ</span><strong>{progress?.visitedCount.toLocaleString('ru-RU') ?? '—'}</strong></div><div><span>ГЛУБИНА</span><strong>{progress?.depth ?? '—'}</strong></div></div>
    </div>
  </section>;
}
