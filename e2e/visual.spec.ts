import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { mockWiki, PATH } from './wikiMock';

for (const width of [360, 768, 1280]) for (const theme of ['light', 'dark']) for (const motion of ['no-preference', 'reduce'] as const) {
  test(`layout ${width} ${theme} ${motion}`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: motion });
    await context.addInitScript(t => localStorage.setItem('perehody-theme', t), theme);
    await mockWiki(context); await page.goto('/'); await page.evaluate(() => document.fonts.ready);
    await page.getByLabel('Откуда', { exact: true }).fill(PATH[0]);
    await page.getByLabel('Куда', { exact: true }).fill(PATH.at(-1)!);
    await page.getByRole('button', { name: 'Найти нить', exact: true }).click();
    await expect(page.locator('.stage')).toHaveAttribute('data-phase', 'done');
    await expect(page.locator('.path-step.is-lit')).toHaveCount(5);
    await page.locator('.path-list').scrollIntoViewIfNeeded();
    await expect(page.locator('.summary-skeleton')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(await page.locator('.fields-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(width < 720 ? 1 : 3);
    expect(await page.locator('.path-list').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(width < 720 ? 1 : 5);
    expect(await page.locator('canvas').evaluate(el => (el as HTMLCanvasElement).width / el.getBoundingClientRect().width)).toBeLessThanOrEqual(2.01);
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await mkdir('test-results/screenshots', { recursive: true });
    const path = `test-results/screenshots/red-thread-${width}-${theme}-${motion}.png`;
    await page.screenshot({ path, fullPage: true });
    await testInfo.attach('Скриншот', { path, contentType: 'image/png' });
  });
}

test('keyboard focus is visible and reduced motion skips waves and flash', async ({ page, context }) => {
  await mockWiki(context); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: 'Перейти к поиску' })).toBeFocused();
  expect(await page.locator(':focus').evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.getByLabel('Откуда', { exact: true }).fill(PATH[0]);
  await page.getByLabel('Куда', { exact: true }).fill(PATH.at(-1)!);
  const started = Date.now();
  await page.getByRole('button', { name: 'Найти нить', exact: true }).click();
  await expect(page.locator('.stage')).toHaveAttribute('data-phase', 'done');
  expect(Date.now() - started).toBeLessThan(2400);
});
