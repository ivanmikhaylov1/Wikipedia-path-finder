import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { routeArticles, routeConnectors, type RoutePoint } from '../lib/routeRibbon';
import { PublisherMark } from './CollisionSpread';

export interface RouteRibbonProps { path: string[]; lang: string; multilingual: boolean; onNewPair(): void; onShare(): void; shareStatus: string }

function plural(count: number, forms: [string, string, string]) {
  const last = count % 10; const hundred = count % 100;
  return forms[hundred >= 11 && hundred <= 14 ? 2 : last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2];
}

export function RouteRibbon({ path, lang, multilingual, onNewPair, onShare, shareStatus }: RouteRibbonProps) {
  const resultKey = JSON.stringify([path, lang, multilingual]);
  const articles = useMemo(() => routeArticles(path, lang, multilingual), [path, lang, multilingual]);
  const list = useRef<HTMLOListElement>(null);
  const [assembling, setAssembling] = useState(false);
  const [geometry, setGeometry] = useState<{ width: number; height: number; points: RoutePoint[]; mobile: boolean } | null>(null);
  const arrowId = useId();
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setAssembling(false); return; }
    setAssembling(true);
    const timer = window.setTimeout(() => setAssembling(false), 700);
    return () => window.clearTimeout(timer);
  }, [resultKey]);
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      const bounds = element.getBoundingClientRect();
      if (!(bounds.width > 0 && bounds.height > 0)) { setGeometry(null); return; }
      const anchors = Array.from(element.querySelectorAll<HTMLElement>('.route-anchor')).map(anchor => anchor.getBoundingClientRect());
      if (anchors.some(rect => !(rect.width > 0 && rect.height > 0))) { setGeometry(null); return; }
      const points = anchors.map(rect => ({ x: rect.left + rect.width / 2 - bounds.left, y: rect.top + rect.height / 2 - bounds.top }));
      setGeometry({ width: bounds.width, height: bounds.height, points, mobile: window.matchMedia('(max-width: 767px)').matches });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    for (const item of Array.from(element.children)) observer?.observe(item);
    window.addEventListener('resize', measure);
    void document.fonts?.ready.then(measure);
    return () => { active = false; observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [resultKey]);
  const joins = geometry ? routeConnectors(geometry.points, articles, geometry.mobile) : [];
  const edges = Math.max(0, articles.length - 1);
  const octopus = articles.some(article => article.lang === 'ru' && article.title === 'Осьминоги');
  const bauhaus = articles.some(article => article.title.toLowerCase() === 'bauhaus');
  return <section className={`route-ribbon${assembling ? ' is-assembling' : ''}`} aria-labelledby="route-heading">
    <div className="ribbon-art" aria-hidden="true">
      {octopus && <img className="ribbon-octopus" src={`${import.meta.env.BASE_URL}images/collision/octopus.webp`} srcSet={`${import.meta.env.BASE_URL}images/collision/octopus-small.webp 600w, ${import.meta.env.BASE_URL}images/collision/octopus.webp 1086w`} sizes="(max-width: 767px) 220px, 40vw" width="1086" height="1448" alt="" />}
      {bauhaus && <div className="ribbon-bauhaus"><i className="blue-disc" /><i className="black-bar" /></div>}
      <span className="ribbon-endword">{articles.at(-1)?.title}</span>
    </div>
    <header className="publisher-margin"><PublisherMark /><p>По ссылкам /<br />Википедии</p></header>
    <div className="ribbon-heading">
      <h1 id="route-heading" tabIndex={-1}><span>Связь</span>{' '}<strong>найдена</strong></h1>
      <div className="ribbon-caption"><p className="route-counts">{edges} {plural(edges, ['переход', 'перехода', 'переходов'])} / {articles.length} {plural(articles.length, ['статья', 'статьи', 'статей'])}</p><p>Открывайте статьи<br />по порядку <span aria-hidden="true">→</span></p></div>
    </div>
    <div className="ribbon-route">
      <ol ref={list} className="route-list" aria-label="Найденный путь">
        {articles.map((article, index) => <li className="route-strip" key={`${index}:${article.lang}:${article.title}`} style={{ '--route-row': article.row + 1, '--route-column': article.column + 1 } as CSSProperties} data-number={article.number}>
          {article.crossLanguage && <span className="route-language-turn">{articles[index - 1].lang.toUpperCase()} → {article.lang.toUpperCase()} / смена языка</span>}
          <span className="route-folio" aria-hidden="true">{String(article.number).padStart(2, '0')}</span>
          <div className="route-article"><span className="language-badge" aria-label={`Раздел ${article.lang.toUpperCase()}`}>{article.lang.toUpperCase()}</span><a href={article.href} lang={article.lang} target="_blank" rel="noopener noreferrer">{article.title}<span aria-hidden="true"> ↗</span></a></div>
          <span className="route-anchor" aria-hidden="true" />
        </li>)}
      </ol>
      {geometry && joins.length > 0 && <svg className="route-connectors" width={geometry.width} height={geometry.height} viewBox={`0 0 ${geometry.width} ${geometry.height}`} aria-hidden="true" focusable="false">
        <defs><marker id={arrowId} viewBox="0 0 10 10" refX="11" refY="5" markerWidth="5" markerHeight="5" orient="auto"><polyline points="2,1 7,5 2,9" fill="none" stroke="currentColor" strokeWidth="1.5" /></marker></defs>
        {joins.map(join => <path key={`${join.from}-${join.to}`} data-from={join.from} data-to={join.to} d={join.d} fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={join.crossLanguage ? '9 7' : undefined} markerEnd={`url(#${arrowId})`} />)}
      </svg>}
    </div>
    <footer className="ribbon-actions"><button type="button" onClick={onNewPair}>Новая пара <span aria-hidden="true">↗</span></button><button type="button" onClick={onShare}>Поделиться <span aria-hidden="true">↗</span></button><p role="status">{shareStatus}</p></footer>
  </section>;
}
