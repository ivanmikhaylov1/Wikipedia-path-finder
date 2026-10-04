import { useEffect, useRef, useState } from 'react';
import { resolveArticleSelection, type ArticleSelection } from '../lib/articleSelection';
import type { ParsedArticle } from '../lib/parseInput';
import { useArticleSuggestions } from './useArticleSuggestions';

export interface ArticleFieldProps {
  id: 'article-01' | 'article-02'; label: string; number: '01' | '02';
  selection: ArticleSelection; onChange(selection: ArticleSelection): void;
  disabled: boolean; localLang?: string; error?: string;
}

export function ArticleField({ id, label, number, selection, onChange, disabled, localLang, error }: ArticleFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const suggestions = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const keyOf = (article: ParsedArticle) => JSON.stringify([article.lang, article.title]);
  const { articles, loading, failed } = useArticleSuggestions(selection.value, editing && !disabled && localLang === undefined && !selection.selected);
  const activeIndex = articles.findIndex(article => keyOf(article) === activeKey);
  useEffect(() => { setActiveKey(null); }, [selection.value]);
  useEffect(() => {
    if (activeKey !== null && activeIndex < 0) setActiveKey(null);
  }, [activeKey, activeIndex]);
  let lang = localLang ?? 'ru', title = selection.value;
  try { const article = resolveArticleSelection(selection, localLang); lang = article.lang; title = article.title; } catch { /* Keep invalid text editable. */ }
  const expanded = open && !disabled && articles.length > 0;
  const active = expanded && activeIndex >= 0 && activeIndex < articles.length ? activeIndex : -1;
  useEffect(() => {
    const list = suggestions.current;
    const option = active >= 0 ? list?.children.item(active) : null;
    if (!list || !option) return;
    // Reveal only the nearest clipped edge inside the listbox. Scrolling this
    // container directly preserves combobox focus and the page's scroll position.
    const viewport = list.getBoundingClientRect(), row = option.getBoundingClientRect();
    const top = viewport.top + list.clientTop, bottom = top + list.clientHeight;
    if (row.top < top) list.scrollTop += Math.floor(row.top - top);
    else if (row.bottom > bottom) list.scrollTop += Math.ceil(row.bottom - bottom);
  }, [active]);
  const choose = (article: ParsedArticle) => {
    onChange({ value: article.title, selected: article });
    setOpen(false); setActiveKey(null);
  };
  const description = [error && `${id}-error`, failed && `${id}-suggestion-status`].filter(Boolean).join(' ') || undefined;

  const titleSize = title.length > 60 ? 'long' : title.length > 22 ? 'medium' : 'short';
  return <div onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setEditing(false); setOpen(false); setActiveKey(null); } }} data-side={number === '01' ? 'from' : 'to'} data-title-size={titleSize} className={`article-field${editing ? ' is-editing' : ''}${selection.selected ? ' is-selected' : ''}`}>
    <div className="field-top">
      <span className="field-folio" aria-hidden="true">{number}</span>
      <label className="field-label" htmlFor={id}>{label}</label>
      <span className="language-badge" aria-label={`Раздел Википедии ${lang.toUpperCase()}`}>{lang.toUpperCase()}</span>
    </div>
    <div className="field-control">
      <div className="article-display" aria-hidden="true">{title || 'Название статьи'}</div>
      <input ref={input} id={id} className="article-editor" type="text" role="combobox" value={selection.value}
        disabled={disabled} autoComplete="off" placeholder="Название или ссылка Википедии"
        aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? `${id}-suggestions` : undefined}
        aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined}
        aria-invalid={Boolean(error) || undefined} aria-describedby={description}
        onChange={event => { onChange({ value: event.target.value, selected: null }); setOpen(true); setActiveKey(null); }}
        onFocus={() => { setEditing(true); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' && articles.length) { event.preventDefault(); setOpen(true); setActiveKey(current => { const index = articles.findIndex(article => keyOf(article) === current); return keyOf(articles[(index + 1) % articles.length]); }); }
          else if (event.key === 'ArrowUp' && articles.length) { event.preventDefault(); setOpen(true); setActiveKey(current => { const index = articles.findIndex(article => keyOf(article) === current); return keyOf(articles[index <= 0 ? articles.length - 1 : index - 1]); }); }
          else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setActiveKey(null); }
          else if (event.key === 'Enter' && active >= 0) { event.preventDefault(); choose(articles[active]); }
        }} />
      <button className="article-edit-button" type="button" disabled={disabled} aria-label={`Изменить: ${label}`} onClick={() => input.current?.focus()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15l-1 5Z" /></svg><span>Изменить</span></button>
    {expanded && <div ref={suggestions} className="suggestions" id={`${id}-suggestions`} role="listbox" aria-label={`Варианты: ${label}`}>
      {articles.map((article, index) => <button key={JSON.stringify([article.lang, article.title])} id={`${id}-option-${index}`} type="button" role="option" tabIndex={-1}
        aria-selected={index === active} className={`suggestion${index === active ? ' active' : ''}`}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(article)}>
        <span>{article.title}</span><span className="language-badge">{article.lang.toUpperCase()}</span>
      </button>)}
    </div>}
    </div>
    {loading && <p className="suggestion-status" role="status">Ищем статьи…</p>}
    {failed && <p className="suggestion-status" id={`${id}-suggestion-status`} role="status">Подсказки недоступны. Введите название или ссылку Википедии.</p>}
    {error && <p id={`${id}-error`} className="field-error" role="alert">{error}</p>}
  </div>;
}
