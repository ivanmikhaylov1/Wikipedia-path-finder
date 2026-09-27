import { ArrowDownRight, MoveUpRight } from 'lucide-react';
import { SearchForm } from './SearchForm';
import type { QuickPair } from './SearchForm';
import type { ParsedArticle } from '../lib/parseInput';

interface HeroProps {
  searching: boolean;
  error: string;
  quickPair: QuickPair | null;
  onSearch: (from: ParsedArticle, to: ParsedArticle) => void;
  onCancel: () => void;
  onValidationError: (message: string) => void;
}

export function Hero(props: HeroProps) {
  return <section className="hero" id="search">
    <div className="hero-inner page-width">
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-line" /> КАРТА НЕОЖИДАННЫХ СВЯЗЕЙ <span className="eyebrow-index">/ 01</span></div>
        <h1>От статьи<br />к статье<span className="hero-punctuation">.</span></h1>
        <p className="hero-lead">Сколько переходов отделяет одну мысль от другой? Найдите кратчайшую цепочку гиперссылок между статьями Википедии.</p>
        <div className="hero-meta"><span className="live-dot" /> ДВУНАПРАВЛЕННЫЙ ПОИСК <span className="meta-separator">/</span> ПРЯМО В БРАУЗЕРЕ</div>
      </div>
      <div className="hero-visual" aria-hidden="true">
        <div className="orbit orbit-one" /><div className="orbit orbit-two" />
        <div className="hero-node node-a"><span>А</span></div>
        <div className="hero-node node-b"><span>?</span></div>
        <div className="hero-node node-c"><span>Б</span></div>
        <div className="visual-line line-a" /><div className="visual-line line-b" />
        <div className="visual-label label-a">СТАРТ / 01</div><div className="visual-label label-b">ФИНИШ / 02</div>
        <div className="visual-coordinate">55°45′ N<br />37°37′ E</div>
        <MoveUpRight className="visual-arrow" size={25} strokeWidth={1.2} />
      </div>
      <div className="hero-form-wrap">
        <div className="form-heading"><span>ПОСТРОИТЬ МАРШРУТ</span><span className="form-heading-right">ДВЕ СТАТЬИ · ОДИН ЯЗЫК <ArrowDownRight size={15} /></span></div>
        <SearchForm {...props} />
      </div>
    </div>
  </section>;
}
