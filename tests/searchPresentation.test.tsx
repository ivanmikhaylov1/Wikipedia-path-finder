import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchStatus } from '../src/components/SearchStatus';
import { CollisionStage } from '../src/components/CollisionStage';
it('describes timeout as an unfinished search rather than absence of a path',()=>{
 const html=renderToStaticMarkup(<SearchStatus searching={false} error="" canResume onResume={()=>{}} notFound={{limitsHit:'time',visited:15405,depth:3}}/>);
 expect(html).toContain('Не удалось найти маршрут за отведённое время');
 expect(html).not.toContain('<h2>Путь не найден</h2>');
});
it('labels the two frontier sizes as queued articles',()=>{
 const html=renderToStaticMarkup(<CollisionStage searching searchId={1} progress={{visited:10,depth:2,frontierA:4,frontierB:3}}/>);
 expect(html).toContain('В очереди от начала: 4');expect(html).toContain('В очереди от конца: 3');
});
it('calls graph vertices discovered articles rather than claiming that all were expanded',()=>{
 const html=renderToStaticMarkup(<CollisionStage searching searchId={2} progress={{visited:15405,depth:3,frontierA:15000,frontierB:100}}/>);
 expect(html).toContain('Обнаружено статей: 15405');expect(html).not.toContain('Проверено статей');
});
