import { expect, test } from '@playwright/test';

test('local worker returns shortest paths with one graph fetch and zero Wikipedia requests', async ({ page, context }) => {
  const wikipedia: string[] = [], graphs: string[] = [];
  await context.route('https://*.wikipedia.org/**', async route => { wikipedia.push(route.request().url()); await route.abort(); });
  context.on('request', request => { if (request.url().endsWith('/graphs/en.bin.gz')) graphs.push(request.url()); });
  await page.goto('/?from=A&to=D&lang=en');
  await page.getByRole('button', { name: 'Найти путь' }).click();
  await expect(page.locator('.path-card strong')).toHaveText(['A', 'B', 'D']);
  await expect(page.getByRole('checkbox', { name: 'Межъязыковой поиск (langlinks)' })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Объект А / откуда' }).fill('Alias');
  await page.getByRole('combobox', { name: 'Объект Б / куда' }).fill("Quoted's (page)");
  await page.getByRole('button', { name: 'Найти путь' }).click();
  await expect(page.locator('.path-card strong')).toHaveText(['D', "Quoted's (page)"]);
  expect(graphs).toHaveLength(2); // a new Worker for each search
  expect(wikipedia).toEqual([]);
});
