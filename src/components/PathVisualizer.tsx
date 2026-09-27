import { ArrowUpRight, Link2 } from 'lucide-react';

function transitionCount(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  const ending = lastTwo >= 11 && lastTwo <= 14 ? 'ОВ' : last === 1 ? '' : last >= 2 && last <= 4 ? 'А' : 'ОВ';
  return `${count} ПЕРЕХОД${ending}`;
}

export function PathVisualizer({ path, lang }: { path: string[] | null; lang: string }) {
  return <section className="path-section page-width" id="route" aria-live="polite">
    <div className="section-kicker"><span>02 / МАРШРУТ</span><span>{path ? transitionCount(path.length - 1) : 'ОЖИДАНИЕ ТОЧЕК'}</span></div>
    <div className="section-title-row"><h2>Цепочка переходов<span>.</span></h2><p>Каждая карточка — статья. Линия между ними означает прямую гиперссылку.</p></div>
    {path ? <div className="path-list">
      {path.map((title, index) => <div className="path-step" key={`${title}-${index}`} style={{ animationDelay: `${index * 130}ms` }}>
        {index > 0 && <div className="step-connector"><span /><span>ПЕРЕХОД {String(index).padStart(2, '0')}</span></div>}
        <a className="path-card" href={`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`} target="_blank" rel="noopener noreferrer">
          <span className="path-card-index">{String(index + 1).padStart(2, '0')} <span>/ {index === 0 ? 'НАЧАЛО' : index === path.length - 1 ? 'ЦЕЛЬ' : 'СТАТЬЯ'}</span></span>
          <strong>{title}</strong><ArrowUpRight size={22} strokeWidth={1.5} />
        </a>
      </div>)}
    </div> : <div className="empty-path">
      <div className="empty-path-art" aria-hidden="true"><span className="ghost-node">01</span><span className="ghost-line" /><span className="ghost-node middle">?</span><span className="ghost-line" /><span className="ghost-node">02</span></div>
      <Link2 size={21} strokeWidth={1.5} /><p>Задайте две статьи выше — здесь появится<br />маршрут между ними.</p>
    </div>}
  </section>;
}
