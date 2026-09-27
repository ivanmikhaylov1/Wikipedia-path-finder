import { ArrowDownRight } from 'lucide-react';
import { SearchForm } from './SearchForm';
import type { ParsedArticle } from '../lib/parseInput';

interface HeroProps {
  searching: boolean;
  error: string;
  onSearch: (from: ParsedArticle, to: ParsedArticle) => void;
  onCancel: () => void;
  onValidationError: (message: string) => void;
}

export function Hero(props: HeroProps) {
  return <section className="hero" id="search">
    <div className="hero-inner page-width">
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-line" /> ДЕЛО О ПРОПАВШЕМ МАРШРУТЕ <span className="eyebrow-index">/ 01</span></div>
        <h1>Связи<br />найдутся<span className="hero-punctuation">.</span></h1>
        <p className="hero-lead">Две статьи Википедии. Между ними — цепочка ссылок, которую пока никто не видит. Назовите точки, и мы разложим улики на доске.</p>
        <div className="hero-meta"><span className="live-dot" /> ДВУНАПРАВЛЕННЫЙ BFS <span className="meta-separator">/</span> БЕЗ СЕРВЕРА</div>
      </div>
      <div className="hero-visual" aria-hidden="true"><span>АРХИВ СВЯЗЕЙ / ВИКИПЕДИЯ</span></div>
      <div className="hero-form-wrap">
        <div className="form-heading"><span>ЗАВЕСТИ ДЕЛО / ПОСТРОИТЬ МАРШРУТ</span><span className="form-heading-right">ДВЕ СТАТЬИ · ОДИН ЯЗЫК <ArrowDownRight size={15} /></span></div>
        <SearchForm {...props} />
      </div>
    </div>
  </section>;
}
