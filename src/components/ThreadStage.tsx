import { useEffect, useRef, useState } from 'react';
import type { ThreadProgress } from '../lib/bfs.worker';
import { clamp01, curveLengths, DRAW_MS, easeInOut, knowledgeNodes, MEET_MS, nearestEdges, pathPoints, phaseAt, sampleCurve, SEARCH_MIN_MS, waveRadius, type Phase, type Point } from '../lib/threadMotion';

interface Props {
  searchId: number; searching: boolean; path: string[] | null; transitions?: boolean[];
  progress: ThreadProgress | null; from: string; to: string;
  onLitCount: (count: number) => void; onPhase: (phase: Phase) => void;
}
function DrumNumber({ value }: { value: number }) {
  return <strong className="counter-window"><span key={value} className="counter-drum">{value.toLocaleString('ru-RU')}</span></strong>;
}

export function ThreadStage(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const current = useRef(props);
  current.current = props;
  const [phase, setPhase] = useState<Phase>('idle');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    const context = canvas?.getContext('2d');
    if (!canvas || !parent || !context) return;
    const ctx = context;
    let painted = false;
    let disposed = false, raf = 0, lastTime = 0, elapsed = 0, foundAt: number | null = null;
    let id = current.current.searchId, lastPhase: Phase = 'idle', lastLit = -1;
    let width = 1, height = 1, dpr = 1, oldCurve: Point[] = [], lastFraction = -1;
    let points: Point[] = [], curve: Point[] = [], lengths: number[] = [], titles: string[] | null = null;
    let radius = 0, observedDepth = 0, observedVisited = 0;
    let ink = '', accent = '', surface = '', displayFont = '';
    const nodes = knowledgeNodes(), edges = nearestEdges(nodes);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const readColors = () => {
      const css = getComputedStyle(parent);
      ink = css.getPropertyValue('--ink').trim(); accent = css.getPropertyValue('--accent').trim();
      surface = css.getPropertyValue('--surface').trim(); displayFont = css.getPropertyValue('--display').trim();
    };
    readColors();
    const themeObserver = new MutationObserver(() => { readColors(); start(); });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const resize = () => {
      const rect = parent.getBoundingClientRect(); width = rect.width; height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      lengths = curveLengths(curve, width, height); start();
    };
    const observer = new ResizeObserver(resize);
    const dot = (p: Point, r: number, color: string, alpha: number) => {
      ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x * width, p.y * height, r, 0, Math.PI * 2); ctx.fill();
    };
    const ring = (p: Point, r: number, color: string, alpha: number, line = 1) => {
      ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = line;
      ctx.beginPath(); ctx.arc(p.x * width, p.y * height, r, 0, Math.PI * 2); ctx.stroke();
    };
    const stroke = (samples: Point[], fraction: number, alpha = 1) => {
      if (!samples.length) return;
      const arc = samples === curve ? lengths : curveLengths(samples, width, height);
      ctx.globalAlpha = alpha; ctx.strokeStyle = accent; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowColor = accent; ctx.shadowBlur = 16; ctx.beginPath(); ctx.moveTo(samples[0].x * width, samples[0].y * height);
      for (let i = 1; i < samples.length; i++) {
        // sampleCurve uses 40 samples per article-to-article segment.
        if ((i - 1) % 40 === 0) {
          ctx.stroke(); ctx.beginPath();
          ctx.setLineDash(current.current.transitions?.[Math.floor((i - 1) / 40)] ? [8, 7] : []);
          ctx.moveTo(samples[i - 1].x * width, samples[i - 1].y * height);
        }
        if (arc[i] > fraction) {
          const mix = clamp01((fraction - arc[i - 1]) / Math.max(.00001, arc[i] - arc[i - 1]));
          ctx.lineTo((samples[i - 1].x + (samples[i].x - samples[i - 1].x) * mix) * width, (samples[i - 1].y + (samples[i].y - samples[i - 1].y) * mix) * height); break;
        }
        ctx.lineTo(samples[i].x * width, samples[i].y * height);
      }
      ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
    };
    const label = (title: string, p: Point, index: number, count: number) => {
      ctx.globalAlpha = .9; ctx.fillStyle = ink; ctx.font = `${width < 500 ? 10 : 12}px ${displayFont}`;
      ctx.textAlign = index === 0 && count > 1 ? 'left' : index === count - 1 && count > 1 ? 'right' : 'center';
      // Alternate labels and limit width so long article names never clip the stage.
      const available = width < 500 ? Math.min(100, width / Math.max(2, count) * 1.4) : Math.min(190, width / Math.min(count, 5));
      let fitted = title;
      while (ctx.measureText(fitted).width > available && fitted.length > 2) fitted = fitted.slice(0, -2).trimEnd() + '…';
      ctx.fillText(fitted, p.x * width, p.y * height + (index % 2 ? -22 : 28));
    };
    function frame(time: number) {
      raf = 0;
      if (disposed || document.hidden) return;
      const data = current.current;
      let delta = lastTime ? Math.min(64, time - lastTime) : 0;
      lastTime = time;
      if (data.searchId !== id) {
        delta = 0; oldCurve = lastFraction >= 0 ? curve.filter((_, i) => (lengths[i] ?? 0) <= lastFraction) : []; lastFraction = -1; id = data.searchId; elapsed = 0; foundAt = null; titles = null;
        points = []; curve = []; lengths = []; radius = 0; observedDepth = 0; observedVisited = 0; lastLit = -1;
      }
      elapsed += delta;
      if (data.path && data.path !== titles) {
        titles = data.path; points = pathPoints(titles.length); curve = sampleCurve(points);
        lengths = curveLengths(curve, width, height); foundAt = elapsed;
      }
      if (!data.searching && !data.path) { foundAt = null; titles = null; points = []; curve = []; lengths = []; }
      const nextPhase = phaseAt(elapsed, foundAt, data.searching, reduced.matches);
      if (nextPhase !== lastPhase) { lastPhase = nextPhase; setPhase(nextPhase); data.onPhase(nextPhase); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = surface; ctx.fillRect(0, 0, width, height);
      edges.forEach(([a, b]) => {
        ctx.globalAlpha = .09; ctx.strokeStyle = ink; ctx.lineWidth = .5;
        ctx.beginPath(); ctx.moveTo(nodes[a].x * width, nodes[a].y * height); ctx.lineTo(nodes[b].x * width, nodes[b].y * height); ctx.stroke();
      });
      const startPoint = { x: .11, y: .43 }, endPoint = { x: .89, y: .43 };
      observedDepth = Math.max(observedDepth, data.progress?.depth ?? 0);
      observedVisited = Math.max(observedVisited, data.progress?.visited ?? 0);
      const target = waveRadius(observedDepth, observedVisited, elapsed, foundAt !== null);
      radius += (target - radius) * (1 - Math.exp(-delta / 180));
      const wave = !reduced.matches && (nextPhase === 'search' || nextPhase === 'meet');
      const waveSize = radius * width;
      nodes.forEach((p, i) => {
        let color = ink, alpha = .16 + (reduced.matches ? 0 : (Math.sin(time / 1900 + i * 1.4) + 1) * .06);
        if (wave && waveSize > 0) {
          const a = Math.hypot((p.x - startPoint.x) * width, (p.y - startPoint.y) * height);
          const b = Math.hypot((p.x - endPoint.x) * width, (p.y - endPoint.y) * height);
          if (Math.min(a, b) < waveSize) { color = b < a ? accent : ink; alpha = .2 + Math.min(1, Math.min(a, b) / waveSize) * .55; }
        }
        dot(p, i % 7 === 0 ? 1.8 : 1.1, color, alpha);
      });
      if (wave) {
        const pulse = elapsed > SEARCH_MIN_MS && foundAt === null ? 1 + Math.sin(time / 700) * .018 : 1;
        ring(startPoint, waveSize * pulse, ink, .38); ring(endPoint, waveSize * pulse, accent, .55);
      }
      if (nextPhase === 'idle' || nextPhase === 'search') {
        dot(startPoint, 4, ink, .8); dot(endPoint, 4, accent, .9);
        label(data.from || 'Начало', startPoint, 0, 2); label(data.to || 'Конец', endPoint, 1, 2);
      }
      if (nextPhase === 'meet' && foundAt !== null) {
        const flash = clamp01((elapsed - Math.max(SEARCH_MIN_MS, foundAt)) / MEET_MS);
        ring({ x: .5, y: .43 }, 8 + flash * width * .23, accent, (1 - flash) ** 2, 2);
        dot({ x: .5, y: .43 }, 5 + flash * 10, accent, (1 - flash) ** 3);
      }
      const draw = nextPhase === 'done' ? 1 : nextPhase === 'draw' && foundAt !== null ? easeInOut(clamp01((elapsed - Math.max(SEARCH_MIN_MS, foundAt) - MEET_MS) / DRAW_MS)) : -1;
      lastFraction = draw;
      let lit = 0;
      if (draw >= 0) {
        stroke(curve, draw);
        points.forEach((p, i) => {
          if (draw + .00001 >= (lengths[i * 40] ?? 0)) { lit++; ring(p, 11, accent, .2, 5); dot(p, 4.5, accent, 1); label(titles?.[i] ?? '', p, i, points.length); }
        });
      }
      if (oldCurve.length && elapsed < 320 && !reduced.matches) stroke(oldCurve, 1, (1 - elapsed / 320) * .5);
      else oldCurve = [];
      if (lit !== lastLit) { lastLit = lit; data.onLitCount(lit); }
      ctx.globalAlpha = 1;
      if (!painted) { painted = true; setReady(true); }
      if (!reduced.matches && ['search', 'meet', 'draw'].includes(nextPhase)) raf = requestAnimationFrame(frame);
    }
    function start() { if (!disposed && !document.hidden && !raf) raf = requestAnimationFrame(frame); }
    const visibility = () => { cancelAnimationFrame(raf); raf = 0; lastTime = 0; start(); };
    const motion = () => { lastTime = 0; start(); };
    document.addEventListener('visibilitychange', visibility); reduced.addEventListener('change', motion);
    // React progress/path updates can wake a reduced-motion stage without a second ticker.
    parent.addEventListener('thread-update', start);
    observer.observe(parent); resize();
    return () => {
      disposed = true; cancelAnimationFrame(raf); observer.disconnect(); themeObserver.disconnect();
      document.removeEventListener('visibilitychange', visibility); reduced.removeEventListener('change', motion); parent.removeEventListener('thread-update', start);
    };
  }, []);
  useEffect(() => { canvasRef.current?.parentElement?.dispatchEvent(new Event('thread-update')); }, [props.searchId, props.path, props.searching, props.progress]);

  return <div className={`stage ${ready ? 'is-ready' : ''}`} data-phase={phase}>
    <div className="stage-fallback" aria-hidden="true" />
    <canvas ref={canvasRef} className="thread-canvas" role="img" aria-label={props.path ? `Карта пути: ${props.path.join(', ')}${props.transitions?.some(Boolean) ? '. Пунктир — межъязыковой переход.' : ''}` : 'Карта знаний. Поиск распространяется от начальной и конечной статей.'} />
    <p className="stage-note">{phase === 'search' ? 'Ищем связь между статьями' : phase === 'meet' ? 'Нашли точку встречи' : phase === 'draw' ? 'Протягиваем нить' : phase === 'done' ? 'Нить найдена' : 'Введите две статьи, чтобы увидеть связь.'}</p>
    <div className="stage-counters" aria-hidden="true"><div><DrumNumber value={props.progress?.depth ?? 0} /><span>Глубина</span></div><div><DrumNumber value={props.progress?.visited ?? 0} /><span>Статей просмотрено</span></div></div>
  </div>;
}
