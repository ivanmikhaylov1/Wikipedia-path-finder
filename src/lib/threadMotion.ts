export interface Point { x: number; y: number }
export type Phase = 'idle' | 'search' | 'meet' | 'draw' | 'done';
export const SEARCH_MIN_MS = 2400;
export const MEET_MS = 700;
export const DRAW_MS = 1800;
export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export const easeInOut = (n: number) => n < .5 ? 2 * n * n : 1 - (-2 * n + 2) ** 2 / 2;

/** Progress determines the target, elapsed time only smooths a received result. */
export function waveRadius(depth: number, visited: number, elapsed: number, found = false): number {
  const observed = clamp01((Math.max(0, depth) * .1 + Math.log1p(Math.max(0, visited)) / 18));
  const target = found ? .4 : Math.min(.37, .04 + observed * .33);
  return target * easeInOut(clamp01(elapsed / SEARCH_MIN_MS));
}

export function phaseAt(elapsed: number, foundAt: number | null, searching: boolean, reducedMotion: boolean): Phase {
  if (foundAt === null) return searching ? 'search' : 'idle';
  if (reducedMotion) return 'done';
  const meetAt = Math.max(SEARCH_MIN_MS, foundAt);
  if (elapsed < meetAt) return 'search';
  if (elapsed < meetAt + MEET_MS) return 'meet';
  if (elapsed < meetAt + MEET_MS + DRAW_MS) return 'draw';
  return 'done';
}

/** Stable normalized layout independent of stage size. */
export function knowledgeNodes(count = 150): Point[] {
  let seed = 1973;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  return Array.from({ length: count }, () => ({ x: .025 + random() * .95, y: .09 + random() * .71 }));
}
export function nearestEdges(nodes: Point[]): Array<[number, number]> {
  const edges = new Set<string>();
  nodes.forEach((p, i) => nodes.map((q, j) => ({ j, distance: Math.hypot(q.x - p.x, q.y - p.y) }))
    .filter(q => q.j !== i).sort((a, b) => a.distance - b.distance).slice(0, 2)
    .forEach(({ j }) => edges.add(`${Math.min(i, j)}:${Math.max(i, j)}`)));
  return [...edges].map(edge => edge.split(':').map(Number) as [number, number]);
}

export function pathPoints(count: number): Point[] {
  if (count === 1) return [{ x: .5, y: .43 }];
  return Array.from({ length: count }, (_, i) => ({ x: .11 + .78 * i / Math.max(1, count - 1), y: .43 + (i === 0 || i === count - 1 ? 0 : Math.sin(i * 2.2) * .17) }));
}

/** Catmull-Rom, including both endpoints exactly, with per-node sample indexes. */
export function sampleCurve(points: Point[], perSegment = 40): Point[] {
  if (points.length < 2) return points.map(point => ({ ...point }));
  const steps = Math.max(1, Math.floor(perSegment));
  const output: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      const coord = (key: keyof Point) => .5 * (2 * p1[key] + (-p0[key] + p2[key]) * t + (2 * p0[key] - 5 * p1[key] + 4 * p2[key] - p3[key]) * t * t + (-p0[key] + 3 * p1[key] - 3 * p2[key] + p3[key]) * t * t * t);
      output.push({ x: coord('x'), y: coord('y') });
    }
  }
  output.push({ ...points[points.length - 1] });
  return output;
}

/** Arc lengths keep the travelling tip moving smoothly and light cards at nodes. */
export function curveLengths(points: Point[], width = 1, height = 1): number[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot((points[i].x - points[i - 1].x) * width, (points[i].y - points[i - 1].y) * height));
  const total = lengths[lengths.length - 1];
  return lengths.map(n => total > 0 ? n / total : 0);
}
