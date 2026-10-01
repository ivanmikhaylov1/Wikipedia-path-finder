import { useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { PathVisualizer } from './components/PathVisualizer';
import { ProgressIndicator } from './components/ProgressIndicator';
import { Footer } from './components/Footer';
import type { ParsedArticle } from './lib/parseInput';
import type { BfsResumeState, SearchResult } from './lib/bfs';
import type { ThreadProgress, WorkerMessage } from './lib/bfs.worker';
import { DEFAULT_LIMITS } from './lib/searchLimits';
import type { Phase } from './lib/threadMotion';

export default function App() {
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState<ThreadProgress | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [candidate, setCandidate] = useState<Extract<SearchResult, { status: 'found' }> | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState({ from: '', to: '', lang: 'ru', toLang: 'ru', multilingual: false });
  const [searchId, setSearchId] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const workerRef = useRef<Worker | null>(null);
  const resumeState = useRef<BfsResumeState | undefined>(undefined);
  useEffect(() => () => workerRef.current?.terminate(), []);

  const cancel = () => {
    workerRef.current?.terminate(); workerRef.current = null;
    setSearching(false); setResult(null); setCandidate(null); setProgress(null); setPhase('idle');
    setError('Поиск остановлен. Можно изменить статьи и попробовать снова.');
  };
  const startWorker = (from: string, to: string, lang: string, resume?: BfsResumeState, multilingual = false, toLang = lang) => {
    workerRef.current?.terminate();
    setSearching(true); setProgress(null); setResult(null); setError(''); setPhase('search');
    setQuery({ from, to, lang, toLang, multilingual }); setSearchId(id => id + 1);
    if (!resume) setCandidate(null);
    resumeState.current = undefined;
    const worker = new Worker(new URL('./lib/bfs.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    const finish = () => { setSearching(false); worker.terminate(); workerRef.current = null; };
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (workerRef.current !== worker) return;
      const message = event.data;
      switch (message.type) {
        case 'progress': setProgress(message); break;
        case 'candidate': setCandidate({ status: 'found', path: message.path, exact: false }); break;
        case 'found': setResult({ status: 'found', path: message.path, exact: true }); finish(); break;
        case 'notFound':
          setResult({ status: 'not_found', reason: message.reason, resumeState: message.resumeState });
          resumeState.current = message.resumeState; finish(); break;
        case 'error': setError(`${message.message} Проверьте статьи и повторите поиск.`); setCandidate(null); finish(); break;
      }
    };
    worker.onerror = () => {
      if (workerRef.current !== worker) return;
      setError('Не удалось запустить поиск. Обновите страницу и повторите попытку.'); setCandidate(null); finish();
    };
    worker.postMessage({ from, to, lang, toLang, multilingual, limits: DEFAULT_LIMITS, resumeState: resume });
  };
  const search = (from: ParsedArticle, to: ParsedArticle, multilingual = false) => {
    startWorker(from.title, to.title, from.lang, undefined, multilingual, to.lang);
  };
  const resumeSearch = () => {
    if (resumeState.current) startWorker(query.from, query.to, query.lang, resumeState.current, query.multilingual, query.toLang);
  };
  const path = !searching && !error ? result?.status === 'found' ? result.path : candidate?.path ?? null : null;
  return <div className="app-shell">
    <a className="skip-link" href="#main">Перейти к поиску</a><Header />
    <main id="main">
      <Hero searching={searching} error={error} onSearch={search} onCancel={cancel} onValidationError={setError} />
      <PathVisualizer path={path} lang={query.lang} multilingual={query.multilingual} approximate={result?.status !== 'found' && Boolean(candidate)}
        searchId={searchId} searching={searching} progress={progress} from={query.from} to={query.to} onPhase={setPhase} />
      <ProgressIndicator searching={searching} phase={phase} progress={progress} result={result} candidate={candidate} error={error}
        canResume={Boolean(resumeState.current)} onResume={resumeSearch} />
    </main><Footer />
  </div>;
}
