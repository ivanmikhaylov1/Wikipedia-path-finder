import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, expect, it, vi } from 'vitest';
import { useArticleSuggestions } from '../src/components/useArticleSuggestions';
import { WikiApiClient } from '../src/lib/wikiApi';

let root: Root | undefined;
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('renders partial section results while loading and clears them immediately for the next text', async () => {
  vi.useFakeTimers();
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let release!: (titles: string[]) => void;
  vi.spyOn(WikiApiClient.prototype, 'suggest').mockImplementation(async (text, lang) => {
    if (text === 'Old' && lang === 'ru') return ['First section'];
    if (text === 'Old' && lang === 'en') return new Promise(resolve => { release = resolve; });
    return [];
  });
  function Probe({ value }: { value: string }) {
    const state = useArticleSuggestions(value, true);
    return <div data-loading={state.loading}>{state.articles.map(article => <span key={article.lang}>{article.title}</span>)}</div>;
  }
  const container = document.getElementById('root')!; root = createRoot(container);
  act(() => root!.render(<Probe value="Old" />));
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(container.textContent).toBe('First section');
  expect(container.firstElementChild?.getAttribute('data-loading')).toBe('true');
  act(() => root!.render(<Probe value="New" />));
  expect(container.textContent).toBe('');
  await act(async () => { release(['Stale later section']); await vi.advanceTimersByTimeAsync(300); });
  expect(container.textContent).toBe('');
  expect(container.firstElementChild?.getAttribute('data-loading')).toBe('false');
});
