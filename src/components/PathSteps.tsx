import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { articleFromKey } from '../lib/multilingualLinkSource';

interface Summary { description?: string; extract?: string; thumbnail?: { source: string; width: number; height: number } }
function ArticleStep({ title, lang, index, lit, crossLanguage }: { title: string; lang: string; index: number; lit: boolean; crossLanguage: boolean }) {
  const root = useRef<HTMLLIElement>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (import.meta.env.VITE_LINK_SOURCE === 'local') { setLoading(false); return; }
    const element = root.current;
    if (!element) return;
    const controller = new AbortController();
    let live = true, timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      timer = setTimeout(() => controller.abort(), 10000);
      fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(' ', '_'))}`, { signal: controller.signal })
        .then(response => { if (!response.ok) throw new Error('Summary unavailable'); return response.json() as Promise<Summary>; })
        .then(data => { if (live) setSummary(data); }).catch(() => { /* The article link works even when the summary is unavailable. */ })
        .finally(() => { if (live) setLoading(false); clearTimeout(timer); });
    }, { rootMargin: '150px' });
    observer.observe(element);
    return () => { live = false; observer.disconnect(); controller.abort(); clearTimeout(timer); };
  }, [title, lang]);
  const description = summary?.description || summary?.extract?.split(/(?<=[.!?])\s/)[0];
  return <li ref={root} className={`path-step ${lit ? 'is-lit' : ''}`}>
    <small>{index === 0 ? 'Старт' : `Шаг ${index}`}</small>
    {crossLanguage && <span className="transition-label">межъязыковой переход</span>}
    <h3><a href={`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`} target="_blank" rel="noopener noreferrer">{title}</a></h3>
    <div className="summary-media" aria-busy={loading}>
      {loading ? <div className="summary-skeleton" aria-hidden="true" /> : summary?.thumbnail ? <img src={summary.thumbnail.source} alt={`Иллюстрация к статье «${title}»`} width={summary.thumbnail.width} height={summary.thumbnail.height} loading="lazy" decoding="async" /> : <div className="summary-placeholder" aria-hidden="true" />}
    </div>
    <div className="summary-copy">{loading ? <div className="summary-lines" aria-hidden="true"><span /><span /></div> : <p>{description ? description.length > 160 ? `${description.slice(0, 157).trim()}…` : description : 'Откройте статью в Википедии, чтобы узнать больше.'}</p>}</div>
  </li>;
}
export function PathSteps({ path, lang, multilingual = false, litCount }: { path: string[]; lang: string; multilingual?: boolean; litCount: number }) {
  return <ol className="path-list" aria-label="Последовательность статей" style={{ '--columns': Math.min(5, path.length) } as CSSProperties}>
    {path.map((key, index) => { const article = multilingual ? articleFromKey(key) : { title: key, lang }; return <ArticleStep key={`${key}-${index}`} title={article.title} lang={article.lang} index={index} lit={index < litCount} crossLanguage={index > 0 && multilingual && articleFromKey(path[index - 1]).lang !== article.lang} />; })}
  </ol>;
}
