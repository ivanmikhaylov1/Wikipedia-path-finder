import { memo, useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { constructionSpec, engravingSpec, type ConstructionShape, type CoverArticle } from '../lib/coverArt';

// SVG presentation attributes do not resolve CSS variables; these mirror :root.
const INK = '#11110f', PAPER = '#f4f1e8', ACCENT = '#123bff';

/** Typing should not reprint the cover on every keystroke; a started search settles it at once. */
export function useSettledKey(key: string, now = false, delay = 400) {
  const [settled, setSettled] = useState(key);
  useEffect(() => {
    if (settled === key) return;
    if (now) { setSettled(key); return; }
    const timer = window.setTimeout(() => setSettled(key), delay);
    return () => window.clearTimeout(timer);
  }, [key, now, delay, settled]);
  return settled;
}

/**
 * Cover layers drift with a fine pointer at different depths. Frames run only
 * while the pointer moves, so a still page stays still.
 */
export function usePointerDepth(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    const media = (query: string) => window.matchMedia?.(query)?.matches ?? false;
    if (!element || !media('(pointer: fine)') || media('(prefers-reduced-motion: reduce)')) return;
    let frame = 0, x = 0, y = 0;
    // Each depth is its own composited SVG layer: moving it needs no repaint and no restyle of the art.
    const apply = () => {
      frame = 0;
      element.querySelectorAll<SVGSVGElement>('.cover-layer[data-depth]').forEach(layer => {
        const depth = Number(layer.dataset.depth);
        layer.style.translate = `${(x * depth * 16).toFixed(1)}px ${(y * depth * 11).toFixed(1)}px`;
      });
    };
    const move = (event: PointerEvent) => {
      x = event.clientX / window.innerWidth * 2 - 1; y = event.clientY / window.innerHeight * 2 - 1;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(frame); };
  }, [ref]);
}

/**
 * Worker progress as 0…1 on a log scale: the first hundreds of articles matter most visually.
 * Coarse steps keep restyling of the art rare while the worker reports often.
 */
export function searchIntensity(visited: number | undefined) {
  return visited ? Math.round(Math.min(1, Math.log10(visited + 1) / 4) * 20) / 20 : 0;
}

export function articleKey(article: CoverArticle | null) {
  return article && article.title.trim() ? JSON.stringify([article.lang, article.title]) : '';
}
export function articleFromCoverKey(key: string): CoverArticle | null {
  if (!key) return null;
  const [lang, title] = JSON.parse(key) as [string, string];
  return { lang, title };
}

interface CoverProps {
  article: CoverArticle; angle: number; className: string;
  /** After a found route the halves trade inks: the engraving turns blue, the construction is hatched. */
  exchanged?: boolean;
  /** Search progress, 0…1. It is set only on the few elements it moves, never inherited through the art. */
  intensity?: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Decorative only: derived from the title, never presented as an image of the article. */
export const EngravingCover = memo(function EngravingCover({ article, angle, className, exchanged = false, intensity = 0 }: CoverProps) {
  const id = useId();
  const spec = useMemo(() => engravingSpec(article, angle), [article, angle]);
  const ink = exchanged ? ACCENT : INK;
  const layer = (name: string, depth: number, children: ReactNode) =>
    <svg className={`cover-layer layer-${name}`} data-depth={depth} viewBox="0 0 600 800" focusable="false">{children}</svg>;
  return <div className={`generative-cover engraving-cover ${className}`} aria-hidden="true"
    data-cover={articleKey(article)} data-silhouette={spec.silhouette} data-exchanged={exchanged || undefined}>
    {layer('streaks', -.3, <g className="engraving-streaks">{spec.streaks.map((d, index) => <path key={index} d={d} fill={ink} />)}</g>)}
    {layer('body', -.6, <>
      <defs>
        <clipPath id={`${id}body`}><path d={spec.outline} /></clipPath>
        <clipPath id={`${id}shade`}><path d={spec.shade} /></clipPath>
        {spec.lines.map((line, index) => <path key={index} id={`${id}line${index}`} d={line.d} />)}
        <pattern id={`${id}cross`} width={spec.hatchGap * .8} height={spec.hatchGap * .8} patternUnits="userSpaceOnUse" patternTransform={`rotate(${spec.shadeAngle})`}>
          <line x1={spec.hatchGap * .4} y1="0" x2={spec.hatchGap * .4} y2={spec.hatchGap * .8} stroke={ink} strokeWidth={spec.hatchGap * .3} />
        </pattern>
        <pattern id={`${id}deep`} width={spec.hatchGap * 1.1} height={spec.hatchGap * 1.1} patternUnits="userSpaceOnUse" patternTransform={`rotate(${spec.hatchAngle - 40})`}>
          <line x1={spec.hatchGap * .55} y1="0" x2={spec.hatchGap * .55} y2={spec.hatchGap * 1.1} stroke={ink} strokeWidth={round(.5 + intensity * 1.8)} />
        </pattern>
      </defs>
      <g clipPath={`url(#${id}body)`}>
        {spec.lines.map((line, index) => <text key={index} fontSize={line.size} className="engraving-words" fill={ink} style={{ '--line': index } as CSSProperties}>
          <textPath href={`#${id}line${index}`}>{line.text}</textPath>
        </text>)}
      </g>
      <path className="engraving-contour" d={spec.outline} pathLength={1} fill="none" stroke={ink} strokeWidth="2.5" />
      {spec.details.map((d, index) => <path key={index} className="engraving-contour" d={d} pathLength={1} fill="none" stroke={ink} strokeWidth="1.4" />)}
    </>)}
    {/* Search progress spreads the shade and engraves a denser hatching; the trace stays after the search.
        It is a layer of its own, so progress never re-rasterises the set words. */}
    {layer('shade', -.6, <g clipPath={`url(#${id}body)`}>
      <g className="engraving-shade" style={{ transformOrigin: `${spec.shadeX}px ${spec.shadeY}px`, scale: `${1 + intensity * .7}` }}>
        <rect width="600" height="800" fill={`url(#${id}cross)`} clipPath={`url(#${id}shade)`} />
      </g>
      <rect className="engraving-progress" width="600" height="800" fill={`url(#${id}deep)`} style={{ opacity: intensity }} />
    </g>)}
    {layer('cap', 1, <>
      <defs>
        <pattern id={`${id}hatch`} width={spec.hatchGap} height={spec.hatchGap} patternUnits="userSpaceOnUse" patternTransform={`rotate(${spec.hatchAngle})`}>
          <line x1={spec.hatchGap / 2} y1="0" x2={spec.hatchGap / 2} y2={spec.hatchGap} stroke={ink} strokeWidth={spec.hatchGap * .42} />
        </pattern>
      </defs>
      <g className="engraving-cap">
        <text x={spec.initialX} y={spec.initialY} fontSize={spec.initialSize} className="engraving-initial" fill={PAPER}>{spec.initial}</text>
        <text x={spec.initialX} y={spec.initialY} fontSize={spec.initialSize} className="engraving-initial" fill={`url(#${id}hatch)`} stroke={ink} strokeWidth="3">{spec.initial}</text>
      </g>
    </>)}
  </div>;
});

const depthOf: Record<ConstructionShape['kind'], number> = { letter: .4, disc: 1.1, ring: .7, half: .9, square: .6, bar: -.8, spear: -.8, line: .2 };
function originOf(shape: ConstructionShape) {
  return shape.kind === 'letter' ? `${shape.x}px ${shape.y}px`
    : shape.kind === 'line' ? `${(shape.x1 + shape.x2) / 2}px 300px` : `${shape.cx}px ${shape.cy}px`;
}

export const ConstructionCover = memo(function ConstructionCover({ article, angle, className, exchanged = false, intensity = 0 }: CoverProps) {
  const id = useId();
  const spec = useMemo(() => constructionSpec(article, angle), [article, angle]);
  const blue = exchanged ? `url(#${id}hatch)` : ACCENT;
  // The blue plate prints slightly off register; after the exchange there is no blue plate here.
  const plate = (children: ReactNode) => exchanged ? children : <g transform={`translate(${spec.misregister[0]} ${spec.misregister[1]})`}>{children}</g>;
  const shape = (item: ConstructionShape) => {
    switch (item.kind) {
      case 'letter': return plate(<text x={item.x} y={item.y} fontSize={item.size} className="construction-letter" fill={blue} stroke={exchanged ? INK : 'none'} strokeWidth="2.5" filter={`url(#${id}ink)`} transform={`rotate(${item.angle} ${item.x} ${item.y})`}>{item.char}</text>);
      case 'disc': return item.accent ? <>
        {plate(<path d={item.d} fill={blue} stroke={exchanged ? INK : 'none'} strokeWidth="2.5" />)}
        <path className="halftone" d={item.shading} fill={INK} />
      </> : <path className="halftone" d={item.shading} fill={INK} />;
      case 'ring': return <circle cx={item.cx} cy={item.cy} r={item.r} fill="none" stroke={INK} strokeWidth={item.width} />;
      case 'half': return <path d={item.d} fill={INK} transform={`rotate(${item.angle} ${item.cx} ${item.cy})`} />;
      case 'square': return <path d={item.d} fill="none" stroke={INK} strokeWidth="3" transform={`rotate(${item.angle} ${item.cx} ${item.cy})`} />;
      case 'bar': case 'spear': return <path className={`construction-${item.kind}`} d={item.d} fill={INK} transform={`rotate(${item.angle} ${item.cx} ${item.cy})`} />;
      case 'line': return <line className="construction-rule" pathLength={1} x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke={INK} strokeWidth="1.5" />;
    }
  };
  const progress = (item: ConstructionShape): CSSProperties =>
    item.kind === 'disc' ? { scale: `${1 + intensity * .18}` } : item.kind === 'bar' || item.kind === 'spear' ? { rotate: `${round(intensity * -9)}deg` } : {};
  // The spear sits under everything, as if the bar were pushed through the paper.
  const ordered = [...spec.shapes.filter(item => item.kind === 'spear'), ...spec.shapes.filter(item => item.kind !== 'spear')];
  return <div className={`generative-cover construction-cover ${className}`} aria-hidden="true"
    data-cover={articleKey(article)} data-layout={spec.layout} data-exchanged={exchanged || undefined}>
    <svg className="cover-defs" width="0" height="0" focusable="false">
      <defs>
        <pattern id={`${id}hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform={`rotate(${45 - angle})`}>
          <line x1="3" y1="0" x2="3" y2="6" stroke={INK} strokeWidth="2.2" />
        </pattern>
        <filter id={`${id}ink`} x="-4%" y="-4%" width="108%" height="108%">
          <feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves={2} seed={Math.round(Math.abs(angle) * 10)} />
          <feDisplacementMap in="SourceGraphic" scale="4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
    {ordered.map((item, index) => <svg key={index} className={`cover-layer layer-${item.kind}`} data-depth={depthOf[item.kind]} viewBox="0 0 600 600" preserveAspectRatio="xMaxYMax meet" focusable="false">
      <g className={`construction-part part-${item.kind}`} style={{ '--shape': index, transformOrigin: originOf(item), ...progress(item) } as CSSProperties}>{shape(item)}</g>
    </svg>)}
  </div>;
});
