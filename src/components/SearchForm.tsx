import { useEffect, useRef, useState } from 'react';
import { parseInput, validatePair, type ParsedArticle } from '../lib/parseInput';
import { readSharedQuery, queryUrl } from '../lib/shareQuery';
import { DEFAULT_LIMITS } from '../lib/searchLimits';
import { WikiApiClient } from '../lib/wikiApi';

const api = new WikiApiClient({ ...DEFAULT_LIMITS, concurrency: 1 });
const languages = [{ code: 'ru', label: 'Русский' }, { code: 'en', label: 'Английский' }, { code: 'de', label: 'Немецкий' }, { code: 'fr', label: 'Французский' }, { code: 'es', label: 'Испанский' }];
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
    <div className="field-top"><label htmlFor={`article-${number}`}>{label}</label></div>
    <div className="field-control">
      <input id={`article-${number}`} type="text" value={value} onChange={event => { setValue(event.target.value); setOpen(true); setActiveIndex(-1); }}
        onFocus={() => setOpen(true)} onBlur={event => { if (!root.current?.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => {
          if (event.key === 'ArrowDown' && suggestions.length) { event.preventDefault(); setOpen(true); setActiveIndex(i => (i + 1) % suggestions.length); }
          if (event.key === 'ArrowUp' && suggestions.length) { event.preventDefault(); setOpen(true); setActiveIndex(i => (i <= 0 ? suggestions.length - 1 : i - 1)); }
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'Enter' && open && activeIndex >= 0) { event.preventDefault(); setValue(suggestions[activeIndex]); setOpen(false); }
        }}
        placeholder={placeholder} autoComplete="off" disabled={disabled} role="combobox" aria-expanded={open && suggestions.length > 0} aria-controls={open && suggestions.length ? `suggestions-${number}` : undefined} aria-activedescendant={open && activeIndex >= 0 ? `option-${number}-${activeIndex}` : undefined} aria-autocomplete="list" />
    </div>
    {open && suggestions.length > 0 && <div className="suggestions" id={`suggestions-${number}`} role="listbox">
      {suggestions.map((item, index) => <button type="button" tabIndex={-1} id={`option-${number}-${index}`} role="option" aria-selected={index === activeIndex} className={index === activeIndex ? 'suggestion active' : 'suggestion'} key={item}
        onMouseDown={event => event.preventDefault()} onClick={() => { setValue(item); setOpen(false); setActiveIndex(-1); }}>
        <span>{item}</span>
      </button>)}
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
  const [toLang, setToLang] = useState(languageFromUrl(initial.to) ?? (initial.lang === 'en' ? 'ru' : 'en'));
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
      if (!multilingual && start.lang !== end.lang) throw new Error('Статьи из разных языковых разделов. Выберите обе из одного.');
      if (!multilingual) validatePair(start, end);
      history.replaceState(null, '', queryUrl(start, end, multilingual));
      onValidationError('');
      onSearch(start, end, multilingual);
    } catch (error) { onValidationError(error instanceof Error ? error.message : 'Проверьте названия статей'); }
  };

  return <form className="search-form" onSubmit={submit}>
    <label className="language-bar">Раздел Википедии
      <select aria-label="Раздел Википедии" disabled={searching} value={lang} onChange={event => setLang(event.target.value)}>
        {availableLanguages.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
      </select>
    </label>
    {import.meta.env.VITE_LINK_SOURCE !== 'local' && <div className="mode-control">
      <label><input type="checkbox" checked={multilingual} onChange={event => setMultilingual(event.target.checked)} /> Межъязыковой поиск</label>
      {multilingual && <label>Язык цели <select value={toLang} onChange={event => setToLang(event.target.value)}>{languages.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>}
    </div>}
    <div className="fields-grid">
      <ArticleInput label="Откуда" number="01" placeholder={`Например, ${fromExample}`} value={from} setValue={value => changeValue(value, setFrom)} lang={lang} disabled={searching} />
      <ArticleInput label="Куда" number="02" placeholder={`Например, ${toExample}`} value={to} setValue={value => changeValue(value, setTo)} lang={multilingual ? toLang : lang} disabled={searching} />
      {searching ? <button key="cancel" className="submit-button cancel-button" type="button" onClick={event => { event.preventDefault(); onCancel(); }}>Остановить</button>
        : <button key="submit" className="submit-button" type="submit">Найти нить</button>}
    </div>
    <div className="query-actions">
      <button type="button" onClick={() => { if (multilingual && from.trim() && to.trim()) { setFrom(`https://${parseInput(to, toLang).lang}.wikipedia.org/wiki/${parseInput(to, toLang).title}`); setTo(`https://${parseInput(from, lang).lang}.wikipedia.org/wiki/${parseInput(from, lang).title}`); } else { setFrom(to); setTo(from); } }}>Поменять статьи местами</button>
      <button type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(queryUrl(parseInput(from, lang), parseInput(to, multilingual ? toLang : lang), multilingual)); setCopyStatus('Ссылка скопирована'); }
        catch { setCopyStatus('Введите статьи; ссылку также можно скопировать из адресной строки после поиска.'); }
      }}>Скопировать ссылку</button>
      <span role="status">{copyStatus}</span>
    </div>
    <div className="form-bottom">
      <div className="form-tip">Введите название или ссылку. Для разных разделов включите межъязыковой поиск.</div>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}
