import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initialArticlePair } from '../src/lib/articleSelection';
import { CollisionSpread, type CollisionSpreadProps } from '../src/components/CollisionSpread';

let root: Root;
let container: HTMLElement;
const idle: CollisionSpreadProps = {
  pair: initialArticlePair("", false), onPairChange() {}, searching: false, searchId: 0, progress: null, error: '', canResume: false,
  onResume() {}, onSearch() {}, onCancel() {}, onValidationError() {},
};

beforeEach(() => {
  vi.useFakeTimers();
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', document);
  vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.getElementById('root')!;
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function render(props: CollisionSpreadProps) {
  act(() => root.render(<CollisionSpread {...props} />));
}
function colliding() { return container.querySelector('.collision-spread')!.classList.contains('is-colliding'); }

for (const reason of ['cancel', 'completion'] as const) {
  it(`stops collision immediately after early ${reason}`, () => {
    render(idle);
    render({ ...idle, searchId: 1, searching: true });
    expect(colliding()).toBe(true);
    act(() => vi.advanceTimersByTime(100));
    render({ ...idle, searchId: 1, error: reason === 'cancel' ? 'Поиск остановлен' : '',
      notFound: reason === 'completion' ? { limitsHit: 'depth', visited: 7, depth: 2 } : null });
    expect(colliding()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    // A later search gets its own full finite transition.
    render({ ...idle, searchId: 2, searching: true });
    expect(colliding()).toBe(true);
    act(() => vi.advanceTimersByTime(749));
    expect(colliding()).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(colliding()).toBe(false);
  });
}
it('does not animate an inactive spread when its search id changes', () => {
  render(idle);
  render({ ...idle, searchId: 1 });
  expect(colliding()).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
