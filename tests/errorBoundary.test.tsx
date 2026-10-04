import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { RouteRibbon } from '../src/components/RouteRibbon';

let root: Root | undefined;
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('recovers from an actual invalid route render instead of leaving a blank page', () => {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const reload = vi.fn(); vi.stubGlobal('location', { reload });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const container = document.getElementById('root')!; root = createRoot(container);
  act(() => root!.render(<StrictMode><ErrorBoundary><RouteRibbon path={['invalid multilingual key']} lang="ru" multilingual onEdit={() => {}} onNewPair={() => {}} onShare={() => {}} shareStatus="" /></ErrorBoundary></StrictMode>));
  expect(container.querySelector('[role=alert]')?.textContent).toContain('Не удалось показать страницу');
  const button = container.querySelector('button')!;
  expect(button.textContent).toBe('Обновить страницу');
  act(() => button.click());
  expect(reload).toHaveBeenCalledOnce();
});
