import type { BrowserContext } from '@playwright/test';
export const PATH = ['Москва', 'Наука', 'Метод', 'Логика', 'Философия'];
export type MockMode = 'found' | 'notFound' | 'missing' | 'slow' | 'long';
export async function mockWiki(context: BrowserContext, mode: MockMode = 'found') {
  const graph: Record<string, string[]> = mode === 'notFound' ? { Москва: [], Философия: [] }
    : Object.fromEntries(PATH.map((title, i) => [title, PATH[i + 1] ? [PATH[i + 1]] : []]));
  let slow = mode === 'slow' || mode === 'long';
  await context.route('https://*.wikipedia.org/**', async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}}); return; }
    const url = new URL(route.request().url()), q = url.searchParams;
    if (slow && q.get('redirects')) await new Promise(resolve => setTimeout(resolve, mode === 'long' ? 1600 : 700));
    let data;
    if (url.pathname.includes('/summary/')) data = { description: 'Описание статьи из свободной энциклопедии' };
    else if (q.get('list') === 'search') data = { query: { search: [{title:'Москва'}, {title:'Московская область'}] } };
    else if (q.get('action') === 'parse') data = { parse: { text: '<div class="mw-parser-output"><p>Без ссылок</p></div>' } };
    else if (q.get('list') === 'backlinks') data = { query: { backlinks: Object.entries(graph).filter(([, links]) => links.includes(q.get('bltitle') ?? '')).map(([title]) => ({ title, ns: 0 })) } };
    else data = { query: { pages: (q.get('titles') ?? '').split('|').map(title => ({ title, ns: 0, length: 100, linkshere: Object.entries(graph).filter(([,links]) => links.includes(title)).map(([title]) => ({title,ns:0})), ...(mode === 'missing' ? { missing: true } : {}), links: (graph[title] ?? []).map(title => ({ title, ns: 0 })) })) } };
    await route.fulfill({ json: data, headers: { 'access-control-allow-origin': '*' } }).catch(() => {});
  });
  return { release: () => { slow = false; } };
}
