import { useEffect, useRef, useState } from 'react';
import type { ThreadProgress } from '../lib/bfs.worker';
export interface RouteSearchState {
 searching:boolean;progress:ThreadProgress|null;explanation:string;canResume:boolean;onCancel():void;onResume():void;
}
export function RouteSearchStatus({searching,progress,explanation,canResume,onCancel,onResume}:RouteSearchState){
 const latest=useRef(progress);latest.current=progress;const [summary,setSummary]=useState('');
 useEffect(()=>{
  setSummary('');if(!searching)return;
  const timer=window.setInterval(()=>{const value=latest.current;if(value)setSummary(`Проверено статей: ${value.visited}. Глубина: ${value.depth}.`);},2000);
  return ()=>window.clearInterval(timer);
 },[searching]);
 return <section className="route-search-status" aria-label="Улучшение маршрута">
  <div role="status" aria-atomic="true"><p>{searching?'Маршрут найден, ищем короче':explanation}</p>{searching&&summary&&<p className="route-search-progress">{summary}</p>}</div>
  {searching?<button type="button" onClick={onCancel}>Остановить</button>:canResume?<button type="button" onClick={onResume}>Искать короче</button>:null}
 </section>;
}
