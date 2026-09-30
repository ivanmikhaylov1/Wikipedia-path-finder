import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CornerDownLeft, Search, X } from 'lucide-react';
import { parseInput, validatePair, type ParsedArticle } from '../lib/parseInput';
import { readSharedQuery, queryUrl } from '../lib/shareQuery';
import { WikiApiClient } from '../lib/wikiApi';

const api = new WikiApiClient();
const languages = [{ code: 'ru', label: 'RU' }, { code: 'en', label: 'EN' }, { code: 'de', label: 'DE' }, { code: 'fr', label: 'FR' }, { code: 'es', label: 'ES' }];
const examples: Record<string, [string, string]> = {
  ru: ['Москва', 'Юрий Гагарин'], en: ['London', 'Philosophy'],
  de: ['Berlin', 'Philosophie'], fr: ['Paris', 'Philosophie'], es: ['Madrid', 'Filosofía'],
};

function languageFromUrl(value: string): string | null {
  if (!/^https?:\/\//i.test(value.trim())) return null;
  try { return parseInput(value, 'ru').lang; } catch { return null; }
}

function ArticleInput({ label, number, placeholder, value, setValue, lang, disabled }: {
  label: string; number: string; placeholder: string; value: string; setValue: (value: string) => void;
  lang: string; disabled: boolean;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    if (import.meta.env.VITE_LINK_SOURCE === 'local' || value.trim().length < 2 || /^https?:\/\//i.test(value)) { setSuggestions([]); return; }
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
        onFocus={() => setOpen(true)} onBlur={event => { if (!root.current?.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => {
          if (event.key === 'ArrowDown' && suggestions.length) { event.preventDefault(); setOpen(true); setActiveIndex(i => (i + 1) % suggestions.length); }
          if (event.key === 'ArrowUp' && suggestions.length) { event.preventDefault(); setOpen(true); setActiveIndex(i => (i <= 0 ? suggestions.length - 1 : i - 1)); }
          if (event.key === 'Escape') { setOpen(false); setActiveIndex(-1); }
          if (event.key === 'Enter' && open && activeIndex >= 0) { event.preventDefault(); setValue(suggestions[activeIndex]); setOpen(false); }
        }}
        placeholder={placeholder} autoComplete="off" disabled={disabled} role="combobox" aria-expanded={open && suggestions.length > 0} aria-controls={`suggestions-${number}`} aria-autocomplete="list" aria-activedescendant={open && activeIndex >= 0 && activeIndex < suggestions.length ? `option-${number}-${activeIndex}` : undefined} />
      {value && <button className="clear-field" type="button" onClick={() => { setValue(''); setSuggestions([]); }} aria-label="Очистить поле"><X size={16} /></button>}
    </div>
    {open && suggestions.length > 0 && <div className="suggestions" id={`suggestions-${number}`} role="listbox">
      {suggestions.map((item, index) => <button id={`option-${number}-${index}`} tabIndex={-1} type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? 'suggestion active' : 'suggestion'} key={item}
        onMouseDown={event => event.preventDefault()} onClick={() => { setValue(item); setOpen(false); setActiveIndex(-1); }}>
        <span>{item}</span><CornerDownLeft size={15} />
      </button>)}
      <div className="suggestion-foot">ПОДСКАЗКИ ИЗ ВИКИПЕДИИ</div>
    </div>}
  </div>;
}

export function SearchForm({ searching, error, onSearch, onCancel, onValidationError }: {
  searching: boolean; error: string; onSearch: (from: ParsedArticle, to: ParsedArticle, multilingual?: boolean) => void;
  onCancel: () => void; onValidationError: (message: string) => void;
}) {
  const initial = readSharedQuery(location.search);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [lang, setLang] = useState(initial.lang);
  const [copyStatus, setCopyStatus] = useState('');
  const [multilingual, setMultilingual] = useState(initial.multilingual && import.meta.env.VITE_LINK_SOURCE !== 'local');
  const [toLang, setToLang] = useState('en');
  const availableLanguages = languages.some(item => item.code === lang)
    ? languages : [...languages, { code: lang, label: lang.toUpperCase() }];
  const [fromExample, toExample] = examples[lang] ?? ['Название статьи', 'Другая статья'];
  const changeValue = (value: string, setValue: (value: string) => void) => {
    setValue(value);
    const urlLanguage = languageFromUrl(value);
    if (urlLanguage && !multilingual) setLang(urlLanguage);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const start = parseInput(from, lang);
      const end = parseInput(to, multilingual ? toLang : lang);
      if (!multilingual) validatePair(start, end);
      history.replaceState(null, '', queryUrl(start, end, multilingual));
      onValidationError('');
      onSearch(start, end, multilingual);
    } catch (error) { onValidationError(error instanceof Error ? error.message : 'Проверьте названия статей'); }
  };

  return <form className="search-form" onSubmit={submit}>
    <div className="language-bar">
      <div className="language-caption"><span>ЯЗЫК ПОИСКА</span><small>Один раздел для обеих статей</small></div>
      <div className="language-switch" role="group" aria-label="Язык поиска для обеих статей">
        {availableLanguages.map(item => <button key={item.code} type="button" className={lang === item.code ? 'active' : ''}
          aria-pressed={lang === item.code} onClick={() => setLang(item.code)}>{item.label}</button>)}
      </div>
    </div>
    {import.meta.env.VITE_LINK_SOURCE !== 'local' && <div className="mode-control">
      <label><input type="checkbox" checked={multilingual} onChange={event => setMultilingual(event.target.checked)} /> Межъязыковой поиск (langlinks)</label>
      {multilingual && <label>Язык цели <select value={toLang} onChange={event => setToLang(event.target.value)}>{languages.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>}
    </div>}
    <div className="fields-grid">
      <ArticleInput label="Объект А / откуда" number="01" placeholder={`Например, ${fromExample}`} value={from} setValue={value => changeValue(value, setFrom)} lang={lang} disabled={false} />
      <div className="between-fields" aria-hidden="true"><ArrowRight size={20} strokeWidth={1.4} /></div>
      <ArticleInput label="Объект Б / куда" number="02" placeholder={`Например, ${toExample}`} value={to} setValue={value => changeValue(value, setTo)} lang={multilingual ? toLang : lang} disabled={false} />
    </div>
    <div className="query-actions">
      <button type="button" onClick={() => { if (multilingual) { setFrom(`https://${parseInput(to, toLang).lang}.wikipedia.org/wiki/${parseInput(to, toLang).title}`); setTo(`https://${parseInput(from, lang).lang}.wikipedia.org/wiki/${parseInput(from, lang).title}`); } else { setFrom(to); setTo(from); } }}>Поменять статьи местами</button>
      <button type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(queryUrl(parseInput(from, lang), parseInput(to, multilingual ? toLang : lang), multilingual)); setCopyStatus('Ссылка скопирована'); }
        catch { setCopyStatus('Введите статьи; ссылку также можно скопировать из адресной строки после поиска.'); }
      }}>Скопировать ссылку</button>
      <span role="status">{copyStatus}</span>
    </div>
    <div className="form-bottom">
      <div className="form-tip">Название статьи или ссылка вида <span>wikipedia.org/wiki/...</span></div>
      {searching ? <button className="submit-button cancel-button" type="button" onClick={onCancel}>Остановить <X size={18} /></button>
        : <button className="submit-button" type="submit">Найти путь <ArrowRight size={19} /></button>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}
