import { useEffect, useRef, useState } from 'react';
import { initialArticlePair, resolveArticleSelection, resolveSearchPair, type ArticleSelection } from '../lib/articleSelection';
import type { ParsedArticle } from '../lib/parseInput';
import { readSharedQuery, queryUrl } from '../lib/shareQuery';
import { ArticleField } from './ArticleField';

export type ArticlePair = ReturnType<typeof initialArticlePair>;
export interface SearchFormProps {
  formRef?: React.Ref<HTMLFormElement>;
  searching: boolean; error: string;
  onSearch: (from: ParsedArticle, to: ParsedArticle, multilingual: boolean) => void;
  onCancel: () => void; onValidationError: (message: string) => void;
  onPairChange?: (pair: ArticlePair) => void; resetKey?: number;
}

export function SearchForm({ searching, error, onSearch, onCancel, onValidationError, formRef, onPairChange, resetKey }: SearchFormProps) {
  const local = import.meta.env.VITE_LINK_SOURCE === 'local';
  const [localLang] = useState(() => local ? readSharedQuery(location.search).lang : undefined);
  const [pair, setPair] = useState(() => initialArticlePair(location.search, local));
  const [validation, setValidation] = useState<{ from?: string; to?: string }>({});
  const previousReset = useRef(resetKey);
  useEffect(() => { onPairChange?.(pair); }, [pair, onPairChange]);
  useEffect(() => {
    if (previousReset.current === resetKey) return;
    previousReset.current = resetKey;
    setPair(initialArticlePair(localLang ? `?lang=${localLang}` : '', local));
    setValidation({});
  }, [resetKey, local, localLang]);
  const change = (field: 'from' | 'to', selection: ArticleSelection) => {
    setValidation({}); onValidationError('');
    setPair(current => ({ ...current, [field]: selection, example: false }));
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (searching) return;
    const errors: { from?: string; to?: string } = {};
    for (const field of ['from', 'to'] as const) {
      try { resolveArticleSelection(pair[field], localLang); }
      catch (error) { errors[field] = error instanceof Error ? error.message : 'Введите статью'; }
    }
    let resolved: ReturnType<typeof resolveSearchPair> | undefined;
    if (!errors.from && !errors.to) {
      try { resolved = resolveSearchPair(pair.from, pair.to, localLang); }
      catch (error) {
        const message = error instanceof Error ? error.message : 'Проверьте пару статей';
        for (const field of ['from', 'to'] as const) {
          if (resolveArticleSelection(pair[field], localLang).lang !== localLang) errors[field] = message;
        }
      }
    }
    setValidation(errors); onValidationError('');
    if (errors.from || errors.to) {
      document.getElementById(errors.from ? 'article-01' : 'article-02')?.focus();
      return;
    }
    if (resolved) {
      history.replaceState(null, '', queryUrl(resolved.from, resolved.to, resolved.multilingual));
      onSearch(resolved.from, resolved.to, resolved.multilingual);
    }
  };

  return <form ref={formRef} className="collision-form" onSubmit={submit}>
    <div className="spread-fields">
      <ArticleField id="article-01" number="01" label="Откуда" selection={pair.from} onChange={selection => change('from', selection)} disabled={searching} localLang={localLang} error={validation.from} />
      <ArticleField id="article-02" number="02" label="Куда" selection={pair.to} onChange={selection => change('to', selection)} disabled={searching} localLang={localLang} error={validation.to} />
    </div>
    <div className="seam-controls">
      {searching ? <button key="stop" className="collision-submit cancel-button" type="button" onClick={onCancel}>Остановить</button>
        : <button key="submit" className="collision-submit" type="submit">Столкнуть<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" /></svg></button>}
      <button className="swap-button" data-swap type="button" disabled={searching} onClick={() => {
        setValidation({}); onValidationError('');
        setPair(current => ({ from: current.to, to: current.from, example: false }));
      }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M7 20V4m-4 4 4-4 4 4m6-4v16m-4-4 4 4 4-4" /></svg>Поменять статьи местами</button>
    </div>
    {pair.example && <p className="example-pair">Пример пары · путь не гарантирован</p>}
    {localLang && <p className="section-help">Локальный граф: раздел {localLang.toUpperCase()}. Выберите обе статьи из этого раздела.</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </form>;
}
