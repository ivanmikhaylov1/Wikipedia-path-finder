import { articleFromKey } from '../lib/multilingualLinkSource';
import { useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { ConnectionString } from './ConnectionString';
import pin from '../assets/images/red-pin.png';
import tape from '../assets/images/masking-tape.png';
import stamp from '../assets/images/stamp-ink.png';
import heroBoard from '../assets/images/hero-board.webp';

function transitionCount(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  const ending = lastTwo >= 11 && lastTwo <= 14 ? 'ОВ' : last === 1 ? '' : last >= 2 && last <= 4 ? 'А' : 'ОВ';
  return `${count} ПЕРЕХОД${ending}`;
}

export function PathVisualizer({ path, lang, multilingual = false, approximate = false }: { path: string[] | null; lang: string; multilingual?: boolean; approximate?: boolean }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  return <section className="path-section" id="route" aria-live="polite">
    <div className="page-width">
      <div className="section-kicker"><span>02 / ДОСКА УЛИК</span><span>{path ? transitionCount(path.length - 1) : 'МАРШРУТ ЕЩЁ НЕ СОБРАН'}</span></div>
      <div className="section-title-row"><h2>Улики на нити<span>.</span></h2><p>Каждая карточка — статья. Красная нить соединяет реальные прямые гиперссылки.</p></div>
      {path && approximate && <p className="path-approximate">Быстрый вариант, не обязательно кратчайший. Поиск более короткой цепочки продолжается.</p>}
      {path ? <div className="path-board" ref={boardRef}>
        <ConnectionString containerRef={boardRef} cardRefs={cardRefs} count={path.length} />
        <div className="path-list">
          {path.map((key, index) => { const { title, lang: articleLang } = multilingual ? articleFromKey(key) : { title: key, lang }; return <div className="path-step" key={`${title}-${index}`} style={{ animationDelay: `${index * 100}ms` }}>
            <a ref={element => { cardRefs.current[index] = element; }} className="path-card" href={`https://${articleLang}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`} target="_blank" rel="noopener noreferrer">
              <img className="card-pin" src={pin} alt="" aria-hidden="true" />
              {index % 3 === 1 && <img className="card-tape" src={tape} alt="" aria-hidden="true" style={{ transform: `rotate(${[-6, 4, 7][index % 3]}deg)` }} />}
              <span className="path-card-index">УЛИКА {String(index + 1).padStart(2, '0')} <em>/ {index === 0 ? 'СТАРТ' : index === path.length - 1 ? 'ЦЕЛЬ' : 'ПЕРЕХОД'}</em></span>
              <strong>{title}</strong>{multilingual && <span>{articleLang.toUpperCase()}</span>}<span className="path-card-foot">ОТКРЫТЬ СТАТЬЮ <ArrowUpRight size={17} /></span>
            </a>
          </div>; })}
        </div>
        <div className="route-stamp" style={{ backgroundImage: `url(${stamp})` }}><span>{approximate ? 'БЫСТРЫЙ ПУТЬ' : 'МАРШРУТ НАЙДЕН'}</span></div>
      </div> : <div className="empty-path" style={{ backgroundImage: `linear-gradient(90deg, rgba(36,28,21,.76), rgba(36,28,21,.05)), url(${heroBoard})` }}>
        <div className="empty-path-copy"><span>ДЕЛО № 001 / ОЖИДАНИЕ</span><strong>Две статьи.<br />Одна нить.</strong><p>Укажите начальную и конечную статью — здесь появится доска с маршрутом.</p></div>
      </div>}
    </div>
  </section>;
}
