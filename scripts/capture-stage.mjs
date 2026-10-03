// Production preview must be running: VITE_BASE_PATH=/ npm run build && npm run preview -- --host 127.0.0.1.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const browser=await chromium.launch({args:['--no-sandbox']});
await mkdir('docs/screenshots',{recursive:true});
try{
for(const [width,theme,state] of [[360,'dark','found'],[360,'light','found'],[1280,'dark','found'],[1280,'light','found'],[1280,'dark','not-found'],[1280,'light','not-found']]){
const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
await context.addInitScript(t=>localStorage.setItem('perehody-theme',t),theme);
await context.route('https://*.wikipedia.org/**',async route=>{
if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});return;}
const q=new URL(route.request().url()).searchParams,graph=state==='not-found'?{}:{'Москва':['Наука'],'Наука':['Юрий Гагарин'],'Юрий Гагарин':[]};
await route.fulfill({json:route.request().url().includes('/summary/')?{description:'Статья в свободной энциклопедии'}:{query:{pages:(q.get('titles')??'').split('|').map(title=>({title,ns:0,length:100,links:(graph[title]??[]).map(title=>({title,ns:0})),linkshere:Object.entries(graph).filter(([,links])=>links.includes(title)).map(([title])=>({title,ns:0}))}))}}});
});
const page=await context.newPage();await page.goto(process.env.PREVIEW_URL??'http://127.0.0.1:4173/');
await page.getByLabel('Откуда',{exact:true}).fill('Москва');await page.getByLabel('Куда',{exact:true}).fill('Юрий Гагарин');await page.getByRole('button',{name:'Найти нить',exact:true}).click();if(state==='found'){await page.locator('.stage[data-phase=done]').waitFor();await page.locator('.path-list').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelectorAll('.summary-skeleton').length===0);}else{await page.getByText('В пределах лимитов путь не найден.',{exact:true}).waitFor();}await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`docs/screenshots/${state}-${width}-${theme}.png`,fullPage:true});await context.close();
}
}finally{await browser.close();}
