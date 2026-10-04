import { useEffect, useRef, useState } from 'react';
import { resolveArticleSelection } from '../lib/articleSelection';
import { SearchForm, type ArticlePair, type SearchFormProps } from './SearchForm';
import { CollisionStage, type CollisionStageProps } from './CollisionStage';
import { SearchStatus, type SearchStatusProps } from './SearchStatus';

export interface CollisionSpreadProps extends SearchFormProps, CollisionStageProps, Omit<SearchStatusProps, 'progress'> {}

export function PublisherMark() {
  return <div className="publisher-mark"><a href={import.meta.env.BASE_URL} aria-label="Переходы — на главную">Переходы</a><span>По ссылкам Википедии</span></div>;
}

function isArticle(pair: ArticlePair, side: 'from' | 'to', title: string, lang: string) {
  try { const article = resolveArticleSelection(pair[side]); return article.title === title && article.lang === lang; }
  catch { return false; }
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
  const octopus = isArticle(pair, 'from', 'Осьминоги', 'ru');
  const bauhaus = isArticle(pair, 'to', 'Bauhaus', 'en');
  return <section className={`collision-spread${colliding && formProps.searching ? ' is-colliding' : ''}${formProps.searching ? ' is-searching' : ''}`} id="search">
    <header className="publisher-margin"><PublisherMark /><p>Две статьи /<br />одна связь</p></header>
    <h1 className="sr-only">Найдите цепочку ссылок между двумя статьями</h1>
    <div className="spread-art" key={searchId} aria-hidden="true">
      <div className={`paper-fragment paper-fragment--from${octopus ? ' has-octopus' : ' abstract-print'}`}>
        {octopus && <img className="octopus-cutout" src={`${import.meta.env.BASE_URL}images/collision/octopus.webp`} srcSet={`${import.meta.env.BASE_URL}images/collision/octopus-small.webp 600w, ${import.meta.env.BASE_URL}images/collision/octopus.webp 1086w`} sizes="(max-width: 767px) 300px, 55vw" width="1086" height="1448" alt="" />}
      </div>
      <div className={`paper-fragment paper-fragment--to${bauhaus ? ' has-bauhaus' : ' abstract-print'}`}>
        {bauhaus && <div className="bauhaus-print"><i className="blue-disc" /><i className="black-bar" /><i className="registration-line" /></div>}
      </div>
    </div>
    <SearchForm {...formProps} error="" pair={pair} onPairChange={onPairChange} />
    <div className="spread-search-state">
      <CollisionStage searching={formProps.searching} searchId={searchId} progress={progress} />
      <SearchStatus searching={formProps.searching} error={formProps.error} notFound={notFound} canResume={canResume} onResume={onResume} onEdit={onEdit} onSwap={onSwap} progress={progress} />
    </div>
    <p className="spread-limit">Поиск ограничен лимитами: путь есть не всегда, найденный не обязательно кратчайший.</p>
    <div className="publisher-foot" aria-hidden="true"><span>A</span><span>Выберите две статьи</span><span>B</span></div>
  </section>;
}
