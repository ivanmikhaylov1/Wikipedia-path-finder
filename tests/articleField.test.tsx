import { afterEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { WikiApiClient } from '../src/lib/wikiApi';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import type { ArticleSelection } from '../src/lib/articleSelection';
import { ArticleField } from '../src/components/ArticleField';

function render(selection: ArticleSelection = { value: 'Bauhaus', selected: { title: 'Bauhaus', lang: 'en' } }, localLang?: string, disabled = false) {
  return parseHTML(renderToStaticMarkup(<ArticleField id="article-01" label="Откуда" number="01" selection={selection} onChange={() => {}} disabled={disabled} localLang={localLang} />)).document;
}

it('labels a real combobox and exposes its full selected title and language', () => {
  const title = 'Полное название длинной статьи без сокращения';
  const document = render({ value: title, selected: { title, lang: 'de' } });
  const input = document.querySelector('input')!;
  expect(input.getAttribute('role')).toBe('combobox');
  expect(input.getAttribute('value')).toBe(title);
  expect(document.querySelector(`label[for="${input.id}"]`)?.textContent).toContain('Откуда');
  expect(document.querySelector('.language-badge')?.textContent).toContain('DE');
  expect(document.querySelector('.article-display')?.textContent).toBe(title);
});

it('shows the raw input fallback section and the actual section of a pasted URL', () => {
  expect(render({ value: 'Berlin', selected: null }).querySelector('.language-badge')?.textContent).toContain('RU');
  expect(render({ value: 'Berlin', selected: null }, 'fr').querySelector('.language-badge')?.textContent).toContain('FR');
  expect(render({ value: 'https://ja.wikipedia.org/wiki/Bauhaus', selected: null }).querySelector('.language-badge')?.textContent).toContain('JA');
});

it('offers no standalone section or theme control and disables editing during search', () => {
  const document = render(undefined, undefined, true);
  expect(document.querySelector('select')).toBeNull();
  expect(document.querySelector('input[type="checkbox"]')).toBeNull();
  expect(document.querySelector('input')?.hasAttribute('disabled')).toBe(true);
  expect(document.querySelector('button')?.hasAttribute('disabled')).toBe(true);
});


let root: Root | undefined;
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('retains the highlighted article across later language batches so Enter selects it, and resets for a new query', async () => {
  vi.useFakeTimers();
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let release!: (titles: string[]) => void;
  vi.spyOn(WikiApiClient.prototype, 'suggest').mockImplementation(async (text, lang) => {
    if (text === 'Al' && lang === 'ru') return ['Альфа'];
    if (text === 'Al' && lang === 'en') return new Promise(resolve => { release = resolve; });
    return text === 'New' && lang === 'ru' ? ['Новая статья'] : [];
  });
  const container = document.getElementById('root')!; root = createRoot(container);
  const change = vi.fn();
  const update = (value: string) => act(() => root!.render(<ArticleField id="article-01" label="Откуда" number="01" selection={{ value, selected: null }} onChange={change} disabled={false} />));
  update('Al');
  const input = container.querySelector('input')!;
  Object.assign(input, { attachEvent() {}, detachEvent() {} });
  act(() => input.dispatchEvent(new window.Event('focusin', { bubbles: true })));
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(container.querySelectorAll('[role=option]')).toHaveLength(1);
  const press = (key: string) => act(() => {
    const event = new window.Event('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'key', { value: key });
    input.dispatchEvent(event);
  });
  press('ArrowDown');
  expect(input.getAttribute('aria-activedescendant')).toBe('article-01-option-0');
  await act(async () => { release(['Alpha']); await vi.advanceTimersByTimeAsync(0); });
  expect(container.querySelectorAll('[role=option]')).toHaveLength(2);
  expect(input.getAttribute('aria-activedescendant')).toBe('article-01-option-0');
  expect(container.querySelector('[aria-selected=true]')?.textContent).toBe('АльфаRU');
  press('Enter');
  expect(change).toHaveBeenCalledWith({ value: 'Альфа', selected: { title: 'Альфа', lang: 'ru' } });
  press('ArrowDown');
  update('New');
  expect(input.hasAttribute('aria-activedescendant')).toBe(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(container.querySelectorAll('[role=option]')).toHaveLength(1);
  expect(input.hasAttribute('aria-activedescendant')).toBe(false);
});
