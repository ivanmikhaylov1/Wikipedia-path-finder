import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockWiki, PATH } from './wikiMock';

// Override the budget sent to the real Worker; API, BFS and message handling remain real.
async function searchBudget(page: import('@playwright/test').Page, limits: Record<string, number>) {
  await page.addInitScript(limits => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message: Parameters<Worker['postMessage']>[0]) {
        super.postMessage(message?.limits ? { ...message, limits: { ...message.limits, ...limits } } : message);
      }
    };
  }, limits);
}
for (const width of [360, 1280]) for (const theme of ['light', 'dark']) {
  for (const state of ['limits', 'noResume', 'exhausted', 'depth', 'language', 'empty'] as const) {
    test(`${state} ${width} ${theme}: state, recovery, axe and screenshot`, async ({ page, context }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await context.addInitScript(t => localStorage.setItem('perehody-theme', t), theme);
      await mockWiki(context, state === 'exhausted' ? 'notFound' : 'found');
      if (state === 'limits') await searchBudget(page, { maxTotalRequests: 3 });
      if (state === 'noResume') await searchBudget(page, { maxTotalRequests: 1 });
      if (state === 'depth') await searchBudget(page, { maxDepth: 1 });
      await page.goto('/');
      const from = page.getByLabel('Откуда', { exact: true }), to = page.getByLabel('Куда', { exact: true });
      if (state !== 'empty') {
        await from.fill(state === 'language' ? 'https://ru.wikipedia.org/wiki/A' : PATH[0]);
        await to.fill(state === 'language' ? 'https://en.wikipedia.org/wiki/D' : PATH.at(-1)!);
      }
      await page.getByRole('button', { name: 'Найти нить', exact: true }).click();
      if (state === 'language' || state === 'empty') {
        await expect(from).toHaveAttribute('aria-invalid', 'true');
        await expect(to).toHaveAttribute('aria-invalid', 'true');
        for (const input of [from, to]) {
          const id = await input.getAttribute('aria-describedby');
          await expect(page.locator(`[id="${id}"]`)).toBeVisible();
        }
        if (state === 'language') await expect(page.getByRole('alert')).toContainText('разных языковых разделов');
        await expect(from).toBeFocused();
      } else {
        await expect(page.locator('.status-message strong')).toHaveText('Путь не найден');
        const stats = { limits: [3, 1], noResume: [0, 0], exhausted: [2, 0], depth: [4, 1] }[state];
        await expect(page.locator('.status-message')).toContainText(`Проверено статей: ${stats[0]}. Достигнутая глубина: ${stats[1]}.`);
        await expect(page.locator('.stage-counters strong')).toHaveText([String(stats[1]), String(stats[0])]);
        await expect(page.locator('.stage')).toHaveAttribute('data-phase', 'notFound');
        await expect(page.locator('.stage-note')).toHaveText('Путь не найден');
        await expect(page.locator('.path-step')).toHaveCount(0);
        if (state === 'limits') {
          await expect(page.getByRole('button', { name: 'Искать глубже' })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Изменить статьи' })).toHaveCount(0);
          await expect(page.locator('.status-message')).toContainText('Исчерпан лимит запросов');
        } else {
          await expect(page.getByRole('button', { name: 'Искать глубже' })).toHaveCount(0);
          await expect(page.getByRole('button', { name: 'Изменить статьи' })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Поменять местами', exact: true })).toBeVisible();
          await expect(page.locator('.status-message')).not.toContainText('Увеличьте');
          if (state === 'depth') await expect(page.locator('.status-message')).toContainText('Достигнут предел глубины');
          if (state === 'exhausted') await expect(page.locator('.status-message')).toContainText('Доступные связи проверены');
        }
      }
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.evaluate(() => document.fonts.ready);
      const path = `test-results/p1-${state}-${width}-${theme}.png`;
      await page.screenshot({ path, fullPage: true });
      await testInfo.attach('Скриншот P1', { path, contentType: 'image/png' });
      if (state === 'limits') {
        await page.getByRole('button', { name: 'Искать глубже' }).click();
        await expect(page.locator('.path-step')).toHaveCount(5);
      } else if (state === 'exhausted') {
        await page.getByRole('button', { name: 'Изменить статьи' }).click();
        await expect(from).toBeFocused();
        await page.getByRole('button', { name: 'Поменять местами', exact: true }).click();
        await expect(from).toHaveValue(PATH.at(-1)!);
        await expect(to).toHaveValue(PATH[0]);
      }
    });
  }
}

test('notFound waves fade and the scene stops requesting frames', async ({ page, context }) => {
  await page.addInitScript(() => {
    const original = requestAnimationFrame;
    let count = 0;
    Object.defineProperty(window, 'frames', { get: () => count });
    window.requestAnimationFrame = callback => original(time => { count++; callback(time); });
  });
  await mockWiki(context, 'notFound'); await page.goto('/?from=A&to=D&lang=ru');
  await page.getByRole('button', { name: 'Найти нить', exact: true }).click();
  await expect(page.locator('.stage')).toHaveAttribute('data-phase', 'notFound');
  await page.waitForTimeout(700);
  const frames = await page.evaluate(() => Reflect.get(window, 'frames'));
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => Reflect.get(window, 'frames'))).toBe(frames);
});
