import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, FlagTriangleRight, RotateCcw } from 'lucide-react';
import stopwatch from '../assets/images/stopwatch.png';

export interface RacePair { from: string; to: string; lang: string }

const suggestedPairs: RacePair[] = [
  { from: 'Гитара', to: 'Философия', lang: 'ru' },
  { from: 'Помидор', to: 'Философия', lang: 'ru' },
  { from: 'Москва', to: 'Математика', lang: 'ru' },
];

export function formatRaceTime(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor(milliseconds / 1000) % 60;
  const hundredths = Math.floor(milliseconds / 10) % 100;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

export function countLabel(count: number, one: string, few: string, many: string): string {
  const lastTwo = count % 100;
  const last = count % 10;
  return `${count} ${lastTwo >= 11 && lastTwo <= 14 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many}`;
}

export function RaceMode({ pair, shortestClicks, onNewPair }: {
  pair: RacePair | null;
  shortestClicks: number | null;
  onNewPair: (pair: RacePair) => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'running' | 'finished'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [clicks, setClicks] = useState('');
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    setPhase('idle'); setElapsed(0); setClicks(''); startedAt.current = null;
  }, [pair?.from, pair?.to, pair?.lang]);
  useEffect(() => {
    if (phase !== 'running') return;
    const timer = window.setInterval(() => {
      if (startedAt.current !== null) setElapsed(performance.now() - startedAt.current);
    }, 40);
    return () => window.clearInterval(timer);
  }, [phase]);

  const newPair = () => {
    const available = suggestedPairs.filter(item => !pair || item.from !== pair.from || item.to !== pair.to);
    onNewPair(available[Math.floor(Math.random() * available.length)]);
  };
  const start = () => { startedAt.current = performance.now(); setElapsed(0); setClicks(''); setPhase('running'); };
  const finish = () => {
    if (startedAt.current !== null) setElapsed(performance.now() - startedAt.current);
    setPhase('finished');
  };
  const clickCount = clicks === '' ? null : Number(clicks);
  const validClicks = clickCount !== null && Number.isInteger(clickCount) && clickCount >= 0;
  const startUrl = pair ? `https://${pair.lang}.wikipedia.org/wiki/${encodeURIComponent(pair.from.replaceAll(' ', '_'))}` : '';

  return <div className="race-panel" id="race">
    <div className="race-topline"><span>ИНТЕРАКТИВНЫЙ РЕЖИМ / 01</span><span>НА ЧЕСТНОСТЬ</span></div>
    <div className="race-layout">
      <div className="race-clock" aria-label={`Секундомер: ${formatRaceTime(elapsed)}`}>
        <img src={stopwatch} alt="" aria-hidden="true" />
        <span className="clock-hand clock-hand-minutes" style={{ transform: `rotate(${elapsed / 3_600_000 * 360}deg)` }} />
        <span className="clock-hand clock-hand-seconds" style={{ transform: `rotate(${elapsed / 60_000 * 360}deg)` }} />
        <span className="clock-pivot" />
      </div>
      <div className="race-content">
        <span className="race-kicker">ЧЕЛОВЕК ПРОТИВ МАРШРУТА</span>
        <h3>Обгони алгоритм<span>.</span></h3>
        <p>Откройте стартовую статью и переходите к цели только по внутренним ссылкам. Таймер здесь; википедия откроется в новой вкладке.</p>
        <div className="race-pair" aria-live="polite"><span>{pair?.from ?? 'ПАРА НЕ ВЫБРАНА'}</span><b>→</b><span>{pair?.to ?? 'ВЫБЕРИТЕ ПАРУ'}</span></div>
        <div className="race-actions">
          {phase === 'idle' && <button className="race-primary" type="button" onClick={start} disabled={!pair}><FlagTriangleRight size={17} /> СТАРТ</button>}
          {phase === 'running' && <button className="race-primary" type="button" onClick={finish}><FlagTriangleRight size={17} /> ФИНИШ</button>}
          {phase === 'finished' && <button className="race-primary" type="button" onClick={start}><RotateCcw size={17} /> ЕЩЁ ПОПЫТКА</button>}
          {pair && <a className="race-wiki-link" href={startUrl} target="_blank" rel="noopener noreferrer">ОТКРЫТЬ СТАРТ В WIKIPEDIA <ArrowUpRight size={16} /></a>}
          <button className="race-new-pair" type="button" onClick={newPair}><RotateCcw size={15} /> НОВАЯ ПАРА</button>
        </div>
        <output className="race-digital" aria-live="off">{formatRaceTime(elapsed)}</output>
        {phase === 'finished' && <div className="race-result">
          <label htmlFor="race-clicks">Сколько ссылок вы нажали? <small>Начальную статью не считайте.</small></label>
          <input id="race-clicks" type="number" min="0" step="1" inputMode="numeric" value={clicks} onChange={event => setClicks(event.target.value)} placeholder="Число переходов" />
          {validClicks && <p className="race-comparison">Ваш результат: <strong>{countLabel(clickCount, 'клик', 'клика', 'кликов')}, {(elapsed / 1000).toFixed(1).replace('.', ',')} с.</strong><br />Кратчайший найденный путь: <strong>{shortestClicks === null ? 'пока не найден' : countLabel(shortestClicks, 'переход', 'перехода', 'переходов')}.</strong></p>}
        </div>}
      </div>
    </div>
  </div>;
}
