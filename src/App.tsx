import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Hero } from './components/Hero';
import { PathVisualizer } from './components/PathVisualizer';
import { ProgressIndicator } from './components/ProgressIndicator';
import { Footer } from './components/Footer';
import type { ParsedArticle } from './lib/parseInput';
import type { BfsResumeState, SearchProgress, SearchResult } from './lib/bfs';
import type { WorkerMessage } from './lib/bfs.worker';
import { DEFAULT_LIMITS } from './lib/searchLimits';

const githubUrl = import.meta.env.VITE_GITHUB_URL || 'https://github.com/ivanmikhaylov1/Wikipedia-path-finder';

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
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState<SearchProgress | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [candidate, setCandidate] = useState<Extract<SearchResult, { status: 'found' }> | null>(null);
  const [resumeState, setResumeState] = useState<BfsResumeState | null>(null);
  const [error, setError] = useState('');
  const [resultLang, setResultLang] = useState('ru');
  const [resultMultilingual, setResultMultilingual] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const lastQuery = useRef<{ from: string; to: string; lang: string; toLang: string; multilingual: boolean } | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const cancel = () => {
    workerRef.current?.terminate(); workerRef.current = null;
    setSearching(false); setError('Поиск остановлен.');
  };
  const startWorker = (from: string, to: string, lang: string, resume?: BfsResumeState, toLang = lang, multilingual = false) => {
    workerRef.current?.terminate();
    setSearching(true); setProgress(null); setResult(current => resume ? (current?.status === 'found' ? current : null) : null); setError(''); setResultLang(lang); setResultMultilingual(multilingual);
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
    worker.postMessage({ from, to, lang, toLang, multilingual, limits: browserTestLimits(), resumeState: resume });
    document.getElementById('route')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const search = (from: ParsedArticle, to: ParsedArticle, multilingual = false) => {
    lastQuery.current = { from: from.title, to: to.title, lang: from.lang, toLang: to.lang, multilingual };
    startWorker(from.title, to.title, from.lang, undefined, to.lang, multilingual);
  };
  const resumeSearch = () => {
    if (!resumeState || !lastQuery.current) return;
    startWorker(lastQuery.current.from, lastQuery.current.to, lastQuery.current.lang, resumeState, lastQuery.current.toLang, lastQuery.current.multilingual);
  };
  return <div className="app-shell">
    <nav aria-label="Быстрые ссылки">
    <a className="side-repo" href={githubUrl} target="_blank" rel="noopener noreferrer" aria-label="Репозиторий на GitHub"><span>РЕПОЗИТОРИЙ</span><ArrowUpRight size={16} /></a>
    <a className="skip-link" href="#search">Перейти к поиску</a>
    </nav>
    <main>
      <Hero searching={searching} error={error} onSearch={search} onCancel={cancel} onValidationError={setError} />
      <PathVisualizer path={result?.status === 'found' ? result.path : candidate?.path ?? null} lang={resultLang} multilingual={resultMultilingual} approximate={result?.status !== 'found' || !result.exact ? Boolean(candidate) : false} />
      <ProgressIndicator searching={searching} progress={progress} result={result} candidate={candidate} error={error} canResume={Boolean(resumeState)} onResume={resumeSearch} />
    </main>
    <Footer />
  </div>;
}
