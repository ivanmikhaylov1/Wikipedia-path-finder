import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { mockWiki, EXAMPLE_ROUTE } from './wikiMock';

for (const width of [360, 1280]) for (const state of ['idle', 'searching', 'found', 'notFound'] as const) {
  test(`review capture ${state} ${width}`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockWiki(context, state === 'notFound' ? 'notFound' : state === 'searching' ? 'long' : 'found', EXAMPLE_ROUTE);
    await page.goto('/'); await page.evaluate(() => document.fonts.ready);
    if (state !== 'idle') await page.getByRole('button', { name: 'Столкнуть' }).click();
    if (state === 'found') {
      await expect(page.locator('.route-strip')).toHaveCount(EXAMPLE_ROUTE.length);
      await expect(page.locator('.route-strip a')).toHaveText(EXAMPLE_ROUTE.map(node => `${node.title} ↗`));
      await expect(page.locator('.route-language-turn')).toHaveText('RU → EN / смена языка');
    } else if (state === 'notFound') await expect(page.getByRole('heading', { name: 'Путь не найден' })).toBeVisible();
    else if (state === 'searching') await expect(page.locator('.search-counts')).toContainText('Проверено статей:');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations).toEqual([]);
    for (const target of await page.locator('button, a[href]').all()) {
      if (!await target.isVisible()) continue;
      const bounds = await target.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await mkdir('docs/verification/collision', { recursive: true });
    const path = `docs/verification/collision/${state}-${width}.png`;
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
    await testInfo.attach('Actual collision state', { path, contentType: 'image/png' });
  });
}

test('keyboard focus is visible and reduced motion suppresses the finite entrance', async ({ page, context }) => {
  await mockWiki(context, 'found', EXAMPLE_ROUTE); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: 'Перейти к поиску' })).toBeFocused();
  expect(await page.locator(':focus').evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  await expect(page.locator('.route-strip')).toHaveCount(EXAMPLE_ROUTE.length);
  await expect(page.locator('.route-ribbon')).not.toHaveClass(/is-assembling/);
});

for (const width of [360, 1280]) test(`example word remains whole and result caption clears the heading ${width}`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWiki(context, 'found', EXAMPLE_ROUTE); await page.goto('/'); await page.evaluate(() => document.fonts.ready);
  const word = page.locator('[data-side=to] .article-display');
  const metrics = await word.evaluate(el => ({ height: el.getBoundingClientRect().height, size: parseFloat(getComputedStyle(el).fontSize) }));
  expect(metrics.height).toBeLessThanOrEqual(metrics.size * 1.2);
  await page.getByRole('button', { name: 'Столкнуть' }).click(); await expect(page.locator('.route-strip')).toHaveCount(EXAMPLE_ROUTE.length);
  const heading = await page.locator('#route-heading').boundingBox(), caption = await page.locator('.ribbon-caption').boundingBox();
  const overlap = heading!.x < caption!.x + caption!.width && heading!.x + heading!.width > caption!.x && heading!.y < caption!.y + caption!.height && heading!.y + heading!.height > caption!.y;
  expect(overlap).toBe(false);
});

const longTitles = [
  'Очень длинное название энциклопедической статьи о международных междисциплинарных исследованиях и их методологии',
  'International multidisciplinary encyclopedia article concerning exceptionally long scientific terminology and methodology',
];
for (const width of [360, 767, 768, 1280]) for (const urlInput of [false, true]) {
  test(`full long ${urlInput ? 'URLs' : 'titles'} remain usable at ${width}`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' });
    const nodes = longTitles.map(title => ({ title, lang: 'ru' })); await mockWiki(context, 'found', nodes); await page.goto('/');
    for (const [index, name] of ['Откуда', 'Куда'].entries()) {
      const input = page.getByRole('combobox', { name, exact: true });
      const value = urlInput ? `https://ru.wikipedia.org/wiki/${encodeURIComponent(longTitles[index].replaceAll(' ', '_'))}` : longTitles[index];
      await input.fill(value); await expect(input).toHaveValue(value);
      await expect(input).toBeFocused();
      await expect(page.locator(`[data-side=${index === 0 ? 'from' : 'to'}] .article-display`)).toHaveText(longTitles[index]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    await page.getByRole('button', { name: 'Столкнуть' }).click(); await expect(page.locator('.route-strip a')).toHaveText(longTitles.map(title => `${title} ↗`));
    await expect(page.locator('.route-strip a').last()).toHaveAttribute('href', `https://ru.wikipedia.org/wiki/${encodeURIComponent(longTitles[1].replaceAll(' ', '_'))}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test('200% browser-zoom equivalent reflows a 1280px display to 640 CSS px without losing controls or route', async ({ browser }) => {
  // Browser zoom halves the CSS viewport and doubles pixel density. Use those
  // metrics, rather than a visual page-scale transform that does not reflow.
  const context = await browser.newContext({ viewport: { width: 640, height: 450 }, deviceScaleFactor: 2 });
  try {
    const page = await context.newPage(); await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockWiki(context, 'found', EXAMPLE_ROUTE); await page.goto('http://127.0.0.1:4173/');
    expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(640);
    await page.getByRole('button', { name: 'Изменить: Откуда' }).click(); await expect(page.getByRole('combobox', { name: 'Откуда' })).toBeFocused();
    await page.getByRole('button', { name: 'Столкнуть' }).click(); await expect(page.locator('.route-strip')).toHaveCount(EXAMPLE_ROUTE.length);
    await page.getByRole('button', { name: 'Поделиться' }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(640);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  } finally { await context.close(); }
});
