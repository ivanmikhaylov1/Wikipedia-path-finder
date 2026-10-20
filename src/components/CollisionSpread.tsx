import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveArticleSelection } from '../lib/articleSelection';
import { SearchForm, type ArticlePair, type SearchFormProps } from './SearchForm';
import { CollisionStage, type CollisionStageProps } from './CollisionStage';
import { SearchStatus, type SearchStatusProps } from './SearchStatus';
import { ConstructionCover, EngravingCover, articleFromCoverKey, articleKey, searchIntensity, usePointerDepth, useSettledKey } from './GenerativeCover';
import { colophon, pairAngle } from '../lib/coverArt';

export interface CollisionSpreadProps extends SearchFormProps, CollisionStageProps, Omit<SearchStatusProps, 'progress'> {}

export function PublisherMark() {
  return <div className="publisher-mark"><a href={import.meta.env.BASE_URL} aria-label="Переходы — на главную">Переходы</a><span>По ссылкам Википедии</span></div>;
}

function articleOf(pair: ArticlePair, side: 'from' | 'to', localLang?: string) {
  try { return resolveArticleSelection(pair[side], localLang); }
  catch { return null; }
}

export function CollisionSpread({ pair, onPairChange, searchId, progress, notFound, canResume, onResume, onEdit, onSwap, ...formProps }: CollisionSpreadProps) {
  const lastSearch = useRef(searchId);
  const [colliding, setColliding] = useState(false);
  useEffect(() => {
    if (!formProps.searching) {
      lastSearch.current = searchId;
      setColliding(false);
      return;
    }
    if (lastSearch.current === searchId) return;
    lastSearch.current = searchId;
    setColliding(true);
    const timer = window.setTimeout(() => setColliding(false), 750);
    return () => window.clearTimeout(timer);
  }, [searchId, formProps.searching]);
  const from = articleOf(pair, 'from', formProps.localLang), to = articleOf(pair, 'to', formProps.localLang);
  const octopus = from?.title === 'Осьминоги' && from.lang === 'ru';
  const bauhaus = to?.title === 'Bauhaus' && to.lang === 'en';
  // Any other pair prints its own deterministic cover once typing settles.
  const fromKey = useSettledKey(articleKey(from), formProps.searching), toKey = useSettledKey(articleKey(to), formProps.searching);
  // Stable article objects let the memoised covers skip the worker's frequent progress renders.
  const settledFrom = useMemo(() => articleFromCoverKey(fromKey), [fromKey]), settledTo = useMemo(() => articleFromCoverKey(toKey), [toKey]);
  const angle = settledFrom || settledTo ? pairAngle(settledFrom ?? settledTo!, settledTo ?? settledFrom!) : 0;
  const coverFrom = octopus ? null : settledFrom, coverTo = bauhaus ? null : settledTo;
  const intensity = searchIntensity(progress?.visited);
  const spread = useRef<HTMLElement>(null);
  useEffect(() => {
    // Covers start below the measured titles, so long names never print over generated art.
    const element = spread.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const top = element.getBoundingClientRect().top;
      for (const side of ['from', 'to']) {
        const field = element.querySelector(`[data-side=${side}]`);
        if (field) element.style.setProperty(`--${side}-bottom`, `${Math.round(field.getBoundingClientRect().bottom - top)}px`);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.querySelectorAll('[data-side]').forEach(field => observer.observe(field));
    return () => observer.disconnect();
  }, []);
  usePointerDepth(spread);
  return <section ref={spread} className={`collision-spread${colliding && formProps.searching ? ' is-colliding' : ''}${formProps.searching ? ' is-searching' : ''}`} id="search">
    <header className="publisher-margin"><PublisherMark /><p>Две статьи /<br />одна связь</p></header>
    <h1 className="sr-only">Найдите цепочку ссылок между двумя статьями</h1>
    <div className="spread-art" aria-hidden="true">
      <div className={`paper-fragment paper-fragment--from${octopus ? ' has-octopus' : coverFrom ? ' has-cover' : ' abstract-print'}`}>
        {coverFrom && <EngravingCover key={fromKey} article={coverFrom} angle={angle} className="spread-engraving" intensity={intensity} />}
        {octopus && <img className="octopus-cutout" style={{ rotate: `${intensity * 4}deg` }} src={`${import.meta.env.BASE_URL}images/collision/octopus.webp`} srcSet={`${import.meta.env.BASE_URL}images/collision/octopus-small.webp 600w, ${import.meta.env.BASE_URL}images/collision/octopus.webp 1086w`} sizes="(max-width: 767px) 300px, 55vw" width="1086" height="1448" alt="" />}
      </div>
      <div className={`paper-fragment paper-fragment--to${bauhaus ? ' has-bauhaus' : coverTo ? ' has-cover' : ' abstract-print'}`}>
        {coverTo && <ConstructionCover key={toKey} article={coverTo} angle={angle} className="spread-construction" intensity={intensity} />}
        {bauhaus && <div className="bauhaus-print"><i className="blue-disc" style={{ scale: `${1 + intensity * .12}` }} /><i className="black-bar" /><i className="registration-line" /></div>}
      </div>
    </div>
    <SearchForm {...formProps} error="" pair={pair} onPairChange={onPairChange} />
    <div className="spread-search-state">
      <CollisionStage searching={formProps.searching} searchId={searchId} progress={progress} />
      <SearchStatus searching={formProps.searching} error={formProps.error} notFound={notFound} canResume={canResume} onResume={onResume} onEdit={onEdit} onSwap={onSwap} progress={progress} />
    </div>
    <p className="spread-limit">Поиск ограничен лимитами: путь есть не всегда, найденный не обязательно кратчайший.</p>
    <div className="publisher-foot" aria-hidden="true"><span>A</span>{settledFrom && settledTo ? <span className="colophon">{colophon(settledFrom, settledTo)}</span> : <span>Выберите две статьи</span>}<span>B</span></div>
  </section>;
}
