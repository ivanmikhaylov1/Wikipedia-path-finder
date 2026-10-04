import { expect, test } from '@playwright/test';

test('JavaScript disabled: bounded search explanation and decoded decorative octopus remain available', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 900 } });
  try {
    const page = await context.newPage(); await page.goto('http://127.0.0.1:4173');
    await expect(page.getByRole('heading', { name: 'Переходы — две статьи, одна связь' })).toBeVisible();
    await expect(page.getByText(/включите JavaScript/)).toBeVisible();
    await expect(page.getByText(/не обязательно кратчайший/)).toBeVisible();
    const image = page.getByRole('img', { name: /Декоративная иллюстрация осьминога/ });
    await expect(image).toBeVisible();
    expect(await image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await expect(page.locator('meta[name=theme-color]')).toHaveAttribute('content', '#f4f1e8');
    await page.screenshot({ path: 'test-results/no-js.png', fullPage: true });
  } finally { await context.close(); }
});

test('mobile first visit preserves the sample and core UI offline without precaching the desktop illustration', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 360, height: 900 }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4173');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    const cachedPaths = await page.evaluate(async () => {
      const scope = new URL((await navigator.serviceWorker.ready).scope);
      const names = (await caches.keys()).filter(name => name.startsWith(`perehody-${scope.href}::`));
      return (await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)))).flat();
    });
    expect(cachedPaths).toContain('/images/collision/octopus-small.webp');
    expect(cachedPaths).not.toContain('/images/collision/octopus.webp');
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Откуда', exact: true })).toHaveValue('Осьминоги');
    await expect(page.getByRole('combobox', { name: 'Куда', exact: true })).toHaveValue('Bauhaus');
    await expect(page.getByRole('button', { name: 'Столкнуть', exact: true })).toBeVisible();
    await expect.poll(() => page.locator('.octopus-cutout').evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  } finally { await context.close(); }
});
