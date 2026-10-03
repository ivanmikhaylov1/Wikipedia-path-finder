import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import type { ArticleSelection } from '../src/lib/articleSelection';
import { ArticleField } from '../src/components/ArticleField';

function render(selection: ArticleSelection = { value: 'Bauhaus', selected: { title: 'Bauhaus', lang: 'en' } }, localLang?: string, disabled = false) {
  return parseHTML(renderToStaticMarkup(<ArticleField id="article-01" label="Первая статья" number="01" selection={selection} onChange={() => {}} disabled={disabled} localLang={localLang} />)).document;
}

it('labels a real combobox and exposes its full selected title and language', () => {
  const title = 'Полное название длинной статьи без сокращения';
  const document = render({ value: title, selected: { title, lang: 'de' } });
  const input = document.querySelector('input')!;
  expect(input.getAttribute('role')).toBe('combobox');
  expect(input.getAttribute('value')).toBe(title);
  expect(document.querySelector(`label[for="${input.id}"]`)?.textContent).toContain('Первая статья');
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
