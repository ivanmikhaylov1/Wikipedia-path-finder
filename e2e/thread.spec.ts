import { expect, test } from '@playwright/test';
import { mockWiki, PATH } from './wikiMock';

test('not found and language validation explain how to recover', async ({page, context}) => {
  await mockWiki(context, 'notFound'); await page.goto('/');
  await page.getByLabel('Откуда', {exact:true}).fill(PATH[0]);
  await page.getByLabel('Куда', {exact:true}).fill(PATH.at(-1)!);
  await page.getByRole('button', {name:'Найти нить',exact:true}).click();
  await expect(page.getByText('В пределах лимитов путь не найден.',{exact:true})).toBeVisible();
  await expect(page.locator('.path-step')).toHaveCount(0);
  await page.getByLabel('Откуда', {exact:true}).fill('https://ru.wikipedia.org/wiki/A');
  await page.getByLabel('Куда', {exact:true}).fill('https://en.wikipedia.org/wiki/D');
  await page.getByRole('button', {name:'Найти нить',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Выберите обе из одного');
});

for(const count of [2,12])test(`scene handles ${count} steps and stops its ticker at rest`,async({page,context})=>{
  await page.addInitScript(()=>{ const original=window.requestAnimationFrame.bind(window); let frames=0; Object.defineProperty(window,'threadFrames',{get:()=>frames}); window.requestAnimationFrame=callback=>original(time=>{frames++;callback(time);}); });
  await page.emulateMedia({reducedMotion:'reduce'});
  const graph=Array.from({length:count},(_,i)=>`Article ${i}`);
  await context.route('https://*.wikipedia.org/**',async route=>{
    if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});return;}
    const q=new URL(route.request().url()).searchParams;
    await route.fulfill({json:route.request().url().includes('/summary/')?{description:'Статья'}:{query:{pages:(q.get('titles')??'').split('|').map(title=>{const i=graph.indexOf(title);return {title,ns:0,length:100,links:i>=0&&i<count-1?[{title:graph[i+1],ns:0}]:[],linkshere:i>0?[{title:graph[i-1],ns:0}]:[]};})}}});
  });
  await page.goto('/');
  await page.getByLabel('Откуда',{exact:true}).fill(graph[0]);await page.getByLabel('Куда',{exact:true}).fill(graph.at(-1)!);
  await page.getByRole('button',{name:'Найти нить',exact:true}).click();
  await expect(page.locator('.stage')).toHaveAttribute('data-phase','done');
  await expect(page.locator('.path-step.is-lit')).toHaveCount(count);
  await page.evaluate(()=>document.fonts.ready);
  // Let observers settle, then assert no continuous RAF loop in the done phase.
  await page.waitForTimeout(100);
  const before=await page.evaluate(()=>Reflect.get(window,'threadFrames'));
  await page.waitForTimeout(150);
  expect(await page.evaluate(()=>Reflect.get(window,'threadFrames'))).toBe(before);
});

test('hidden tab pauses the animation and cancellation resets the scene',async({page,context})=>{
  await mockWiki(context,'slow');await page.goto('/');
  await page.getByLabel('Откуда',{exact:true}).fill(PATH[0]);await page.getByLabel('Куда',{exact:true}).fill(PATH.at(-1)!);
  await page.getByRole('button',{name:'Найти нить',exact:true}).click();
  await expect(page.locator('.stage')).toHaveAttribute('data-phase','search');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(2600);
  await expect(page.locator('.stage')).toHaveAttribute('data-phase','search');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('.stage')).toHaveAttribute('data-phase','done');
  await page.getByRole('button',{name:'Найти нить',exact:true}).click();
  await page.getByRole('button',{name:'Остановить',exact:true}).click();
  await expect(page.locator('.stage')).toHaveAttribute('data-phase','idle');
  await expect(page.locator('.path-step')).toHaveCount(0);
  await expect(page.locator('.stage-counters strong')).toHaveText(['0','0']);
});
