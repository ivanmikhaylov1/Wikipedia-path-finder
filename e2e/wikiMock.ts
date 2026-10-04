import type { BrowserContext, Page } from '@playwright/test';
export const PATH = ['Москва', 'Наука', 'Метод', 'Логика', 'Философия'];
export interface WikiNode { title: string; lang: string }
export type MockMode = 'found' | 'notFound' | 'missing' | 'slow' | 'long' | 'timeout';
export const EXAMPLE_ROUTE: WikiNode[] = [
  { title: 'Осьминоги', lang: 'ru' }, { title: 'Зоология', lang: 'ru' },
  { title: 'Наука', lang: 'ru' }, { title: 'Science', lang: 'en' },
  { title: 'Design', lang: 'en' }, { title: 'Bauhaus', lang: 'en' },
];
export async function mockWiki(context: BrowserContext, mode: MockMode = 'found', nodes: WikiNode[] = PATH.map(title => ({title, lang: 'ru'}))) {
  let slow = mode === 'slow' || mode === 'long' || mode === 'timeout';
  const key = (node: WikiNode) => JSON.stringify([node.lang, node.title]);
  const graph = new Map(nodes.map((node, index) => [key(node), mode === 'notFound' ? [] : nodes[index + 1] ? [nodes[index + 1]] : []]));
  await context.route('https://*.wikipedia.org/**', async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}}); return; }
    const url = new URL(route.request().url()), q = url.searchParams, lang = url.hostname.split('.')[0];
    if (slow && (mode === 'timeout' ? (q.get('prop')?.includes('links') || q.get('generator')==='links') : q.get('redirects'))) await new Promise(resolve => setTimeout(resolve, mode === 'long' ? 1600 : 700));
    let data;
    if (url.pathname.includes('/summary/')) data = { description: 'Описание статьи из свободной энциклопедии' };
    else if (q.get('list') === 'search') data = { query: { search: [{title: lang === 'ru' ? 'Москва' : 'Moscow'}, {title: lang === 'ru' ? 'Московская область' : 'Moscow Oblast'}] } };
    else if (q.get('action') === 'parse') data = { parse: { text: '<div class="mw-parser-output"><p>Без ссылок</p></div>' } };
    else if (q.get('list') === 'backlinks') data = { query: { backlinks: nodes.filter(node => node.lang === lang && graph.get(key(node))?.some(next => next.lang === lang && next.title === q.get('bltitle'))).map(node => ({ title: node.title, ns: 0 })) } };
    else if (q.get('generator') === 'links') data = { query: { pages: (graph.get(key({title:q.get('titles') ?? '',lang})) ?? []).filter(node=>node.lang===lang).map(node=>({title:node.title,ns:0,...(mode==='missing'?{missing:true}:{})})) } };
    else data = { query: { pages: (q.get('titles') ?? '').split('|').map(title => ({
      title, ns: 0, length: 100, ...(mode === 'missing' ? { missing: true } : {}),
      links: (graph.get(key({title, lang})) ?? []).filter(node => node.lang === lang).map(node => ({ title: node.title, ns: 0 })),
      linkshere: nodes.filter(node => node.lang === lang && graph.get(key(node))?.some(next => next.lang === lang && next.title === title)).map(node => ({title: node.title, ns: 0})),
      langlinks: nodes.filter(node => node.lang !== lang && (graph.get(key({title, lang}))?.some(next => key(next) === key(node)) || graph.get(key(node))?.some(next => next.lang === lang && next.title === title))).map(node => ({lang: node.lang, title: node.title})),
    })) } };
    await route.fulfill({ json: data, headers: { 'access-control-allow-origin': '*' } }).catch(() => {});
  });
  return { release: () => { slow = false; } };
}
// Only changes limits at the Worker boundary; the real source and BFS run unchanged.
export async function searchBudget(page: Page, limits: Record<string, number>) {
  await page.addInitScript(limits => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message: Parameters<Worker['postMessage']>[0]) {
        super.postMessage(message?.limits ? { ...message, limits: { ...message.limits, ...limits } } : message);
      }
    };
  }, limits);
}
export async function watchFrames(page: Page) {
  await page.addInitScript(() => {
    const original = requestAnimationFrame.bind(window); let frames = 0;
    Object.defineProperty(window, 'collisionFrames', { get: () => frames });
    window.requestAnimationFrame = callback => original(time => { frames++; callback(time); });
  });
}
export async function expectRest(page: Page) {
  const { expect } = await import('@playwright/test');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(850); // Beyond the finite 750/700ms entrance animation.
  const frames = await page.evaluate(() => Reflect.get(window, 'collisionFrames'));
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => Reflect.get(window, 'collisionFrames'))).toBe(frames);
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
}
