import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockWiki, PATH, searchBudget, watchFrames, expectRest } from './wikiMock';

for (const width of [360, 1280]) for (const state of ['requests', 'noResume', 'no_path', 'depth', 'time', 'invalid', 'empty'] as const) {
  test(`${state} at ${width}: accurate stats, recovery and accessibility`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' });
    const fixture = await mockWiki(context, state === 'no_path' ? 'notFound' : state === 'time' ? 'timeout' : 'found');
    if (state === 'requests') await searchBudget(page, { maxTotalRequests: 3 });
    if (state === 'noResume') await searchBudget(page, { maxTotalRequests: 1 });
    if (state === 'depth') await searchBudget(page, { maxDepth: 1 });
    if (state === 'time') await searchBudget(page, { searchTimeout: 150 });
    await page.goto('/?from=Москва&to=Философия&lang=ru');
    const from = page.getByRole('combobox', { name: 'Откуда' }), to = page.getByRole('combobox', { name: 'Куда', exact: true });
    if (state === 'empty') { await from.fill(''); await to.fill(''); }
    if (state === 'invalid') { await from.fill('https://example.com/wiki/A'); await to.fill('https://ru.wikipedia.org/wiki/%ZZ'); }
    await page.getByRole('button', { name: 'Столкнуть' }).click();
    if (state === 'empty' || state === 'invalid') {
      for (const input of [from, to]) {
        await expect(input).toHaveAttribute('aria-invalid', 'true');
        const id = await input.getAttribute('aria-describedby'); await expect(page.locator(`[id="${id}"]`)).toBeVisible();
      }
      await expect(from).toBeFocused();
    } else {
      await expect(page.getByRole('heading', { name: 'Путь не найден' })).toBeVisible();
      const stats = { requests: [3, 1], noResume: [0, 0], no_path: [2, 0], depth: [4, 1], time: [2, 0] }[state];
      await expect(page.locator('.search-status')).toContainText(`Проверено статей: ${stats[0]}. Достигнутая глубина: ${stats[1]}.`);
      await expect(page.locator('.route-strip')).toHaveCount(0);
      await expect(page.locator('.collision-stage')).toHaveCount(0);
      if (state === 'requests' || state === 'time') {
        await expect(page.getByRole('button', { name: 'Искать глубже' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Изменить статьи', exact: true })).toHaveCount(0);
        await expect(page.locator('.search-status')).toContainText(state === 'time' ? 'Истекло время поиска' : 'Исчерпан лимит запросов');
      } else {
        await expect(page.getByRole('button', { name: 'Искать глубже' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Изменить статьи', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Поменять местами', exact: true })).toBeVisible();
        if (state === 'depth') await expect(page.locator('.search-status')).toContainText('Достигнут предел глубины');
        if (state === 'no_path') await expect(page.locator('.search-status')).toContainText('Доступные связи проверены');
      }
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (state === 'requests' || state === 'time') {
      fixture.release(); await page.getByRole('button', { name: 'Искать глубже' }).click();
      await expect(page.locator('.route-strip')).toHaveCount(PATH.length);
    } else if (state === 'no_path') {
      await page.getByRole('button', { name: 'Изменить статьи', exact: true }).click(); await expect(from).toBeFocused();
      await page.getByRole('button', { name: 'Поменять статьи местами' }).click();
      await expect(from).toHaveValue(PATH.at(-1)!); await expect(to).toHaveValue(PATH[0]);
    }
  });
}

test('notFound finishes its finite collision entrance and requests no frames at rest', async ({ page, context }) => {
  await watchFrames(page); await mockWiki(context, 'notFound'); await page.goto('/?from=Москва&to=Философия&lang=ru');
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  await expect(page.getByRole('heading', { name: 'Путь не найден' })).toBeVisible(); await expectRest(page);
});
