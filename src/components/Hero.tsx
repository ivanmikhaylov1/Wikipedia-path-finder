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
        <h1>Нить между любыми двумя статьями</h1>
        <p className="hero-lead">Знания связаны ближе, чем кажется. Выберите две статьи Википедии — найдём цепочку ссылок между ними.</p>
      </div>
      <div className="hero-form-wrap">
        <SearchForm {...props} />
      </div>
    </div>
  </section>;
}
