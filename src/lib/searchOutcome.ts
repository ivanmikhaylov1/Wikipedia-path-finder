import type { NotFoundReason } from './bfs';
export type LimitsHit = 'depth' | 'requests' | 'time' | 'no_path';
export interface NotFoundState { limitsHit: LimitsHit; visited: number; depth: number }
export const limitsHitFromReason = (reason: NotFoundReason): LimitsHit =>
  reason === 'budget' ? 'requests' : reason === 'timeout' ? 'time' : reason;
export const stopExplanation: Record<LimitsHit, string> = {
  depth: 'Достигнут предел глубины поиска.',
  requests: 'Исчерпан лимит запросов к Википедии.',
  time: 'Истекло время поиска.',
  no_path: 'Доступные связи проверены; путь не найден в исследованном графе.',
};

export const stopHeading: Record<LimitsHit,string> = {
  time: 'Не удалось найти маршрут за отведённое время',
  requests: 'Поиск достиг лимита запросов',
  depth: 'Поиск достиг предела глубины',
  no_path: 'Путь не найден в исследованном графе',
};
