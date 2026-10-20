import { expect, test, type Page } from '@playwright/test';
import { mockWiki } from './wikiMock';

const from = { title: 'Чёрная дыра', lang: 'ru' }, to = { title: 'Jazz', lang: 'en' };
async function openPair(page: Page) {
  await page.goto(`/?from=${encodeURIComponent(from.title)}&to=${encodeURIComponent(to.title)}&lang=ru`);
  await expect(page.locator('.engraving-cover')).toHaveCount(1);
  await expect(page.locator('.construction-cover')).toHaveCount(1);
}
const running = (page: Page) => page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length);

test('a generated cover is engraved once, then rests', async ({ page, context }) => {
  await mockWiki(context, 'found', [from, to]);
  await openPair(page);
  expect(await running(page)).toBeGreaterThan(0);
  await expect.poll(() => running(page), { timeout: 3000 }).toBe(0);
  await page.waitForTimeout(300);
  expect(await running(page)).toBe(0);
});

test('cover layers follow a fine pointer at different depths and settle', async ({ page, context }) => {
  await mockWiki(context, 'found', [from, to]);
  await openPair(page);
  await expect.poll(() => running(page), { timeout: 3000 }).toBe(0);
  const translate = () => page.locator('.layer-cap').evaluate(el => getComputedStyle(el).translate);
  const before = await translate();
  await page.mouse.move(10, 10); await page.mouse.move(1200, 700, { steps: 4 });
  await expect.poll(translate).not.toBe(before);
  await expect.poll(() => running(page), { timeout: 2000 }).toBe(0);
});

test('reduced motion keeps the cover still and complete', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWiki(context, 'found', [from, to]);
  await openPair(page);
  expect(await running(page)).toBe(0);
  await page.mouse.move(10, 10); await page.mouse.move(1200, 700, { steps: 4 });
  expect(await page.locator('.layer-cap').evaluate(el => (el as SVGElement).style.translate)).toBe('');
  expect(await page.locator('.engraving-contour').evaluateAll(paths => paths.map(el => getComputedStyle(el).strokeDashoffset))).toEqual(expect.arrayContaining(['0px']));
  expect(new Set(await page.locator('.engraving-contour').evaluateAll(paths => paths.map(el => getComputedStyle(el).strokeDashoffset)))).toEqual(new Set(['0px']));
});

test('search progress deepens the print and the trace stays after the search', async ({ page, context }) => {
  await mockWiki(context, 'notFound', [from, to]);
  await openPair(page);
  const intensity = () => page.locator('.engraving-progress').evaluate(el => Number((el as SVGElement).style.opacity));
  expect(await intensity()).toBe(0);
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  await expect.poll(intensity).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Столкнуть' })).toBeVisible();
  expect(await intensity()).toBeGreaterThan(0);
});

test('a found route trades inks between the halves and both pages carry one edition mark', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWiki(context, 'found', [from, to]);
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Откуда', exact: true }).fill(`https://ru.wikipedia.org/wiki/${encodeURIComponent(from.title)}`);
  await page.getByRole('combobox', { name: 'Куда', exact: true }).fill('https://en.wikipedia.org/wiki/Jazz');
  await expect(page.locator('.construction-cover')).toHaveAttribute('data-cover', JSON.stringify(['en', 'Jazz']));
  await expect(page.locator('.engraving-cover')).toHaveAttribute('data-cover', JSON.stringify(['ru', from.title]));
  const mark = (await page.locator('.publisher-foot .colophon').textContent())!;
  expect(mark).toMatch(/^Оттиск № [0-9A-F]{4} · RU → EN · \d{4}$/);
  await expect(page.locator('.engraving-cover')).not.toHaveAttribute('data-exchanged');
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  await expect(page.locator('.route-strip')).toHaveCount(2);
  await expect(page.locator('.engraving-cover')).toHaveAttribute('data-exchanged', 'true');
  await expect(page.locator('.construction-cover')).toHaveAttribute('data-exchanged', 'true');
  expect(await page.locator('.engraving-words').first().getAttribute('fill')).toBe('#123bff');
  await expect(page.locator('.ribbon-colophon')).toHaveText(mark);
});
