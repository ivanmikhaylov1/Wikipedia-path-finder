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
