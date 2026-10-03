import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Hero } from '../src/components/Hero';
import { PathSteps } from '../src/components/PathSteps';
import { PathVisualizer } from '../src/components/PathVisualizer';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('explains bounded search and language sections without promising reachability', () => {
  vi.stubGlobal('location', { search: '' });
  const html = renderToStaticMarkup(<Hero searching={false} error="" onSearch={() => {}} onCancel={() => {}} onValidationError={() => {}} />);
  expect(html).toContain('Найдите цепочку ссылок между двумя статьями');
  expect(html).toContain('путь есть не всегда, найденный не обязательно кратчайший');
  expect(html).toContain('ru.wikipedia.org');
  expect(html).toContain('en.wikipedia.org');
  expect(html).not.toContain('любыми');
});
it('marks only steps crossing language sections', () => {
  const html = renderToStaticMarkup(<PathSteps path={['["ru","A"]', '["ru","B"]', '["en","C"]']} lang="ru" multilingual litCount={3} />);
  expect(html.match(/межъязыковой переход/g)).toHaveLength(1);
  expect(html).toContain('https://en.wikipedia.org/wiki/C');
});
it('states the number of found steps without a shortest-path claim', () => {
  const html = renderToStaticMarkup(<PathVisualizer path={['A', 'B', 'C']} lang="ru" searchId={1} searching={false} progress={null} from="A" to="C" onPhase={() => {}} />);
  expect(html).toContain('Найден путь из 2 шагов');
});
it('uses the genitive singular for a one-step path', () => {
  const html = renderToStaticMarkup(<PathVisualizer path={['A', 'B']} lang="ru" searchId={1} searching={false} progress={null} from="A" to="B" onPhase={() => {}} />);
  expect(html).toContain('Найден путь из 1 шага');
});
it('explains sections in local mode without offering unavailable language search', () => {
  vi.stubGlobal('location', { search: '' }); vi.stubEnv('VITE_LINK_SOURCE', 'local');
  const html = renderToStaticMarkup(<Hero searching={false} error="" onSearch={() => {}} onCancel={() => {}} onValidationError={() => {}} />);
  expect(html).toContain('ru.wikipedia.org');
  expect(html).not.toContain('включите межъязыковой поиск');
});
