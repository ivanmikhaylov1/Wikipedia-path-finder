import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchStatus } from '../src/components/SearchStatus';
import { limitsHitFromReason } from '../src/lib/searchOutcome';

for (const reason of ['depth', 'requests', 'time', 'no_path'] as const) {
  for (const canResume of [true, false]) it(`${reason}, resume=${canResume}: explains the stop and offers available actions`, () => {
    const html = renderToStaticMarkup(<SearchStatus searching={false} error=""
      notFound={{ limitsHit: reason, visited: 42, depth: 6 }} canResume={canResume} onResume={() => {}} onEdit={() => {}} onSwap={() => {}} />);
    expect(html).toContain('Путь не найден');
    expect(html).toContain('Проверено статей: 42. Достигнутая глубина: 6.');
    expect(html).toContain({ depth: 'Достигнут предел глубины', requests: 'Исчерпан лимит запросов', time: 'Истекло время поиска', no_path: 'Доступные связи проверены' }[reason]);
    expect(html).not.toContain('Назовите начало');
    if (canResume && reason !== 'no_path') {
      expect(html).toContain('Искать глубже');
      expect(html).not.toContain('Изменить статьи');
    } else {
      expect(html).not.toContain('Искать глубже');
      expect(html).not.toContain('Увеличьте');
      expect(html).toContain('Изменить статьи');
      expect(html).toContain('Поменять местами');
    }
  });
}
it('does not render unavailable recovery controls', () => {
  const html = renderToStaticMarkup(<SearchStatus searching={false} error="" notFound={{ limitsHit: 'no_path', visited: 5, depth: 1 }} canResume={false} onResume={() => {}} />);
  expect(html).not.toContain('<button');
});
it('owns one runtime error announcement and hides stale notFound state', () => {
  const html = renderToStaticMarkup(<SearchStatus searching={false} error="Сеть недоступна" notFound={{ limitsHit: 'depth', visited: 5, depth: 1 }} canResume onResume={() => {}} onEdit={() => {}} />);
  expect(html.match(/role="alert"/g)).toHaveLength(1);
  expect(html).toContain('Сеть недоступна');
  expect(html).not.toContain('Путь не найден');
  expect(html).not.toContain('Искать глубже');
  expect(html).toContain('Изменить статьи');
});
it('idle and active status do not promise a path', () => {
  const idle = renderToStaticMarkup(<SearchStatus searching={false} error="" canResume={false} onResume={() => {}} />);
  expect(idle).toContain('is-empty');
  expect(idle).not.toContain('hidden=');
  expect(idle).not.toContain('<h2>');
  const active = renderToStaticMarkup(<SearchStatus searching error="" canResume={false} onResume={() => {}} />);
  expect(active).toContain('Ищем связь');
  expect(active).not.toMatch(/кратчайший|обязательно найд/);
});

it('maps algorithm reasons to UI reasons without changing BFS', () => {
  expect(['depth', 'budget', 'timeout', 'no_path'].map(reason => limitsHitFromReason(reason as import('../src/lib/bfs').NotFoundReason))).toEqual(['depth', 'requests', 'time', 'no_path']);
});
