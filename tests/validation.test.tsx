import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { ArticleField } from '../src/components/ArticleField';
import { SearchForm } from '../src/components/SearchForm';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('associates field errors with the affected combobox', () => {
  const html = renderToStaticMarkup(<ArticleField id="article-01" label="Первая статья" number="01" selection={{ value: '', selected: null }} onChange={() => {}} disabled={false} error="Введите статью" />);
  const { document } = parseHTML(html);
  const input = document.querySelector('input')!;
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe('Введите статью');
});

it('offers one collision action and swap with no language, mode or share controls', () => {
  vi.stubGlobal('location', { search: '' });
  const { document } = parseHTML(renderToStaticMarkup(<SearchForm searching={false} error="" onSearch={() => {}} onCancel={() => {}} onValidationError={() => {}} />));
  expect(document.querySelectorAll('input[role="combobox"]')).toHaveLength(2);
  expect(document.querySelector('select')).toBeNull();
  expect(document.querySelector('input[type="checkbox"]')).toBeNull();
  expect(document.querySelector('button[type="submit"]')?.textContent).toBe('Столкнуть');
  expect(document.querySelector('.swap-button')?.textContent).toContain('Поменять');
  expect(document.querySelector('form')?.textContent).not.toContain('Скопировать ссылку');
});

it('offers stop and disables both fields and swap while searching', () => {
  vi.stubGlobal('location', { search: '' });
  const { document } = parseHTML(renderToStaticMarkup(<SearchForm searching error="" onSearch={() => {}} onCancel={() => {}} onValidationError={() => {}} />));
  expect(document.querySelector('.collision-submit')?.textContent).toBe('Остановить');
  expect(document.querySelector('button[type="submit"]')).toBeNull();
  expect(Array.from(document.querySelectorAll('input')).every(input => input.hasAttribute('disabled'))).toBe(true);
  expect(document.querySelector('.swap-button')?.hasAttribute('disabled')).toBe(true);
});
