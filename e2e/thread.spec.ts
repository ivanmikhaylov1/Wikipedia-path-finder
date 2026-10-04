import { expect, test } from '@playwright/test';
import { mockWiki, PATH, searchBudget, watchFrames, expectRest, type WikiNode } from './wikiMock';

for (const width of [767, 768, 1280]) for (const count of [1, 2, 12, 13]) {
  test(`consecutive measured route ${count} articles at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    await watchFrames(page); await searchBudget(page, { maxDepth: 16 });
    const nodes: WikiNode[] = Array.from({ length: count }, (_, index) => ({
      title: `Article ${index + 1}`, lang: index < 3 ? 'ru' : 'en',
    }));
    await mockWiki(context, 'found', nodes);
    const endpoint = (node: WikiNode) => `https://${node.lang}.wikipedia.org/wiki/${encodeURIComponent(node.title)}`;
    await page.goto(`/?from=${encodeURIComponent(endpoint(nodes[0]))}&to=${encodeURIComponent(endpoint(nodes.at(-1)!))}`);
    await page.getByRole('button', { name: 'Столкнуть' }).click();
    await expect(page.locator('.route-strip')).toHaveCount(count);
    await expect(page.locator('.route-strip a')).toHaveText(nodes.map(node => `${node.title} ↗`));
    await expect(page.locator('.route-counts')).toContainText(`${count - 1} `);
    await expect(page.locator('.route-counts')).toContainText(`/ ${count} `);
    await expect(page.locator('.route-connectors path')).toHaveCount(count - 1);
    for (let index = 1; index < count; index++) {
      const join = page.locator(`.route-connectors path[data-from="${index}"][data-to="${index + 1}"]`);
      await expect(join).toHaveCount(1);
      const d = await join.getAttribute('d'); expect(d).not.toMatch(/NaN|Infinity/);
      expect(d).toContain(width < 768 ? ' L ' : ' C ');
      if (index === 3) {
        await expect(join).toHaveAttribute('stroke-dasharray', '9 7');
        await expect(page.locator('.route-language-turn')).toHaveText('RU → EN / смена языка');
      } else await expect(join).not.toHaveAttribute('stroke-dasharray');
    }
    expect(await page.locator('.route-list').evaluate(el => getComputedStyle(el).display)).toBe(width < 768 ? 'flex' : 'grid');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expectRest(page);
  });
}

test('real API search observations survive hidden tab and cancellation leaves no ongoing animation', async ({ page, context }) => {
  await watchFrames(page); const fixture = await mockWiki(context, 'long');
  await page.goto('/?from=Москва&to=Философия&lang=ru');
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  await expect(page.locator('.collision-stage')).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  fixture.release();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('.route-strip')).toHaveCount(PATH.length);
  await expectRest(page);
  await page.getByRole('button', { name: 'Новая пара' }).click();
  await mockWiki(context, 'long');
  await page.getByRole('combobox', { name: 'Откуда' }).fill(PATH[0]);
  await page.getByRole('combobox', { name: 'Куда', exact: true }).fill(PATH.at(-1)!);
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  await page.getByRole('button', { name: 'Остановить' }).click();
  await expect(page.locator('.collision-stage')).toHaveCount(0);
  await expect(page.locator('.route-strip')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Откуда' })).toBeFocused();
  await expectRest(page);
});
