import { useEffect, useId, useState, type RefObject } from 'react';
import stringTexture from '../assets/images/red-string.png';

type Point = { x: number; y: number };
type Geometry = { width: number; height: number; paths: string[] };

/** A quadratic curve with slack below the chord, measured in the board's own coordinates. */
export function makeStringPath(start: Point, end: Point): string {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const sag = Math.min(105, Math.max(32, distance * 0.17));
  const middleX = (start.x + end.x) / 2;
  const controlY = Math.max(start.y, end.y) + sag;
  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${middleX.toFixed(1)} ${controlY.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

export function ConnectionString({ containerRef, cardRefs, count }: {
  containerRef: RefObject<HTMLDivElement | null>;
  cardRefs: RefObject<Array<HTMLAnchorElement | null>>;
  count: number;
}) {
  const [geometry, setGeometry] = useState<Geometry>({ width: 1, height: 1, paths: [] });
  const patternId = useId().replaceAll(':', '');

  useEffect(() => {
    const container = containerRef.current;
    if (!container || count < 2) return;
    const measure = () => {
      const board = container.getBoundingClientRect();
      const points = cardRefs.current.slice(0, count).map(card => {
        if (!card) return null;
        const rect = card.getBoundingClientRect();
        return { x: rect.left - board.left + rect.width / 2, y: rect.top - board.top + 3 };
      });
      const paths: string[] = [];
      for (let i = 1; i < points.length; i++) {
        const previous = points[i - 1];
        const current = points[i];
        if (previous && current) paths.push(makeStringPath(previous, current));
      }
      setGeometry(previous => previous.width === board.width && previous.height === board.height && previous.paths.join('|') === paths.join('|')
        ? previous : { width: board.width, height: board.height, paths });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const card of cardRefs.current.slice(0, count)) if (card) observer.observe(card);
    window.addEventListener('resize', measure);
    container.addEventListener('animationend', measure);
    document.fonts?.ready.then(measure).catch(() => {});
    measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); container.removeEventListener('animationend', measure); };
  }, [containerRef, cardRefs, count]);

  return <svg className="connection-string" viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none" aria-hidden="true">
    <defs><pattern id={patternId} patternUnits="userSpaceOnUse" width="44" height="7"><image href={stringTexture} width="44" height="7" preserveAspectRatio="none" /></pattern></defs>
    {geometry.paths.map((d, index) => <g key={index}>
      <path d={d} fill="none" stroke="#4d1c15" strokeOpacity=".6" strokeWidth="8" strokeLinecap="round" />
      <path d={d} fill="none" stroke={`url(#${patternId})`} strokeWidth="7" strokeLinecap="round" />
    </g>)}
  </svg>;
}
