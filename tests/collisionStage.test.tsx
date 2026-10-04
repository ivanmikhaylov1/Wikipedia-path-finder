import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CollisionStage } from '../src/components/CollisionStage';

const progress = { depth: 3, visited: 127, frontierA: 11, frontierB: 9, sampleTitles: ['Моллюски', 'Architecture'] };
it('shows supplied sample titles and exact progress while searching', () => {
  const html = renderToStaticMarkup(<CollisionStage searching searchId={1} progress={progress} />);
  expect(html).toContain('Моллюски');
  expect(html).toContain('Architecture');
  expect(html).toContain('Проверено статей: 127');
  expect(html).toContain('Глубина: 3');
  expect(html).toContain('Со стороны начала: 11');
  expect(html).toContain('Со стороны конца: 9');
});
it('never carries old samples or fabricated paths into idle and end states', () => {
  const html = renderToStaticMarkup(<CollisionStage searching={false} searchId={2} progress={progress} />);
  expect(html).not.toContain('Моллюски');
  expect(html).not.toContain('Architecture');
  expect(html).not.toContain('<a');
  expect(html).not.toContain('Проверено');
});
it('does not invent sample titles before the worker supplies them', () => {
  const html = renderToStaticMarkup(<CollisionStage searching searchId={1} progress={null} />);
  expect(html).not.toContain('Моллюски');
  expect(html).toContain('Проверено статей: 0');
  expect(html).not.toContain('кратчайший');
});
it('prints a multilingual worker key as its actual article title', () => {
  const html = renderToStaticMarkup(<CollisionStage searching searchId={3} progress={{ ...progress, sampleTitles: ['["en","Architecture"]'] }} />);
  expect(html).toContain('>Architecture</span>');
  expect(html).not.toContain('&quot;');
});


it('keeps rapidly changing counts outside live regions', () => {
  const html = renderToStaticMarkup(<CollisionStage searching searchId={1} progress={progress} />);
  expect(html).not.toContain('role="status"');
  expect(html).not.toContain('aria-live');
});
