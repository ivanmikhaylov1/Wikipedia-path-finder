import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, GitFork } from 'lucide-react';
import { Hero } from './components/Hero';
import { PathVisualizer } from './components/PathVisualizer';
import { ProgressIndicator } from './components/ProgressIndicator';
import { SpeedrunSection } from './components/SpeedrunSection';
import type { RacePair } from './components/RaceMode';
import { ThemeToggle } from './components/ThemeToggle';
import { Footer } from './components/Footer';
import type { ParsedArticle } from './lib/parseInput';
import type { BfsResumeState, SearchProgress, SearchResult } from './lib/bfs';
import type { WorkerMessage } from './lib/bfs.worker';
import { DEFAULT_LIMITS } from './lib/searchLimits';
import type { QuickPair } from './components/SearchForm';

function browserTestLimits() {
  if (!import.meta.env.DEV) return DEFAULT_LIMITS;
  const params = new URLSearchParams(location.search);
  const patch: Partial<typeof DEFAULT_LIMITS> = {};
  for (const key of ['maxDepth', 'maxTotalRequests', 'maxLinksPerPage'] as const) {
    const value = Number(params.get(key));
    if (params.has(key) && Number.isInteger(value) && value > 0) Object.assign(patch, { [key]: key === 'maxLinksPerPage' ? Math.min(value, DEFAULT_LIMITS.maxLinksPerPage) : value });
  }
  return { ...DEFAULT_LIMITS, ...patch };
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('theme') === 'dark' ? 'dark' : 'light');
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState<SearchProgress | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [candidate, setCandidate] = useState<Extract<SearchResult, { status: 'found' }> | null>(null);
  const [resumeState, setResumeState] = useState<BfsResumeState | null>(null);
  const [error, setError] = useState('');
  const [resultLang, setResultLang] = useState('ru');
  const [quickPair, setQuickPair] = useState<QuickPair | null>(null);
  const [lastPair, setLastPair] = useState<RacePair | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const lastQuery = useRef<{ from: string; to: string; lang: string } | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);
  useEffect(() => () => workerRef.current?.terminate(), []);

  const cancel = () => {
    workerRef.current?.terminate(); workerRef.current = null;
    setSearching(false); setError('Поиск остановлен.');
  };
  const startWorker = (from: string, to: string, lang: string, resume?: BfsResumeState) => {
    workerRef.current?.terminate();
    setSearching(true); setProgress(null); setResult(current => resume ? (current?.status === 'found' ? current : null) : null); setError(''); setResultLang(lang);
    if (!resume) { setCandidate(null); setResumeState(null); }
    const worker = new Worker(new URL('./lib/bfs.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (workerRef.current !== worker) return;
      const message = event.data;
      if (message.type === 'progress') setProgress(message.progress);
      if (message.type === 'result') {
        if (message.result.status === 'found' && !message.result.exact) {
          setCandidate(message.result); setResult(message.result);
        } else {
          setResult(message.result);
          setResumeState(message.result.status === 'not_found' ? message.result.resumeState ?? null : null);
          setSearching(false); worker.terminate(); workerRef.current = null;
        }
      }
      if (message.type === 'error') { setError(message.message); setSearching(false); worker.terminate(); workerRef.current = null; }
    };
    worker.onerror = () => { setError('Не удалось запустить поиск. Обновите страницу и повторите попытку.'); setSearching(false); worker.terminate(); workerRef.current = null; };
    worker.postMessage({ from, to, lang, limits: browserTestLimits(), resumeState: resume });
    document.getElementById('route')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const search = (from: ParsedArticle, to: ParsedArticle) => {
    lastQuery.current = { from: from.title, to: to.title, lang: from.lang };
    setLastPair({ from: from.title, to: to.title, lang: from.lang });
    startWorker(from.title, to.title, from.lang);
  };
  const resumeSearch = () => {
    if (!resumeState || !lastQuery.current) return;
    startWorker(lastQuery.current.from, lastQuery.current.to, lastQuery.current.lang, resumeState);
  };
  const quickSearch = (from: string, to: string) => {
    setQuickPair(previous => ({ from, to, sequence: (previous?.sequence ?? 0) + 1 }));
    search({ title: from, lang: 'ru' }, { title: to, lang: 'ru' });
  };

  return <div className="app-shell">
    <header className="site-header"><div className="page-width header-inner"><a className="brand" href="#top" aria-label="Переходы — наверх"><span className="brand-mark"><i /><i /><i /></span><span>ПЕРЕХОДЫ<span className="brand-period">.</span></span></a><nav aria-label="Основная навигация"><a href="#route">МАРШРУТ</a><a href="#how">КАК РАБОТАЕТ</a></nav><div className="header-actions"><span className="header-edition">WIKIPEDIA PATH FINDER <span>© 2026</span></span><ThemeToggle theme={theme} onToggle={() => setTheme(current => current === 'light' ? 'dark' : 'light')} /></div></div></header>
    <main id="top">
      <Hero searching={searching} error={error} quickPair={quickPair} onSearch={search} onCancel={cancel} onValidationError={setError} />
      <PathVisualizer path={result?.status === 'found' ? result.path : candidate?.path ?? null} lang={resultLang} approximate={result?.status !== 'found' || !result.exact ? Boolean(candidate) : false} />
      <ProgressIndicator searching={searching} progress={progress} result={result} candidate={candidate} error={error} canResume={Boolean(resumeState)} onResume={resumeSearch} />
      <SpeedrunSection pair={lastPair} shortestClicks={result?.status === 'found' && result.exact ? result.path.length - 1 : null} onNewPair={pair => quickSearch(pair.from, pair.to)} />
      <section className="how-section" id="how"><div className="page-width how-inner"><div className="how-left"><span className="how-index">05 / ПОД КАПОТОМ</span><h2>Два шага<br />навстречу<span>.</span></h2><div className="how-symbol"><GitFork size={73} strokeWidth={0.9} /></div></div><div className="how-right"><p className="how-lead">Поиск начинается одновременно с обеих статей: по исходящим ссылкам от первой и по входящим ко второй.</p><p>Как только фронты встречаются, мы собираем цепочку. Алгоритм работает в Web Worker, поэтому страница остаётся отзывчивой. Запросы идут напрямую к MediaWiki API — без нашего сервера.</p><div className="how-note"><span>ВАЖНО ЗНАТЬ</span><p>Для крупных статей мы ограничиваем число ссылок и время поиска. Поэтому найденный маршрут может не быть абсолютно кратчайшим, а отсутствие результата не означает отсутствие пути.</p></div><a href="https://www.mediawiki.org/wiki/API:Main_page" target="_blank" rel="noopener noreferrer">О MEDIAWIKI API <ArrowUpRight size={17} /></a></div></div></section>
    </main>
    <Footer />
  </div>;
}
