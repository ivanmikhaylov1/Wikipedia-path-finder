import { expect, test, type BrowserContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const edges: Record<string, string[]> = { A: ['B'], B: ['D'], D: [] };
async function mockApi(context: BrowserContext, mode: 'normal' | 'slow' | 'error' = 'normal') {
  await context.route('https://*.wikipedia.org/api/rest_v1/**', route => route.fulfill({ json: { description: 'Статья в Википедии' } }));
  await context.route('https://*.wikipedia.org/w/api.php?*', async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } }); return; }
    const url = new URL(route.request().url());
    expect(await route.request().headerValue('api-user-agent')).toContain('Perehody');
    if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 800));
    if (mode === 'error') { await route.fulfill({ status: 400, body: 'Bad request' }); return; }
    const params = url.searchParams;
    const pages = (params.get('titles') ?? '').split('|').map(title => ({
      title, ns: 0, length: 100, missing: title === 'Missing' ? true : undefined,
      links: (edges[title] ?? []).map(title => ({ title, ns: 0 })),
      linkshere: Object.keys(edges).filter(key => edges[key].includes(title)).map(title => ({ title, ns: 0 })),
      langlinks: url.hostname === 'ru.wikipedia.org' && title === 'A' ? [{ lang: 'en', title: 'D' }] : [],
    }));
    const body = params.get('action') === 'parse' ? { parse: { text: '<div class="mw-parser-output"><p>No links.</p></div>' } }
      : params.get('list') === 'search' ? { query: { search: [{ title: 'Alpha' }, { title: 'Alpine' }] } } : { query: { pages } };
    await route.fulfill({ json: body });
  });
}

test('search builds a clickable route and a shareable URL', async ({ page, context }) => {
  await mockApi(context);
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Откуда' }).fill('A');
  await page.getByRole('combobox', { name: 'Куда', exact: true }).fill('D');
  await page.getByRole('button', { name: 'Найти нить' }).click();
  await expect(page.locator('.path-step')).toHaveCount(3);
  await expect(page.locator('.path-step h3 a')).toHaveText(['A', 'B', 'D']);
  await expect(page.locator('.path-step h3 a').last()).toHaveAttribute('href', 'https://ru.wikipedia.org/wiki/D');
  expect(new URL(page.url()).searchParams.get('from')).toBe('A');
  await expect(page.locator('.status-message strong')).toHaveText('Нить найдена');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('cancels the active worker and can start another search', async ({ page, context }) => {
  await mockApi(context, 'slow');
  await page.goto('/?from=A&to=D&lang=ru');
  await page.getByRole('button', { name: 'Найти нить' }).click();
  await page.getByRole('button', { name: 'Остановить' }).click();
  await expect(page.getByRole('alert')).toContainText('Поиск остановлен.');
  await expect(page.getByRole('button', { name: 'Найти нить' })).toBeVisible();
  await page.getByRole('button', { name: 'Найти нить' }).click();
  await expect(page.locator('.path-step')).toHaveCount(3);
});

test('shows API and missing endpoint errors', async ({ page, context }) => {
  await mockApi(context, 'error');
  await page.goto('/?from=A&to=D&lang=ru');
  await page.getByRole('button', { name: 'Найти нить' }).click();
  await expect(page.getByRole('alert')).toContainText('HTTP 400');
  await context.unrouteAll({ behavior: 'wait' });
  await mockApi(context);
  await page.getByRole('combobox', { name: 'Откуда' }).fill('Missing');
  await page.getByRole('button', { name: 'Найти нить' }).click();
  await expect(page.getByRole('alert')).toContainText('не найдена');
});

test('shared query is restored; autocomplete is operable with the keyboard at 360px', async ({ page, context }) => {
  await mockApi(context);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/?from=A&to=D&lang=en');
  const start = page.getByRole('combobox', { name: 'Откуда' });
  await expect(start).toHaveValue('A');
  await expect(page.getByRole('combobox', { name: 'Раздел Википедии' })).toHaveValue('en');
  await start.fill('Al');
  await expect(page.getByRole('option', { name: 'Alpha', exact: true })).toBeVisible();
  await start.press('ArrowDown');
  await expect(start).toHaveAttribute('aria-activedescendant', 'option-01-0');
  await start.press('Enter');
  await expect(start).toHaveValue('Alpha');
  await expect(start).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Поменять статьи местами' }).click();
  await expect(start).toHaveValue('D');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'test-results/mobile-360.png', fullPage: true });
});

test('optional langlinks mode renders language-specific article links', async ({ page, context }) => {
  await mockApi(context);
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.setLineDash;
    Object.defineProperty(window, 'threadDashes', { value: [] });
    CanvasRenderingContext2D.prototype.setLineDash = function(segments) {
      if (segments.length) Reflect.get(window, 'threadDashes').push(segments);
      original.call(this, segments);
    };
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?from=A&to=D&lang=ru&mode=multilingual');
  await page.getByRole('button', { name: 'Найти нить' }).click();
  await expect(page.locator('.path-step')).toHaveCount(2);
  await expect(page.locator('.path-step h3 a').last()).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/D');
  await expect(page.locator('.transition-label')).toHaveText('межъязыковой переход');
  await expect(page.locator('.stage')).toHaveAttribute('data-phase', 'done');
  expect(await page.evaluate(() => Reflect.get(window, 'threadDashes'))).toContainEqual([8, 7]);
});

test('PWA shell reloads offline after its first online load', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:4173/');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })); });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Найти нить' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('400 16px "Unbounded"'))).toBe(true);
  } finally { await context.close(); }
});
