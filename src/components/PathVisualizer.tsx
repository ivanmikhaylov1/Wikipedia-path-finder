import { useMemo, useState } from 'react';
import { articleFromKey } from '../lib/multilingualLinkSource';
import { PathSteps } from './PathSteps';
import { ThreadStage } from './ThreadStage';
import type { ThreadProgress } from '../lib/bfs.worker';
import type { Phase } from '../lib/threadMotion';

export function PathVisualizer({ path, lang, multilingual = false, approximate = false, searchId, searching, progress, from, to, onPhase }: {
  path: string[] | null; lang: string; multilingual?: boolean; approximate?: boolean; searchId: number; searching: boolean;
  progress: ThreadProgress | null; from: string; to: string; onPhase: (phase: Phase) => void;
}) {
  const titles = useMemo(() => path?.map(key => multilingual ? articleFromKey(key).title : key) ?? null, [path, multilingual]);
  const [litCount, setLitCount] = useState(0);
  return <section className="path-section page-width" id="route" aria-label="Карта связей">
    <ThreadStage searchId={searchId} searching={searching} path={titles} progress={progress} from={from} to={to} onLitCount={setLitCount} onPhase={onPhase} />
    {path && <><div className="path-heading"><h2>Ваш маршрут</h2><span>{path.length - 1} {path.length === 2 ? 'переход' : path.length >= 3 && path.length <= 5 ? 'перехода' : 'переходов'}</span></div>
      {approximate && <p className="path-approximate">Быстрая цепочка найдена. Поиск более короткого пути достиг лимита; можно искать глубже.</p>}
      <PathSteps path={path} lang={lang} multilingual={multilingual} litCount={litCount} />
    </>}
  </section>;
}
