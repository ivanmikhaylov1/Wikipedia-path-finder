import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProgressIndicator } from '../src/components/ProgressIndicator';
import { limitsHitFromReason } from '../src/lib/searchOutcome';
import { ThreadStage } from '../src/components/ThreadStage';

for (const reason of ['depth', 'requests', 'time', 'no_path'] as const) {
  for (const canResume of [true, false]) it(`${reason}, resume=${canResume}: explains the stop and offers available actions`, () => {
    const html = renderToStaticMarkup(<ProgressIndicator searching={false} phase="notFound" progress={null} result={null} candidate={null} error=""
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
it('notFound stage never invites input or claims an active search', () => {
  const html = renderToStaticMarkup(<ThreadStage notFound searchId={1} searching={false} path={null} progress={null} from="A" to="B" onLitCount={() => {}} onPhase={() => {}} />);
  expect(html).toContain('Путь не найден');
  expect(html).not.toContain('Введите две статьи');
  expect(html).not.toContain('Поиск распространяется');
});

it('maps algorithm reasons to UI reasons without changing BFS', () => {
  expect(['depth', 'budget', 'timeout', 'no_path'].map(reason => limitsHitFromReason(reason as import('../src/lib/bfs').NotFoundReason))).toEqual(['depth', 'requests', 'time', 'no_path']);
});
