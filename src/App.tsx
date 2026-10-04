import { useEffect, useRef, useState } from 'react';
import { CollisionSpread } from './components/CollisionSpread';
import { RouteRibbon } from './components/RouteRibbon';
import { initialArticlePair } from './lib/articleSelection';
import { readSharedQuery, queryUrl } from './lib/shareQuery';
import type { ParsedArticle } from './lib/parseInput';
import type { SearchResult } from './lib/bfs';
import type { ThreadProgress, WorkerMessage, SearchResumeState } from './lib/bfs.worker';
import { DEFAULT_LIMITS } from './lib/searchLimits';
import { limitsHitFromReason, type NotFoundState } from './lib/searchOutcome';

export default function App() {
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState<ThreadProgress | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  // Only verified routes arrive here. Keep the best during further exploration.
  const candidate = useRef<Extract<SearchResult, { status: 'found' }> | null>(null);
  const [improvementExplanation, setImprovementExplanation] = useState('');
  const [notFound, setNotFound] = useState<NotFoundState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState({ from: '', to: '', lang: 'ru', toLang: 'ru', multilingual: false });
  const [searchId, setSearchId] = useState(0);
  const [pair, setPair] = useState(() => initialArticlePair(location.search, import.meta.env.VITE_LINK_SOURCE === 'local'));
  const [localLang] = useState(() => import.meta.env.VITE_LINK_SOURCE === 'local' ? readSharedQuery(location.search).lang : undefined);
  const [focusRequest, setFocusRequest] = useState(0);
  const [shareStatus, setShareStatus] = useState('');
  const focusResult = useRef(false);
  const workerRef = useRef<Worker | null>(null);
  const resumeState = useRef<SearchResumeState | undefined>(undefined);
  useEffect(() => () => workerRef.current?.terminate(), []);

  const cancel = () => {
    workerRef.current?.terminate(); workerRef.current = null;
    setNotFound(null); setSearching(false);
    resumeState.current = undefined;
    if (candidate.current) {
      setResult(candidate.current);
      setImprovementExplanation('Улучшение остановлено. Найденный маршрут сохранён.');
      return;
    }
    setResult(null); setProgress(null);
    setError('Поиск остановлен. Можно изменить статьи и попробовать снова.');
    setFocusRequest(request => request + 1);
  };
  const startWorker = (from: string, to: string, lang: string, resume?: SearchResumeState, multilingual = false, toLang = lang) => {
    workerRef.current?.terminate();
    setPair({ from: { value: from, selected: { title: from, lang } }, to: { value: to, selected: { title: to, lang: toLang } }, example: false });
    setNotFound(null); setSearching(true); setProgress(null); setError(''); setImprovementExplanation('');
    setShareStatus('');
    setQuery({ from, to, lang, toLang, multilingual }); setSearchId(id => id + 1);
    if (!resume) { candidate.current = null; setResult(null); focusResult.current = false; }
    else if (candidate.current) setResult(candidate.current);
    resumeState.current = undefined;
    const worker = new Worker(new URL('./lib/bfs.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    const finish = () => { setSearching(false); worker.terminate(); workerRef.current = null; };
    const accept = (path: string[], exact = false) => {
      if (candidate.current && path.length >= candidate.current.path.length) return;
      if (!candidate.current) focusResult.current = mayFocusResult();
      candidate.current = { status: 'found', path, exact };
      setResult(candidate.current);
    };
    const retained = (reason: string) => setImprovementExplanation(
      reason === 'timeout' ? 'Время поиска закончилось. Найденный маршрут сохранён.'
        : reason === 'budget' ? 'Лимит запросов исчерпан. Найденный маршрут сохранён.'
          : reason === 'error' ? 'Не удалось продолжить поиск. Найденный маршрут сохранён.'
            : 'Поиск завершён. Маршрут найден.');
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (workerRef.current !== worker) return;
      const message = event.data;
      switch (message.type) {
        case 'progress': setProgress(message); break;
        case 'candidate': accept(message.path); break;
        case 'found':
          accept(message.path, message.exact ?? true);
          resumeState.current = message.resumeState;
          retained(message.reason ?? 'complete'); finish(); break;
        case 'notFound':
          if (candidate.current) { resumeState.current = message.resumeState; retained(message.reason); finish(); break; }
          setNotFound({ limitsHit: limitsHitFromReason(message.reason), visited: message.visited, depth: message.depth });
          setProgress(previous => ({ ...previous, depth: message.depth, visited: message.visited, frontierA: 0, frontierB: 0 }));
          setResult({ status: 'not_found', reason: message.reason });
          resumeState.current = message.resumeState; finish(); break;
        case 'error':
          if (candidate.current) retained('error');
          else setError(`${message.message} Проверьте статьи и повторите поиск.`);
          finish(); break;
      }
    };
    worker.onerror = () => {
      if (workerRef.current !== worker) return;
      if (candidate.current) retained('error');
      else setError('Не удалось запустить поиск. Обновите страницу и повторите попытку.');
      finish();
    };
    worker.postMessage({ from, to, lang, toLang, multilingual, limits: DEFAULT_LIMITS, resumeState: resume });
  };
  const search = (from: ParsedArticle, to: ParsedArticle, multilingual = false) => {
    startWorker(from.title, to.title, from.lang, undefined, multilingual, to.lang);
  };
  const resumeSearch = () => {
    if (resumeState.current) startWorker(query.from, query.to, query.lang, resumeState.current, query.multilingual, query.toLang);
  };
  const path = result?.status === 'found' ? result.path : null;
  function mayFocusResult() {
    const active = document.activeElement;
    return active === document.body || Boolean(active && active.tagName !== 'A' &&
      (formRef.current?.contains(active) || active.closest('.search-status')));
  }
  useEffect(() => {
    if (path && focusResult.current) {
      focusResult.current = false;
      document.getElementById('route-heading')?.focus();
    }
  }, [path]);
  useEffect(() => {
    if (focusRequest) formRef.current?.querySelector<HTMLInputElement>('#article-01')?.focus();
  }, [focusRequest]);
  const clearOutcome = () => {
    workerRef.current?.terminate(); workerRef.current = null; setSearching(false);
    setResult(null); candidate.current = null; setNotFound(null); setProgress(null); setError(''); setShareStatus('');
    setImprovementExplanation(''); focusResult.current = false;
    resumeState.current = undefined;
  };
  const editPair = () => { clearOutcome(); setFocusRequest(request => request + 1); };
  const swapPair = () => {
    setPair(current => ({ from: current.to, to: current.from, example: false }));
    editPair();
  };
  const newPair = () => {
    clearOutcome();
    // A fresh example also clears the shared query in the address bar.
    const url = new URL(location.href);
    url.search = '';
    if (import.meta.env.VITE_LINK_SOURCE === 'local') url.searchParams.set('lang', query.lang);
    history.replaceState(null, '', url);
    setPair(initialArticlePair(url.search, import.meta.env.VITE_LINK_SOURCE === 'local'));
    setFocusRequest(request => request + 1);
  };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(queryUrl({ title: query.from, lang: query.lang }, { title: query.to, lang: query.toLang }, query.multilingual));
      setShareStatus('Ссылка скопирована');
    } catch { setShareStatus('Не удалось скопировать ссылку. Можно скопировать адрес из строки браузера.'); }
  };
  return <div className="app-shell">
    <a className="skip-link" href="#main">Перейти к поиску</a>
    <main id="main">
      {path ? <RouteRibbon path={path} lang={query.lang} multilingual={query.multilingual} onNewPair={newPair} onEdit={editPair} onShare={share} shareStatus={shareStatus}
        searchState={{ searching, progress, explanation: improvementExplanation, canResume: Boolean(resumeState.current), onCancel: cancel, onResume: resumeSearch }} />
        : <CollisionSpread formRef={formRef} pair={pair} onPairChange={setPair} localLang={localLang}
          searching={searching} searchId={searchId} progress={progress} error={error}
          onSearch={search} onCancel={cancel} onValidationError={setError}
          notFound={notFound} canResume={Boolean(resumeState.current)} onResume={resumeSearch} onEdit={editPair} onSwap={swapPair} />}
    </main>
  </div>;
}
