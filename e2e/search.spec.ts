import { expect, test, type BrowserContext, type Page } from '@playwright/test';
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
    const titles = params.get('generator') === 'links' ? edges[params.get('titles') ?? ''] ?? [] : (params.get('titles') ?? '').split('|');
    const pages = titles.map(title => ({
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
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  await expect(page.locator('.route-strip')).toHaveCount(3);
  await expect(page.locator('.route-strip a')).toHaveText(['A ↗', 'B ↗', 'D ↗']);
  await expect(page.locator('.route-strip a').last()).toHaveAttribute('href', 'https://ru.wikipedia.org/wiki/D');
  expect(new URL(page.url()).searchParams.get('from')).toBe('A');
  await expect(page.getByRole('heading', { name: 'Связь найдена' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('cancels the active worker and can start another search', async ({ page, context }) => {
  await mockApi(context, 'slow');
  await page.goto('/?from=A&to=D&lang=ru');
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  await page.getByRole('button', { name: 'Остановить' }).click();
  await expect(page.getByRole('alert')).toContainText('Поиск остановлен.');
  await expect(page.getByRole('button', { name: 'Столкнуть' })).toBeVisible();
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  await expect(page.locator('.route-strip')).toHaveCount(3);
});

test('shows API and missing endpoint errors', async ({ page, context }) => {
  await mockApi(context, 'error');
  await page.goto('/?from=A&to=D&lang=ru');
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  await expect(page.getByRole('alert')).toContainText('HTTP 400');
  await context.unrouteAll({ behavior: 'wait' });
  await mockApi(context);
  await page.getByRole('combobox', { name: 'Откуда' }).fill('Missing');
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  await expect(page.getByRole('alert')).toContainText('не найдена');
});

test('shared query is restored; autocomplete is operable with the keyboard at 360px', async ({ page, context }) => {
  await mockApi(context);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/?from=A&to=D&lang=en');
  const start = page.getByRole('combobox', { name: 'Откуда' });
  await expect(start).toHaveValue('A');
  await expect(page.locator('[data-side=from] .language-badge')).toHaveText('EN');
  await start.fill('Al');
  await expect(page.getByRole('option', { name: 'Alpha RU', exact: true })).toBeVisible();
  await start.press('ArrowDown');
  await expect(start).toHaveAttribute('aria-activedescendant', 'article-01-option-0');
  await start.press('Enter');
  await expect(start).toHaveValue('Alpha');
  await expect(start).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Поменять статьи местами' }).click();
  await expect(start).toHaveValue('D');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'test-results/mobile-360.png', fullPage: true });
});

test('automatic cross-language URLs render actual language links and a dashed join', async ({ page, context }) => {
  await mockApi(context);
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Откуда' }).fill('https://ru.wikipedia.org/wiki/A');
  await page.getByRole('combobox', { name: 'Куда', exact: true }).fill('https://en.wikipedia.org/wiki/D');
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  await expect(page.locator('.route-strip')).toHaveCount(2);
  await expect(page.locator('.route-strip a').last()).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/D');
  await expect(page.locator('.route-language-turn')).toHaveText('RU → EN / смена языка');
  await expect(page.locator('.route-connectors path[data-from="1"][data-to="2"]')).toHaveAttribute('stroke-dasharray', '9 7');
  expect(new URL(page.url()).searchParams.get('mode')).toBe('multilingual');
});

// The worker boundary is controlled only for lifecycle scenarios that would otherwise
// require exhausting production budgets or delivering a message after termination.
async function controlledWorkers(page: Page) {
  await page.addInitScript(() => {
    const instances: object[] = [];
    Reflect.set(window, 'searchWorkers', instances);
    class ControlledWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null;
      input: unknown;
      terminated = false;
      constructor() { instances.push(this); }
      postMessage(input: unknown) { this.input = input; }
      terminate() { this.terminated = true; }
      emit(data: unknown) { this.onmessage?.({ data }); }
    }
    Reflect.set(window, 'Worker', ControlledWorker);
  });
}
async function emit(page: Page, index: number, message: unknown) {
  await page.evaluate(({ index, message }) => Reflect.get(window, 'searchWorkers')[index].emit(message), { index, message });
}
async function workerInput(page: Page, index: number) {
  return page.evaluate(index => Reflect.get(window, 'searchWorkers')[index].input, index);
}
const resume = {
  start: '["ru","A"]', end: '["en","D"]',
  forward: [{ title: '["ru","A"]', parent: null, depth: 0 }],
  backward: [{ title: '["en","D"]', parent: null, depth: 0 }],
  expandedForward: [], expandedBackward: [], roundIndex: 0, depth: 0,
  side: 'forward', pending: ['["ru","A"]'], pendingIndex: 0, bestMeeting: null, fallbackDone: false,
};

test('swapping endpoints preserves the selected languages in the worker input', async ({ page }) => {
  await controlledWorkers(page);
  await page.goto('/?from=https://ru.wikipedia.org/wiki/A&to=https://en.wikipedia.org/wiki/D&lang=ru&mode=multilingual');
  await page.getByRole('button', { name: 'Поменять статьи местами' }).click();
  await expect(page.locator('[data-side=from] .language-badge')).toHaveText('EN');
  await expect(page.locator('[data-side=to] .language-badge')).toHaveText('RU');
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  expect(await workerInput(page, 0)).toMatchObject({ from: 'D', to: 'A', lang: 'en', toLang: 'ru', multilingual: true });
});

test('result copies searched endpoints and new pair restores a fresh example with focus', async ({ page }) => {
  await controlledWorkers(page);
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { Reflect.set(window, 'copiedQuery', text); } } }));
  await page.goto('/?from=A&to=D&lang=ru');
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  await emit(page, 0, { type: 'found', path: ['A', 'B', 'D'] });
  await expect(page.locator('#route-heading')).toBeFocused();
  // The location may be edited independently; share must use the completed query.
  await page.evaluate(() => history.replaceState(null, '', '?from=Pending&to=Edit&lang=en'));
  await page.getByRole('button', { name: 'Поделиться' }).click();
  const copied = new URL(await page.evaluate(() => Reflect.get(window, 'copiedQuery')));
  expect(copied.searchParams.get('from')).toBe('A');
  expect(copied.searchParams.get('to')).toBe('D');
  expect(copied.searchParams.get('lang')).toBe('ru');
  await expect(page.locator('.ribbon-actions [role=status]')).toContainText('Ссылка скопирована');
  await page.getByRole('button', { name: 'Новая пара' }).click();
  await expect(page.getByRole('combobox', { name: 'Откуда' })).toHaveValue('Осьминоги');
  await expect(page.getByRole('combobox', { name: 'Куда', exact: true })).toHaveValue('Bauhaus');
  await expect(page.getByRole('combobox', { name: 'Откуда' })).toBeFocused();
  expect(new URL(page.url()).search).toBe('');
});

test('failed clipboard write is announced while the route remains available', async ({ page }) => {
  await controlledWorkers(page);
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } } }));
  await page.goto('/?from=A&to=D&lang=ru');
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  await emit(page, 0, { type: 'found', path: ['A', 'B', 'D'] });
  await page.getByRole('button', { name: 'Поделиться' }).click();
  await expect(page.locator('.ribbon-actions [role=status]')).toContainText('Не удалось скопировать');
  await expect(page.locator('.route-strip')).toHaveCount(3);
});

test('cancellation followed by a fresh query ignores late messages from the old worker', async ({ page }) => {
  await controlledWorkers(page);
  await page.goto('/?from=A&to=D&lang=ru');
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  await page.getByRole('button', { name: 'Остановить' }).click();
  await page.getByRole('combobox', { name: 'Откуда' }).fill('Fresh');
  await page.getByRole('combobox', { name: 'Куда', exact: true }).fill('End');
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  expect(await workerInput(page, 1)).toMatchObject({ from: 'Fresh', to: 'End', lang: 'ru', toLang: 'ru', multilingual: false });
  await emit(page, 0, { type: 'found', path: ['Old', 'Stale'] });
  await emit(page, 0, { type: 'error', message: 'Stale error' });
  await expect(page.getByRole('button', { name: 'Остановить' })).toBeVisible();
  await expect(page.locator('.route-list')).toHaveCount(0);
  await expect(page.getByRole('alert')).toBeEmpty();
  await emit(page, 1, { type: 'found', path: ['Fresh', 'End'] });
  await expect(page.locator('.route-strip a')).toHaveText(['Fresh ↗', 'End ↗']);
});

test('a verified candidate survives exhausted improvement and resume preserves its searched languages', async ({ page }) => {
  await controlledWorkers(page);
  await page.goto('/?from=https://ru.wikipedia.org/wiki/A&to=https://en.wikipedia.org/wiki/D');
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  await emit(page, 0, { type: 'candidate', path: ['["ru","A"]', '["en","D"]'] });
  await expect(page.locator('.route-list')).toHaveCount(1);
  await emit(page, 0, { type: 'notFound', reason: 'timeout', limitsHit: ['time'], visited: 41, depth: 2, resumeState: resume });
  await expect(page.getByRole('heading', { name: 'Путь не найден' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Искать короче' }).click();
  expect(await workerInput(page, 1)).toMatchObject({ from: 'A', to: 'D', lang: 'ru', toLang: 'en', multilingual: true, resumeState: resume });
  await expect(page.getByRole('button', { name: 'Остановить' })).toBeVisible();
  await expect(page.locator('.route-strip a').last()).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/D');
});

test('result arrival does not steal an active link; recovery focuses the first field', async ({ page }) => {
  await controlledWorkers(page);
  await page.goto('/?from=A&to=D&lang=ru');
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  await page.evaluate(() => {
    const link = document.createElement('a'); link.href = '#'; link.id = 'active-reader-link'; link.textContent = 'Reader link';
    document.body.append(link); link.focus();
  });
  await emit(page, 0, { type: 'found', path: ['A', 'D'] });
  await expect(page.locator('#active-reader-link')).toBeFocused();
  await page.getByRole('button', { name: 'Новая пара' }).click();
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  await emit(page, 1, { type: 'error', message: 'Network failed' });
  await expect(page.getByRole('alert')).toHaveCount(1);
  await page.getByRole('button', { name: 'Изменить статьи', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Откуда' })).toBeFocused();
  await expect(page.getByRole('alert')).toBeEmpty();
});

test('PWA shell reloads offline after its first online load', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:4173/');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })); });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Столкнуть' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('400 16px "Prata"'))).toBe(true);
    const octopus = page.locator('.octopus-cutout');
    await expect(octopus).toBeVisible();
    expect(await octopus.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  } finally { await context.close(); }
});

test('tabbing through the edit button closes the field editor and its listbox', async ({ page, context }) => {
  await mockApi(context); await page.goto('/');
  const from = page.getByRole('combobox', { name: 'Откуда' });
  await from.fill('Al'); await expect(page.getByRole('option', { name: 'Alpha RU', exact: true })).toBeVisible();
  await from.press('Tab'); await expect(page.getByRole('button', { name: 'Изменить: Откуда' })).toBeFocused();
  await page.keyboard.press('Tab');
  // Chromium also focuses the scrollable listbox; continue until leaving the wrapper.
  if (await page.getByRole('listbox', { name: 'Варианты: Откуда' }).evaluate(el => el === document.activeElement)) await page.keyboard.press('Tab');
  await expect(page.locator('[data-side=from] :focus')).toHaveCount(0);
  await expect(page.locator('[data-side=from]')).not.toHaveClass(/is-editing/);
  await expect(from).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('listbox', { name: 'Варианты: Откуда' })).toHaveCount(0);
});

test('late autocomplete response cannot replace newer text or select a stale article', async ({ page, context }) => {
  let oldStarted = false;
  await context.route('https://*.wikipedia.org/**', async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }); return; }
    const q = new URL(route.request().url()).searchParams;
    const text = q.get('srsearch');
    if (text === 'Old') { oldStarted = true; await new Promise(resolve => setTimeout(resolve, 600)); }
    await route.fulfill({ json: { query: { search: [{ title: text === 'Old' ? 'Stale article' : 'Fresh article' }] } }, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('/'); const from = page.getByRole('combobox', { name: 'Откуда' });
  await from.fill('Old'); await expect.poll(() => oldStarted).toBe(true);
  await from.fill('Fresh');
  await expect(page.getByRole('option', { name: 'Fresh article RU', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: /Stale article/ })).toHaveCount(0);
  await from.press('ArrowDown'); await from.press('Enter');
  await expect(from).toHaveValue('Fresh article');
  await expect(page.locator('[data-side=from] .language-badge').first()).toHaveText('RU');
});

test('autocomplete retains an available language when the other sections fail', async ({ page, context }) => {
  await context.route('https://*.wikipedia.org/**', async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }); return; }
    const lang = new URL(route.request().url()).hostname.split('.')[0];
    await route.fulfill({ status: lang === 'en' ? 200 : 400, json: lang === 'en' ? { query: { search: [{ title: 'Available article' }] } } : { error: { code: 'failed' } }, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('/'); const from = page.getByRole('combobox', { name: 'Откуда' }); await from.fill('Available');
  await expect(page.getByRole('option', { name: 'Available article EN', exact: true })).toBeVisible();
  await expect(page.getByText('Подсказки недоступны.', { exact: false })).toHaveCount(0);
  await from.press('ArrowDown'); await from.press('Enter');
  await expect(from).toHaveValue('Available article');
  await expect(page.locator('[data-side=from] .language-badge').first()).toHaveText('EN');
});

test('keyboard suggestions reveal the last option and wrap without scrolling the page', async ({ page, context }) => {
  await page.setViewportSize({ width: 360, height: 900 }); await mockApi(context); await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const input = page.getByRole('combobox', { name: 'Откуда' }); await input.fill('Al');
  await expect(page.getByRole('option')).toHaveCount(8);
  const pageScroll = await page.evaluate(() => window.scrollY);
  const fullyVisible = async () => {
    await expect(input).toBeFocused();
    await expect.poll(() => input.evaluate(element => {
      const list = document.getElementById(element.getAttribute('aria-controls')!);
      const option = document.getElementById(element.getAttribute('aria-activedescendant')!);
      if (!list || !option) return false;
      const viewport = list.getBoundingClientRect(), row = option.getBoundingClientRect();
      return row.top >= viewport.top + list.clientTop - .5 && row.bottom <= viewport.top + list.clientTop + list.clientHeight + .5;
    })).toBe(true);
    expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);
  };
  for (let index = 0; index < 8; index++) await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', 'article-01-option-7'); await fullyVisible();
  await input.press('ArrowDown'); await expect(input).toHaveAttribute('aria-activedescendant', 'article-01-option-0'); await fullyVisible();
  await input.press('ArrowUp'); await expect(input).toHaveAttribute('aria-activedescendant', 'article-01-option-7'); await fullyVisible();
  await input.press('Escape'); await expect(input).toHaveAttribute('aria-expanded', 'false');
  await input.press('ArrowUp'); await expect(input).toHaveAttribute('aria-activedescendant', 'article-01-option-7'); await fullyVisible();
});


test('found route edits its searched pair and preserves languages after resumed pending edits', async ({ page }) => {
  await controlledWorkers(page);
  await page.goto('/?from=https://en.wikipedia.org/wiki/Alpha&to=https://de.wikipedia.org/wiki/Beta');
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  await emit(page, 0, { type: 'notFound', reason: 'depth', visited: 5, depth: 1, resumeState: resume });
  await page.getByRole('combobox', { name: 'Откуда' }).fill('https://fr.wikipedia.org/wiki/Pending');
  await page.getByRole('button', { name: 'Искать глубже' }).click();
  await emit(page, 1, { type: 'found', path: ['["en","Alpha"]', '["de","Beta"]'] });
  await page.getByRole('button', { name: 'Изменить статьи', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Откуда' })).toHaveValue('Alpha');
  await expect(page.getByRole('combobox', { name: 'Куда', exact: true })).toHaveValue('Beta');
  await expect(page.locator('[data-side=from] .language-badge')).toHaveText('EN');
  await expect(page.locator('[data-side=to] .language-badge')).toHaveText('DE');
  await expect(page.getByRole('combobox', { name: 'Откуда' })).toBeFocused();
});

test('progressive suggestions remain usable while the second section is pending and stay anchored', async ({ page, context }) => {
  let releaseSecond!: () => void;
  const second = new Promise<void>(resolve => { releaseSecond = resolve; });
  await context.route('https://*.wikipedia.org/w/api.php?*', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
    const url = new URL(route.request().url());
    if (url.hostname === 'en.wikipedia.org') await second;
    await route.fulfill({ json: { query: { search: [{ title: url.hostname === 'ru.wikipedia.org' ? 'Первая статья' : 'Later article' }] } } });
  });
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/?from=Long%20article%20title%20with%20many%20words&to=D&lang=ru');
  const input = page.getByRole('combobox', { name: 'Откуда' });
  await input.fill('Очень длинное название статьи для проверки расположения списка');
  await expect(page.getByRole('option', { name: 'Первая статья RU' })).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(1);
  const anchored = await page.locator('[data-side=from]').evaluate(field => {
    const control = field.querySelector('.article-editor')!.getBoundingClientRect();
    const list = field.querySelector('.suggestions')!.getBoundingClientRect();
    return list.top >= control.bottom && list.top - control.bottom < 16;
  });
  expect(anchored).toBe(true);
  await input.press('ArrowDown'); await input.press('Enter');
  await expect(input).toHaveValue('Первая статья');
  releaseSecond();
  await expect(input).toHaveAttribute('aria-expanded', 'false');
});

test('malformed worker route shows accessible reload recovery', async ({ page }) => {
  await controlledWorkers(page);
  await page.goto('/?from=A&to=D&lang=ru&mode=multilingual');
  await page.getByRole('button', { name: 'Столкнуть' }).click();
  await emit(page, 0, { type: 'found', path: ['invalid route key'] });
  await expect(page.getByRole('alert')).toContainText('Не удалось показать страницу');
  await expect(page.getByRole('button', { name: 'Обновить страницу' })).toBeVisible();
  await page.getByRole('button', { name: 'Обновить страницу' }).click();
  await expect(page.getByRole('combobox', { name: 'Откуда' })).toHaveValue('https://ru.wikipedia.org/wiki/A');
  await expect(page.locator('[data-side=from] .article-display')).toHaveText('A');
  await expect(page.locator('[data-side=from] .language-badge')).toHaveText('RU');
});
