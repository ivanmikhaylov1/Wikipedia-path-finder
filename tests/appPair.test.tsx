import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../src/App';

let root: Root | undefined;
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('edits the resolved searched pair after completion and creates a fresh example separately', () => {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('location', { href: 'https://example.org/?from=https://en.wikipedia.org/wiki/Alpha&to=https://de.wikipedia.org/wiki/Beta', search: '?from=https://en.wikipedia.org/wiki/Alpha&to=https://de.wikipedia.org/wiki/Beta' });
  vi.stubGlobal('history', { replaceState() {} });
  const workers: { onmessage: ((event: { data: unknown }) => void) | null }[] = [];
  vi.stubGlobal('Worker', class { onmessage = null; constructor() { workers.push(this); } postMessage() {} terminate() {} });
  const container = document.getElementById('root')!; root = createRoot(container);
  act(() => root!.render(<App />));
  const submit = () => act(() => container.querySelector('form')!.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  const finish = () => act(() => workers.at(-1)!.onmessage!({ data: { type: 'found', path: ['["en","Alpha"]', '["de","Beta"]'] } }));
  const click = (name: string) => act(() => Array.from(container.querySelectorAll('button')).find(button => button.textContent?.startsWith(name))!.click());
  submit(); finish(); click('Изменить статьи');
  expect(container.querySelector('#article-01')?.getAttribute('value')).toBe('Alpha');
  expect(container.querySelector('#article-02')?.getAttribute('value')).toBe('Beta');
  expect(Array.from(container.querySelectorAll('.language-badge')).map(el => el.textContent)).toEqual(['EN', 'DE']);
  submit(); finish(); click('Новая пара');
  expect(container.querySelector('#article-01')?.getAttribute('value')).toBe('Осьминоги');
  expect(container.querySelector('#article-02')?.getAttribute('value')).toBe('Bauhaus');
});
