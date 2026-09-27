import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CornerDownLeft, Search, X } from 'lucide-react';
import { parseInput, validatePair, type ParsedArticle } from '../lib/parseInput';
import { WikiApiClient } from '../lib/wikiApi';

const api = new WikiApiClient();
const languages = [{ code: 'ru', label: 'RU' }, { code: 'en', label: 'EN' }, { code: 'de', label: 'DE' }, { code: 'fr', label: 'FR' }, { code: 'es', label: 'ES' }];

export interface QuickPair { from: string; to: string; sequence: number }

function ArticleInput({ label, number, placeholder, value, setValue, lang, setLang, disabled }: {
  label: string; number: string; placeholder: string; value: string; setValue: (value: string) => void;
  lang: string; setLang: (value: string) => void; disabled: boolean;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    if (value.trim().length < 2 || /^https?:\/\//i.test(value)) { setSuggestions([]); return; }
    const timer = setTimeout(() => {
      api.suggest(value, lang).then(items => { if (live) setSuggestions(items); }).catch(() => { if (live) setSuggestions([]); });
    }, 280);
    return () => { live = false; clearTimeout(timer); };
  }, [value, lang]);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return <div className="article-input" ref={root}>
    <div className="field-top"><span className="field-number">{number}</span><label htmlFor={`article-${number}`}>{label}</label></div>
    <div className="field-control">
      <Search size={20} strokeWidth={1.6} className="field-icon" />
      <input id={`article-${number}`} type="text" value={value} onChange={event => { setValue(event.target.value); setOpen(true); setActiveIndex(-1); }}
        onFocus={() => setOpen(true)} onKeyDown={event => {
          if (event.key === 'ArrowDown' && suggestions.length) { event.preventDefault(); setActiveIndex(i => (i + 1) % suggestions.length); }
          if (event.key === 'ArrowUp' && suggestions.length) { event.preventDefault(); setActiveIndex(i => (i <= 0 ? suggestions.length - 1 : i - 1)); }
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'Enter' && open && activeIndex >= 0) { event.preventDefault(); setValue(suggestions[activeIndex]); setOpen(false); }
        }}
        placeholder={placeholder} autoComplete="off" disabled={disabled} role="combobox" aria-expanded={open && suggestions.length > 0} aria-controls={`suggestions-${number}`} aria-autocomplete="list" />
      {value && <button className="clear-field" type="button" onClick={() => { setValue(''); setSuggestions([]); }} aria-label="Очистить поле"><X size={16} /></button>}
      <select aria-label={`Язык: ${label.toLowerCase()}`} value={lang} onChange={event => setLang(event.target.value)} disabled={disabled}>
        {languages.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
      </select>
    </div>
    {open && suggestions.length > 0 && <div className="suggestions" id={`suggestions-${number}`} role="listbox">
      {suggestions.map((item, index) => <button type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? 'suggestion active' : 'suggestion'} key={item}
        onMouseDown={event => event.preventDefault()} onClick={() => { setValue(item); setOpen(false); setActiveIndex(-1); }}>
        <span>{item}</span><CornerDownLeft size={15} />
      </button>)}
      <div className="suggestion-foot">ПОДСКАЗКИ ИЗ ВИКИПЕДИИ</div>
    </div>}
  </div>;
}

export function SearchForm({ searching, error, quickPair, onSearch, onCancel, onValidationError }: {
  searching: boolean; error: string; quickPair: QuickPair | null; onSearch: (from: ParsedArticle, to: ParsedArticle) => void;
  onCancel: () => void; onValidationError: (message: string) => void;
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fromLang, setFromLang] = useState('ru');
  const [toLang, setToLang] = useState('ru');

  useEffect(() => {
    if (!quickPair) return;
    setFrom(quickPair.from);
    setTo(quickPair.to);
    setFromLang('ru');
    setToLang('ru');
  }, [quickPair]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const start = parseInput(from, fromLang);
      const end = parseInput(to, toLang);
      validatePair(start, end);
      onValidationError('');
      onSearch(start, end);
    } catch (error) { onValidationError(error instanceof Error ? error.message : 'Проверьте названия статей'); }
  };

  return <form className="search-form" onSubmit={submit}>
    <div className="fields-grid">
      <ArticleInput label="Откуда" number="01" placeholder="Например, Москва" value={from} setValue={setFrom} lang={fromLang} setLang={setFromLang} disabled={false} />
      <div className="between-fields" aria-hidden="true"><ArrowRight size={20} strokeWidth={1.4} /></div>
      <ArticleInput label="Куда" number="02" placeholder="Например, Юрий Гагарин" value={to} setValue={setTo} lang={toLang} setLang={setToLang} disabled={false} />
    </div>
    <div className="form-bottom">
      <div className="form-tip">Название статьи или ссылка вида <span>wikipedia.org/wiki/...</span></div>
      {searching ? <button className="submit-button cancel-button" type="button" onClick={onCancel}>Остановить <X size={18} /></button>
        : <button className="submit-button" type="submit">Найти путь <ArrowRight size={19} /></button>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}
