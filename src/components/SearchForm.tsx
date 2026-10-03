import { useEffect, useRef, useState } from 'react';
import { parseInput, validatePair, type ParsedArticle } from '../lib/parseInput';
import { readSharedQuery, queryUrl } from '../lib/shareQuery';
import { DEFAULT_LIMITS } from '../lib/searchLimits';
import { WikiApiClient } from '../lib/wikiApi';

const api = new WikiApiClient({ ...DEFAULT_LIMITS, concurrency: 1 });
const sectionHelp = 'Раздел Википедии — её версия на определённом языке: ru.wikipedia.org на русском, en.wikipedia.org на английском.';
const languages = [{ code: 'ru', label: 'Русский' }, { code: 'en', label: 'Английский' }, { code: 'de', label: 'Немецкий' }, { code: 'fr', label: 'Французский' }, { code: 'es', label: 'Испанский' }];
const examples: Record<string, [string, string]> = {
  ru: ['Москва', 'Юрий Гагарин'], en: ['London', 'Philosophy'],
  de: ['Berlin', 'Philosophie'], fr: ['Paris', 'Philosophie'], es: ['Madrid', 'Filosofía'],
};

function languageFromUrl(value: string): string | null {
  if (!/^https?:\/\//i.test(value.trim())) return null;
  try { return parseInput(value, 'ru').lang; } catch { return null; }
}

export function ArticleInput({ label, number, placeholder, value, setValue, lang, disabled, error, pairErrorId }: {
  label: string; number: string; placeholder: string; value: string; setValue: (value: string) => void;
  lang: string; disabled: boolean; error?: string; pairErrorId?: string;
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
        aria-invalid={Boolean(error || pairErrorId) || undefined} aria-describedby={error ? `error-${number}` : pairErrorId}
        placeholder={placeholder} autoComplete="off" disabled={disabled} role="combobox" aria-expanded={open && suggestions.length > 0} aria-controls={open && suggestions.length ? `suggestions-${number}` : undefined} aria-activedescendant={open && activeIndex >= 0 ? `option-${number}-${activeIndex}` : undefined} aria-autocomplete="list" />
    </div>
    {error && <p id={`error-${number}`} className="form-error" role="alert">{error}</p>}
    {open && suggestions.length > 0 && <div className="suggestions" id={`suggestions-${number}`} role="listbox">
      {suggestions.map((item, index) => <button type="button" tabIndex={-1} id={`option-${number}-${index}`} role="option" aria-selected={index === activeIndex} className={index === activeIndex ? 'suggestion active' : 'suggestion'} key={item}
        onMouseDown={event => event.preventDefault()} onClick={() => { setValue(item); setOpen(false); setActiveIndex(-1); }}>
        <span>{item}</span>
      </button>)}
    </div>}
  </div>;
}

export function SearchForm({ searching, error, onSearch, onCancel, onValidationError, formRef }: {
  formRef?: React.Ref<HTMLFormElement>;
  searching: boolean; error: string; onSearch: (from: ParsedArticle, to: ParsedArticle, multilingual?: boolean) => void;
  onCancel: () => void; onValidationError: (message: string) => void;
}) {
  const local = import.meta.env.VITE_LINK_SOURCE === 'local';
  const initial = readSharedQuery(location.search);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [lang, setLang] = useState(initial.lang);
  const [validation, setValidation] = useState<{ from?: string; to?: string; pair?: string }>({});
  const [copyStatus, setCopyStatus] = useState('');
  const [multilingual, setMultilingual] = useState(initial.multilingual && import.meta.env.VITE_LINK_SOURCE !== 'local');
  const [toLang, setToLang] = useState(languageFromUrl(initial.to) ?? (initial.lang === 'en' ? 'ru' : 'en'));
  const availableLanguages = languages.some(item => item.code === lang)
    ? languages : [...languages, { code: lang, label: lang.toUpperCase() }];
  const [fromExample, toExample] = examples[lang] ?? ['Название статьи', 'Другая статья'];
  const changeValue = (value: string, setValue: (value: string) => void) => {
    setValidation({}); setValue(value);
    const urlLanguage = languageFromUrl(value);
    if (urlLanguage && !multilingual) setLang(urlLanguage);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const errors: { from?: string; to?: string; pair?: string } = {};
    let start: ParsedArticle | undefined, end: ParsedArticle | undefined;
    try { start = parseInput(from, lang); } catch (error) { errors.from = error instanceof Error ? error.message : 'Введите начальную статью'; }
    try { end = parseInput(to, multilingual ? toLang : lang); } catch (error) { errors.to = error instanceof Error ? error.message : 'Введите конечную статью'; }
    if (start && end && !multilingual) {
      try {
        if (start.lang !== end.lang) throw new Error(`Статьи из разных языковых разделов. Выберите обе из одного${local ? '.' : ' или включите межъязыковой поиск.'}`);
        validatePair(start, end);
      } catch (error) { errors.pair = error instanceof Error ? error.message : 'Проверьте пару статей'; }
    }
    setValidation(errors); onValidationError('');
    if (errors.from || errors.to || errors.pair) {
      document.getElementById(errors.from || errors.pair ? 'article-01' : 'article-02')?.focus();
      return;
    }
    if (start && end) {
      history.replaceState(null, '', queryUrl(start, end, multilingual));
      onSearch(start, end, multilingual);
    }
  };

  return <form ref={formRef} className="search-form" onSubmit={submit}>
    <label className="language-bar">Раздел Википедии
      <select aria-label="Раздел Википедии" disabled={searching} value={lang} onChange={event => { setValidation({}); setLang(event.target.value); }}>
        {availableLanguages.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
      </select>
    </label>
    {import.meta.env.VITE_LINK_SOURCE !== 'local' && <div className="mode-control">
      <label><input type="checkbox" aria-describedby="section-help" checked={multilingual} onChange={event => { setValidation({}); setMultilingual(event.target.checked); }} /> Межъязыковой поиск</label>
      {multilingual && <label>Язык цели <select value={toLang} onChange={event => setToLang(event.target.value)}>{languages.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>}
      <p id="section-help" className="section-help">{sectionHelp}</p>
    </div>}
    {local && <p id="section-help" className="section-help">{sectionHelp}</p>}
    <div className="fields-grid">
      <ArticleInput label="Откуда" number="01" error={validation.from} pairErrorId={validation.pair ? "pair-error" : undefined} placeholder={`Например, ${fromExample}`} value={from} setValue={value => changeValue(value, setFrom)} lang={lang} disabled={searching} />
      <ArticleInput label="Куда" number="02" error={validation.to} pairErrorId={validation.pair ? "pair-error" : undefined} placeholder={`Например, ${toExample}`} value={to} setValue={value => changeValue(value, setTo)} lang={multilingual ? toLang : lang} disabled={searching} />
      {searching ? <button key="cancel" className="submit-button cancel-button" type="button" onClick={event => { event.preventDefault(); onCancel(); }}>Остановить</button>
        : <button key="submit" className="submit-button" type="submit">Найти нить</button>}
    </div>
    {validation.pair && <p id="pair-error" className="form-error" role="alert">{validation.pair}</p>}
    <div className="query-actions">
      <button data-swap type="button" disabled={searching} onClick={() => { setValidation({}); if (multilingual && from.trim() && to.trim()) { try { setFrom(`https://${parseInput(to, toLang).lang}.wikipedia.org/wiki/${parseInput(to, toLang).title}`); setTo(`https://${parseInput(from, lang).lang}.wikipedia.org/wiki/${parseInput(from, lang).title}`); } catch { setFrom(to); setTo(from); } } else { setFrom(to); setTo(from); } }}>Поменять статьи местами</button>
      <button type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(queryUrl(parseInput(from, lang), parseInput(to, multilingual ? toLang : lang), multilingual)); setCopyStatus('Ссылка скопирована'); }
        catch { setCopyStatus('Введите статьи; ссылку также можно скопировать из адресной строки после поиска.'); }
      }}>Скопировать ссылку</button>
      <span role="status">{copyStatus}</span>
    </div>
    <div className="form-bottom">
      <div className="form-tip">Введите название или ссылку.{!local && ' Для разных разделов включите межъязыковой поиск.'}</div>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}
