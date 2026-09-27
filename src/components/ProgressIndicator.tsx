import { Activity, AlertCircle, Check, LoaderCircle } from 'lucide-react';
import type { SearchProgress, SearchResult } from '../lib/bfs';

const reasons = {
  depth: 'Путь не найден в пределах лимита глубины. Возможно, он длиннее.',
  budget: 'Путь не найден в пределах лимита поиска, но, возможно, существует более длинный.',
  timeout: 'Поиск достиг лимита времени. Попробуйте другую пару статей.',
  no_path: 'Путь между этими статьями не найден.',
};

export function ProgressIndicator({ searching, progress, result, error }: {
  searching: boolean; progress: SearchProgress | null; result: SearchResult | null; error: string;
}) {
  const found = result && 'path' in result;
  const detail = error || (result && 'notFound' in result ? reasons[result.reason] : '');
  return <section className="status-section page-width" aria-live="polite">
    <div className="status-top"><span><Activity size={16} /> 03 / СОСТОЯНИЕ ПОИСКА</span><span>LIVE STATUS</span></div>
    <div className={`status-panel ${searching ? 'is-searching' : ''} ${detail ? 'has-error' : ''}`}>
      <div className="status-icon">{searching ? <LoaderCircle className="spin" size={23} /> : found ? <Check size={23} /> : detail ? <AlertCircle size={23} /> : <span className="status-idle-dot" />}</div>
      <div className="status-message"><strong>{searching ? 'Ищем точку встречи…' : found ? 'Маршрут построен' : detail ? 'Поиск завершён' : 'Готов к поиску'}</strong><p>{searching ? 'Два фронта движутся навстречу друг другу по ссылкам.' : found ? 'Откройте любую статью из цепочки выше.' : detail || 'Введите две статьи и запустите поиск.'}</p></div>
      <div className="status-stats"><div><span>ПРОВЕРЕНО СТАТЕЙ</span><strong>{progress?.visitedCount.toLocaleString('ru-RU') ?? '—'}</strong></div><div><span>ГЛУБИНА</span><strong>{progress?.depth ?? '—'}</strong></div></div>
    </div>
  </section>;
}
