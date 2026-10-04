import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function controlled(page:Page){
 await page.addInitScript(()=>{
  const workers:Array<{onmessage:((event:{data:unknown})=>void)|null;postMessage(message:unknown):void;terminate():void;message?:unknown;stopped:boolean}>=[];
  Reflect.set(window,'anytimeWorkers',workers);
  Reflect.set(window,'Worker',class{
   onmessage:((event:{data:unknown})=>void)|null=null;stopped=false;message?:unknown;
   constructor(){workers.push(this);}
   postMessage(message:unknown){this.message=message;}
   terminate(){this.stopped=true;}
  });
 });
 await page.goto('/?from=A&to=D&lang=en');await page.getByRole('button',{name:'Столкнуть'}).click();
}
async function emit(page:Page,data:unknown,index=0){await page.evaluate(({data,index})=>Reflect.get(window,'anytimeWorkers')[index].onmessage({data}),{data,index});}
const route=['A','B','C','D'];
const resumeState={kind:'anytime',state:{version:1,from:'A',to:'D',lang:'en',forwardOnly:false,start:{title:'A',lang:'en'},end:{title:'D',lang:'en'},graph:{edges:[]},strategies:{completeOut:[],completeIn:[],probed:[]},best:route}};
test('shows a verified route while searching and preserves it when stopped',async({page})=>{
 await controlled(page);await emit(page,{type:'candidate',path:route});
 await expect(page.getByRole('heading',{name:'Связь найдена'})).toBeVisible();
 await expect(page.getByText('Маршрут найден, ищем короче',{exact:true})).toBeVisible();
 await expect(page.locator('.route-strip a')).toHaveText(['A ↗','B ↗','C ↗','D ↗']);
 await page.getByRole('button',{name:'Остановить',exact:true}).click();
 await expect(page.getByText('Улучшение остановлено. Найденный маршрут сохранён.')).toBeVisible();
 await expect(page.locator('.route-strip a')).toHaveCount(4);
 await emit(page,{type:'candidate',path:['A','D']});await expect(page.locator('.route-strip a')).toHaveCount(4);
});
test('only accepts shorter replacements and preserves keyboard focus on a surviving article link',async({page})=>{
 await controlled(page);await emit(page,{type:'candidate',path:route});
 await page.locator('.route-strip a').first().focus();
 await emit(page,{type:'candidate',path:['A','X','C','D']});await expect(page.locator('.route-strip a').nth(1)).toHaveText('B ↗');
 await emit(page,{type:'candidate',path:['A','B','D']});await expect(page.locator('.route-strip a')).toHaveCount(3);
 await expect(page.locator('.route-strip a').first()).toBeFocused();
});
for(const reason of ['budget','timeout','error','improvement'])test(`retains the route after ${reason} and resumes without hiding it`,async({page})=>{
 await controlled(page);await emit(page,{type:'candidate',path:route});
 await emit(page,reason==='error'?{type:'error',message:'Disconnected'}:{type:'found',path:route,exact:false,reason,resumeState});
 await expect(page.locator('.route-strip a')).toHaveCount(4);
 await expect(page.getByText('Найденный маршрут сохранён.',{exact:false})).toBeVisible();
 if(reason!=='error'){
  await page.getByRole('button',{name:'Искать короче',exact:true}).click();
  await expect(page.locator('.route-strip a')).toHaveCount(4);await expect(page.getByText('Маршрут найден, ищем короче',{exact:true})).toBeVisible();
  await emit(page,{type:'candidate',path:['A','D']},0);await expect(page.locator('.route-strip a')).toHaveCount(4);
  await emit(page,{type:'candidate',path:['A','B','D']},1);await expect(page.locator('.route-strip a')).toHaveCount(3);
 }
});
test('editing an early result terminates improvement and stale messages cannot restore it',async({page})=>{
 await controlled(page);await emit(page,{type:'candidate',path:route});
 await page.getByRole('button',{name:'Изменить статьи',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Откуда'})).toHaveValue('A');
 await expect(page.getByRole('combobox',{name:'Откуда'})).toBeFocused();
 await emit(page,{type:'found',path:route});await expect(page.locator('.route-strip')).toHaveCount(0);
});
test('early route controls are accessible on mobile with reduced motion',async({page})=>{
 await page.setViewportSize({width:360,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 await controlled(page);await emit(page,{type:'candidate',path:route});
 await expect(page.getByRole('button',{name:'Остановить',exact:true})).toBeVisible();
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
