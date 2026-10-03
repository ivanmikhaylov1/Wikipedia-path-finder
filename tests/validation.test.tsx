import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { ArticleInput } from '../src/components/SearchForm';

it('associates field errors with the affected input', () => {
  const html = renderToStaticMarkup(<ArticleInput label="Откуда" number="01" value="" placeholder="Название" setValue={() => {}} lang="ru" disabled={false} error="Введите статью" />);
  const { document } = parseHTML(html);
  const input = document.querySelector('input')!;
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe('Введите статью');
});
it('associates pair errors with both inputs without duplicating the message', () => {
  const html = renderToStaticMarkup(<><ArticleInput label="Откуда" number="01" value="A" placeholder="" setValue={() => {}} lang="ru" disabled={false} pairErrorId="pair-error" /><ArticleInput label="Куда" number="02" value="D" placeholder="" setValue={() => {}} lang="en" disabled={false} pairErrorId="pair-error" /><p id="pair-error">Разные языки</p></>);
  const { document } = parseHTML(html);
  for (const input of Array.from(document.querySelectorAll('input'))) {
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('pair-error');
  }
});
