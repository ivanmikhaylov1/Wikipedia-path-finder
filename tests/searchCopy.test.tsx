import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CollisionSpread } from '../src/components/CollisionSpread';
import { RouteRibbon } from '../src/components/RouteRibbon';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('explains bounded search and language sections without promising reachability', () => {
  vi.stubGlobal('location', { search: '' });
  const html = renderToStaticMarkup(<CollisionSpread searchId={0} progress={null} canResume={false} onResume={() => {}} searching={false} error="" onSearch={() => {}} onCancel={() => {}} onValidationError={() => {}} />);
  expect(html).toContain('Найдите цепочку ссылок между двумя статьями');
  expect(html).toContain('путь есть не всегда, найденный не обязательно кратчайший');
  expect(html).toContain('Раздел Википедии RU');
  expect(html).toContain('Раздел Википедии EN');
  expect(html).not.toContain('любыми');
});
it('marks only steps crossing language sections', () => {
  const html = renderToStaticMarkup(<RouteRibbon path={['["ru","A"]', '["ru","B"]', '["en","C"]']} lang="ru" multilingual onNewPair={() => {}} onShare={() => {}} shareStatus="" />);
  expect(html.match(/смена языка/g)).toHaveLength(1);
  expect(html).toContain('https://en.wikipedia.org/wiki/C');
});
it('states the number of found steps without a shortest-path claim', () => {
  const html = renderToStaticMarkup(<RouteRibbon path={['A', 'B', 'C']} lang="ru" multilingual={false} onNewPair={() => {}} onShare={() => {}} shareStatus="" />);
  expect(html).toContain('2 перехода / 3 статьи');
});
it('uses the singular for a one-step path', () => {
  const html = renderToStaticMarkup(<RouteRibbon path={['A', 'B']} lang="ru" multilingual={false} onNewPair={() => {}} onShare={() => {}} shareStatus="" />);
  expect(html).toContain('1 переход / 2 статьи');
});
it('explains sections in local mode without offering unavailable language search', () => {
  vi.stubGlobal('location', { search: '' }); vi.stubEnv('VITE_LINK_SOURCE', 'local');
  const html = renderToStaticMarkup(<CollisionSpread searchId={0} progress={null} canResume={false} onResume={() => {}} searching={false} error="" onSearch={() => {}} onCancel={() => {}} onValidationError={() => {}} />);
  expect(html).toContain('Локальный граф: раздел RU');
  expect(html).not.toContain('включите межъязыковой поиск');
});
