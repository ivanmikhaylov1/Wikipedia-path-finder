import { SearchForm } from './SearchForm';
import type { ParsedArticle } from '../lib/parseInput';

interface HeroProps {
  searching: boolean;
  error: string;
  onSearch: (from: ParsedArticle, to: ParsedArticle, multilingual?: boolean) => void;
  onCancel: () => void;
  onValidationError: (message: string) => void;
}

export function Hero(props: HeroProps) {
  return <section className="hero" id="search">
    <div className="hero-inner page-width">
      <div className="hero-copy">
        <h1>Найдите цепочку ссылок между двумя статьями</h1>
        <p className="hero-lead">Поиск идёт навстречу с обеих сторон и ограничен лимитами: путь есть не всегда, найденный не обязательно кратчайший</p>
      </div>
      <div className="hero-form-wrap">
        <SearchForm {...props} />
      </div>
    </div>
  </section>;
}
