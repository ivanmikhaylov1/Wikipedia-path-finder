import { expect, test } from '@playwright/test';

test('JavaScript disabled: explanation and static map remain available', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: {width:360,height:900} });
  const page = await context.newPage(); await page.goto('http://127.0.0.1:4173');
  await expect(page.getByRole('heading', {name:'Переходы — нить между статьями'})).toBeVisible();
  await expect(page.getByText(/включите JavaScript/)).toBeVisible();
  await expect(page.getByRole('img', {name:/Карта знаний/})).toBeVisible();
  await page.screenshot({path:'test-results/no-js.png',fullPage:true});
  await context.close();
});
