import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { afterEach, expect, it, vi } from 'vitest';
import { RouteRibbon } from '../src/components/RouteRibbon';
import { routeArticles, routeConnectors } from '../src/lib/routeRibbon';

const path = ['Осьминоги', 'Моллюски', 'Биология', 'Искусство', 'Art', 'Bauhaus'];
const multiPath = path.map((title, i) => JSON.stringify([i < 4 ? 'ru' : 'en', title]));
const props = { path: multiPath, lang: 'ru', multilingual: true, onNewPair() {}, onShare() {}, shareStatus: '' };
function markup(options = {}) { return parseHTML(renderToStaticMarkup(<RouteRibbon {...props} {...options} />)).document; }

it('keeps route order in one ordered list while assigning serpentine desktop positions', () => {
  const doc = markup();
  expect(doc.querySelectorAll('ol')).toHaveLength(1);
  expect(Array.from(doc.querySelectorAll('ol a')).map(a => a.textContent?.replace(' ↗', ''))).toEqual(path);
  expect(routeArticles(multiPath, 'ru', true).map(({ number, row, column }) => [number, row, column])).toEqual([
    [1, 0, 0], [2, 0, 1], [3, 0, 2], [4, 1, 2], [5, 1, 1], [6, 1, 0],
  ]);
});
it('encodes article titles without letting punctuation or language escape the Wikipedia URL', () => {
  const nodes = routeArticles(['["pt-br","A/B #?&"]'], 'ru', true);
  expect(nodes[0].href).toBe('https://pt-br.wikipedia.org/wiki/A%2FB_%23%3F%26');
  expect(() => routeArticles(['["en.example.org/","X"]'], 'ru', true)).toThrow();
  expect(routeArticles(['A B'], 'de', false)[0].href).toBe('https://de.wikipedia.org/wiki/A_B');
});
it('labels only language changes and counts actual edges', () => {
  const doc = markup();
  expect(Array.from(doc.querySelectorAll('.route-language-turn')).map(el => el.textContent)).toEqual(['RU → EN / смена языка']);
  expect(doc.querySelector('.route-counts')?.textContent).toContain('5 переходов / 6 статей');
  const same = markup({ path: ['Осьминоги'], multilingual: false });
  expect(same.querySelector('.route-counts')?.textContent).toContain('0 переходов / 1 статья');
  expect(same.querySelectorAll('ol a')).toHaveLength(1);
  expect(same.querySelectorAll('svg path')).toHaveLength(0);
});
it('retains all thirteen articles exactly once', () => {
  const titles = Array.from({ length: 13 }, (_, i) => `Article ${i + 1}`);
  const doc = markup({ path: titles, multilingual: false });
  expect(Array.from(doc.querySelectorAll('ol a')).map(a => a.textContent?.replace(' ↗', ''))).toEqual(titles);
});
it('joins every consecutive pair through both desktop row turns and only dashes language changes', () => {
  const articles = routeArticles(multiPath, 'ru', true);
  const points = [{ x: 40, y: 60 }, { x: 240, y: 60 }, { x: 440, y: 60 }, { x: 440, y: 260 }, { x: 240, y: 260 }, { x: 40, y: 260 }];
  const joins = routeConnectors(points, articles, false);
  expect(joins.map(({ from, to, crossLanguage }) => [from, to, crossLanguage])).toEqual([[1, 2, false], [2, 3, false], [3, 4, false], [4, 5, true], [5, 6, false]]);
  expect(joins[2].d).toBe('M 440 60 C 512 60 512 260 440 260');
  const seven = routeConnectors([...points, { x: 40, y: 460 }], routeArticles([...path, 'Design'], 'en', false), false);
  expect(seven[5].d).toBe('M 40 260 C -32 260 -32 460 40 460');
});
it('uses one continuous mobile route and rejects empty or invalid measurements', () => {
  const articles = routeArticles(['A', 'B', 'C'], 'en', false);
  expect(routeConnectors([{ x: 60, y: 30 }, { x: 60, y: 180 }, { x: 60, y: 330 }], articles, true).map(j => j.d)).toEqual(['M 60 30 L 60 180', 'M 60 180 L 60 330']);
  expect(routeConnectors([], articles, false)).toEqual([]);
  expect(routeConnectors([{ x: 0, y: 0 }, { x: NaN, y: 0 }, { x: 0, y: 0 }], articles, false)).toEqual([]);
  expect(routeConnectors([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }], articles, false)).toEqual([]);
});

let root: Root | undefined;
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount(reducedMotion = false, layout?: (element: HTMLElement) => DOMRect) {
  vi.useFakeTimers();
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduced-motion') && reducedMotion }));
  if (layout) vi.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) { return layout(this); });
  const container = document.getElementById('root')!;
  root = createRoot(container);
  act(() => root!.render(<RouteRibbon {...props} />));
  return container;
}
it('exposes all links immediately, ends assembly after 700ms, and restarts on a new result', () => {
  const container = mount();
  expect(container.querySelectorAll('ol a')).toHaveLength(6);
  expect(container.querySelector('.is-assembling')).not.toBeNull();
  act(() => vi.advanceTimersByTime(700));
  expect(container.querySelector('.is-assembling')).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  act(() => root!.render(<RouteRibbon {...props} path={['A', 'B']} multilingual={false} />));
  expect(container.querySelector('.is-assembling')).not.toBeNull();
  expect(container.querySelector('svg')).toBeNull(); // linkedom has zero-sized layout.
});

it('measures actual anchors, recalculates on resize, and disconnects after unmount', () => {
  let recalculate = () => {};
  let disconnected = false;
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { recalculate = callback; }
    observe() {} disconnect() { disconnected = true; }
  });
  let mobile = false;
  let zeroAnchor = false;
  const container = mount(true, element => {
    if (element.classList.contains('route-list')) return { left: 10, top: 20, width: 600, height: 400 } as DOMRect;
    const n = Number(element.parentElement?.dataset.number);
    const positions = [[50, 70], [250, 70], [450, 70], [450, 270], [250, 270], [50, 270]];
    const [x, y] = positions[n - 1] ?? [0, 0];
    return { left: mobile ? 70 : x, top: mobile ? 20 + n * 100 : y, width: zeroAnchor ? 0 : 20, height: zeroAnchor ? 0 : 20 } as DOMRect;
  });
  expect(container.querySelectorAll('.route-connectors > path')).toHaveLength(5);
  expect(container.querySelector('[data-from="3"]')?.getAttribute('d')).toBe('M 450 60 C 522 60 522 260 450 260');
  expect(container.querySelector('[data-from="4"]')?.getAttribute('stroke-dasharray')).toBe('9 7');
  expect(container.querySelector('[data-from="3"]')?.hasAttribute('stroke-dasharray')).toBe(false);
  mobile = true;
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  act(() => recalculate());
  expect(container.querySelector('[data-from="3"]')?.getAttribute('d')).toBe('M 70 310 L 70 410');
  zeroAnchor = true;
  act(() => recalculate());
  expect(container.querySelector('svg')).toBeNull();
  act(() => root!.unmount()); root = undefined;
  expect(disconnected).toBe(true);
});
it('skips assembly with reduced motion and wires end actions', () => {
  const container = mount(true);
  expect(container.querySelector('.is-assembling')).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  const onNewPair = vi.fn(); const onShare = vi.fn();
  act(() => root!.render(<RouteRibbon {...props} onNewPair={onNewPair} onShare={onShare} shareStatus="Ссылка скопирована" />));
  const buttons = container.querySelectorAll('button');
  act(() => { buttons[0].click(); buttons[1].click(); });
  expect(onNewPair).toHaveBeenCalledOnce(); expect(onShare).toHaveBeenCalledOnce();
  expect(container.querySelector('[role=status]')?.textContent).toBe('Ссылка скопирована');
});
