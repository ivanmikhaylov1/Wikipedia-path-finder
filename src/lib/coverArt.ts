export interface CoverArticle { title: string; lang: string }

/** FNV-1a: small, stable and identical in every browser. */
export function hashString(value: string) {
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: a deterministic sequence, so one pair always prints one cover. */
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

type Point = [number, number];
const keyOf = (article: CoverArticle) => `${article.lang}:${article.title}`;
const round = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const fmt = ([x, y]: Point) => `${round(x)} ${round(y)}`;
const TAU = Math.PI * 2;

/** Shared angle of the pair: the engraving's hatching and the bar rhyme with it. */
export function pairAngle(from: CoverArticle, to: CoverArticle) {
  const random = seededRandom(hashString(`${keyOf(from)}→${keyOf(to)}`));
  const angle = 8 + random() * 20;
  return round(random() < .5 ? -angle : angle);
}

/** The printer's mark of a pair: a stable edition number and the sections it joins. */
export function colophon(from: CoverArticle, to: CoverArticle, year = new Date().getFullYear()) {
  const number = hashString(`${keyOf(from)}→${keyOf(to)}`).toString(16).toUpperCase().padStart(8, '0').slice(-4);
  return `Оттиск № ${number} · ${from.lang.toUpperCase()} → ${to.lang.toUpperCase()} · ${year}`;
}

function initialOf(title: string) {
  return Array.from(title.trim()).find(char => /[\p{L}\p{N}]/u.test(char))?.toLocaleUpperCase() ?? '§';
}

/** Catmull-Rom through the points, written as cubic Béziers. */
function smoothPath(points: Point[], closed: boolean) {
  const count = points.length;
  const at = (index: number) => closed ? points[(index + count) % count] : points[clamp(index, 0, count - 1)];
  let d = `M${fmt(at(0))}`;
  for (let index = 0; index < (closed ? count : count - 1); index++) {
    const [p0, p1, p2, p3] = [at(index - 1), at(index), at(index + 1), at(index + 2)];
    d += `C${fmt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${fmt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${fmt(p2)}`;
  }
  return closed ? `${d}Z` : d;
}

function polylineLength(points: Point[]) {
  let length = 0;
  for (let index = 1; index < points.length; index++) length += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
  return length;
}

function ellipsePoints(cx: number, cy: number, rx: number, ry: number, count: number, start = 0): Point[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = start + index / count * TAU;
    return [cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry];
  });
}

/** A closed loop with ink spread: low wobble plus fine grain along the edge. */
function roughLoop(points: Point[], random: () => number, amplitude: number, straight = false) {
  const count = points.length, phase = random() * TAU;
  const jittered = points.map((point, index): Point => {
    const previous = points[(index - 1 + count) % count], next = points[(index + 1) % count];
    const tx = next[0] - previous[0], ty = next[1] - previous[1], length = Math.hypot(tx, ty) || 1;
    const offset = amplitude * (.6 * Math.sin(index / count * TAU * 3 + phase) + (random() - .5) * 1.4);
    return [point[0] - ty / length * offset, point[1] + tx / length * offset];
  });
  return straight ? `M${jittered.map(fmt).join('L')}Z` : smoothPath(jittered, true);
}

/** Points along a polygon's edges, about every `step` units, so roughness spreads evenly. */
function subdivide(corners: Point[], step: number) {
  const points: Point[] = [];
  corners.forEach((corner, index) => {
    const next = corners[(index + 1) % corners.length];
    const parts = Math.max(1, Math.round(Math.hypot(next[0] - corner[0], next[1] - corner[1]) / step));
    for (let part = 0; part < parts; part++) points.push([corner[0] + (next[0] - corner[0]) * part / parts, corner[1] + (next[1] - corner[1]) * part / parts]);
  });
  return points;
}

/** Light falls from `light`; 0 is lit paper, 1 is the deepest shade. */
function darkness(point: Point, center: Point, radius: number, light: Point) {
  return clamp(.5 - .5 * ((point[0] - center[0]) * light[0] + (point[1] - center[1]) * light[1]) / radius, 0, 1);
}

/** Halftone dots on a 45° screen; dot size follows the shade, `from` hides the lit part. */
function halftone(cx: number, cy: number, r: number, light: Point, spacing: number, from = 0) {
  let d = '';
  const span = Math.ceil(r * 1.5 / spacing);
  for (let u = -span; u <= span; u++) for (let v = -span; v <= span; v++) {
    const x = cx + (u - v) * spacing * Math.SQRT1_2, y = cy + (u + v) * spacing * Math.SQRT1_2;
    const tone = clamp((darkness([x, y], [cx, cy], r, light) - from) / (1 - from), 0, 1);
    const dot = spacing * .56 * Math.pow(tone, .85);
    if (dot < .45 || Math.hypot(x - cx, y - cy) > r - dot) continue;
    d += `M${round(x - dot)} ${round(y)}a${round(dot)} ${round(dot)} 0 1 0 ${round(dot * 2)} 0a${round(dot)} ${round(dot)} 0 1 0 ${round(-dot * 2)} 0`;
  }
  return d;
}

export type Silhouette = 'medallion' | 'vessel' | 'shell' | 'hills' | 'leaf';
export const SILHOUETTES: Silhouette[] = ['medallion', 'vessel', 'shell', 'hills', 'leaf'];

/** One run of words set along a form line. */
export interface EngravingLine { d: string; size: number; text: string }

export interface EngravingSpec {
  /** viewBox 0 0 600 800 */
  silhouette: Silhouette; outline: string; details: string[]; lines: EngravingLine[];
  shade: string; shadeX: number; shadeY: number; hatchAngle: number; shadeAngle: number; hatchGap: number;
  /** Hatching that runs past the form towards the seam. */
  streaks: string[];
  initial: string; initialX: number; initialY: number; initialSize: number;
}

interface Form { outline: Point[]; details: Point[][]; lines: { points: Point[]; gap: number }[]; center: Point; radius: number }

/** Medallion: an oval portrait frame; words run in rings like the burin around a bust. */
function medallion(random: () => number): Form {
  const cx = 300 + (random() - .5) * 40, cy = 455 + (random() - .5) * 40;
  const rx = 215 + random() * 35, ry = Math.min(320, rx * (1.25 + random() * .1));
  const phase = random() * TAU, lines: Form['lines'] = [];
  for (let k = .96, index = 0; rx * k > 26; index++) {
    const gap = 13 + 10 * (.5 + .5 * Math.sin(index * .8 + phase));
    lines.push({ points: ellipsePoints(cx, cy, rx * k, ry * k, 72, random() * TAU), gap });
    k -= gap / ry;
  }
  return { outline: ellipsePoints(cx, cy, rx, ry, 72), details: [ellipsePoints(cx, cy, rx * 1.05, ry * 1.04, 72)], lines, center: [cx, cy], radius: ry };
}

/** Vessel: a turned profile; words follow its horizontal rings, bulging towards the viewer. */
function vessel(random: () => number): Form {
  const top = 170 + random() * 40, bottom = 770, height = bottom - top;
  const knots: Point[] = [[0, 70 + random() * 45], [.1 + random() * .05, 42 + random() * 30], [.36 + random() * .08, 170 + random() * 60],
    [.6 + random() * .08, 205 + random() * 55], [.88, 80 + random() * 40], [1, 105 + random() * 35]];
  const radiusAt = (t: number) => {
    let index = 0;
    while (index < knots.length - 2 && t > knots[index + 1][0]) index++;
    const [p0, p1, p2, p3] = [knots[Math.max(0, index - 1)], knots[index], knots[index + 1], knots[Math.min(knots.length - 1, index + 2)]];
    const u = clamp((t - p1[0]) / (p2[0] - p1[0]), 0, 1), u2 = u * u, u3 = u2 * u;
    return .5 * (2 * p1[1] + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3);
  };
  const axis = 300 + (random() - .5) * 30;
  const side = Array.from({ length: 48 }, (_, index) => index / 47);
  const outline: Point[] = [...side.map((t): Point => [axis + radiusAt(t), top + t * height]), ...[...side].reverse().map((t): Point => [axis - radiusAt(t), top + t * height])];
  const lines: Form['lines'] = [], phase = random() * TAU;
  for (let y = top + 10, index = 0; y < bottom - 8; index++) {
    const gap = 12 + 10 * (.5 + .5 * Math.sin(index * .55 + phase)), r = radiusAt((y - top) / height);
    lines.push({ gap, points: Array.from({ length: 25 }, (_, step): Point => {
      const u = step / 24 * 2 - 1;
      return [axis + u * r * 1.02, y + r * .11 * (1 - u * u)];
    }) });
    y += gap;
  }
  return { outline, details: [[[axis, top + 4], [axis, top + height * .08]]], lines, center: [axis, top + height * .55], radius: height / 2 };
}

/** Shell: a logarithmic spiral; words wind outwards and grow with the whorl. */
function shell(random: () => number): Form {
  const cx = 300 + (random() - .5) * 50, cy = 470 + (random() - .5) * 40;
  const start = .4, turns = 3.3 + random() * .7, end = turns * TAU, outer = 245 + random() * 30, inner = 7 + random() * 4;
  const growth = Math.log(outer / inner) / end, phase = random() * TAU, direction = random() < .5 ? 1 : -1;
  const at = (theta: number, scale = 1): Point => {
    const r = scale * inner * Math.exp(growth * theta), angle = phase + direction * theta;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r * 1.1];
  };
  const outline = Array.from({ length: 80 }, (_, index) => at(end - TAU + index / 79 * TAU));
  const arms = 7, ratio = Math.exp(growth * TAU), lines: Form['lines'] = [];
  for (let arm = 0; arm < arms; arm++) {
    const scale = Math.pow(ratio, -arm / arms), points: Point[] = [];
    for (let theta = start * TAU; theta <= end; theta += .1) points.push(at(theta, scale));
    // Band width between neighbouring arms at mid-radius bounds the type size along the arm.
    lines.push({ points, gap: inner * Math.exp(growth * end * .75) * scale * (1 - Math.pow(ratio, -1 / arms)) });
  }
  return { outline, details: [Array.from({ length: 60 }, (_, index) => at(end - TAU * 2 + index / 59 * TAU))], lines, center: [cx, cy], radius: outer };
}

/** Hills: an engraved vignette; words follow the ridge and flatten towards the foreground. */
function hills(random: () => number): Form {
  const a1 = 40 + random() * 35, a2 = 12 + random() * 20, l1 = 70 + random() * 50, l2 = 25 + random() * 20, p1 = random() * TAU, p2 = random() * TAU;
  const base = 250 + random() * 40, left = 40, right = 560;
  const ridge = (x: number) => base + a1 * Math.sin(x / l1 + p1) + a2 * Math.sin(x / l2 + p2);
  const top = Array.from({ length: 40 }, (_, index): Point => { const x = left + index / 39 * (right - left); return [x, ridge(x)]; });
  const depth = 770 - base, cx = (left + right) / 2;
  const bowl = Array.from({ length: 30 }, (_, index): Point => {
    const angle = index / 29 * Math.PI;
    return [cx + Math.cos(angle) * (right - left) / 2, base + Math.sin(angle) * depth];
  });
  const lines: Form['lines'] = [], phase = random() * TAU, count = 30;
  for (let index = 0, offset = 8; offset < depth; index++) {
    const gap = 11 + 10 * (.5 + .5 * Math.sin(index * .7 + phase)), flatten = Math.min(1, index / count);
    lines.push({ gap, points: Array.from({ length: 30 }, (_, step): Point => {
      const x = left - 20 + step / 29 * (right - left + 40);
      return [x, ridge(x) + offset - (ridge(x) - base) * flatten * .85];
    }) });
    offset += gap;
  }
  return { outline: [...top, ...bowl], details: [top], lines, center: [cx, base + depth * .45], radius: depth * .6 };
}

/** Leaf: a lens between base and tip; words run along the veins from stalk to point. */
function leaf(random: () => number): Form {
  const base: Point = [300 + (random() - .5) * 40, 775], tip: Point = [300 + (random() - .5) * 170, 140 + random() * 40];
  const width = 155 + random() * 55, skew = .85 + random() * .3;
  const dx = tip[0] - base[0], dy = tip[1] - base[1], length = Math.hypot(dx, dy), normal: Point = [-dy / length, dx / length];
  const vein = (f: number, steps = 30) => Array.from({ length: steps + 1 }, (_, step): Point => {
    const t = step / steps, swell = Math.pow(Math.sin(Math.PI * t), .85) * Math.pow(1 - t * .35, 1) * width * f * (f > 0 ? skew : 1 / skew);
    return [base[0] + dx * t + normal[0] * swell, base[1] + dy * t + normal[1] * swell];
  });
  const lines: Form['lines'] = [];
  const count = 15 + Math.floor(random() * 6);
  for (let index = 0; index < count; index++) {
    const f = -.97 + index / (count - 1) * 1.94;
    lines.push({ points: vein(f), gap: width * 1.94 / count * .9 });
  }
  return { outline: [...vein(1, 40), ...vein(-1, 40).reverse()], details: [vein(0)], lines, center: [base[0] + dx * .5, base[1] + dy * .5], radius: length / 2 };
}

const FORMS: Record<Silhouette, (random: () => number) => Form> = { medallion, vessel, shell, hills, leaf };

/** The start article becomes an engraving: its title, set along the lines of one form. */
export function engravingSpec(article: CoverArticle, angle: number): EngravingSpec {
  const random = seededRandom(hashString(`engraving:${keyOf(article)}`));
  const silhouette = SILHOUETTES[Math.floor(random() * SILHOUETTES.length)];
  const form = FORMS[silhouette](random);
  const lightAngle = -Math.PI * (.55 + random() * .4), light: Point = [Math.cos(lightAngle), Math.sin(lightAngle)];
  const unit = `${article.title.trim().toLocaleUpperCase()} · `, unitLength = Array.from(unit).length;
  const lines: EngravingLine[] = [];
  for (const { points, gap } of form.lines) {
    // Each line is set in a few runs, so type size can follow light and shade along it.
    const runs = Math.max(2, Math.round(polylineLength(points) / 140));
    for (let run = 0; run < runs; run++) {
      const from = Math.floor(run * (points.length - 1) / runs), to = Math.floor((run + 1) * (points.length - 1) / runs);
      const segment = points.slice(from, to + 1);
      if (segment.length < 2) continue;
      const middle = segment[Math.floor(segment.length / 2)];
      const size = round(Math.min(gap * .92, 6.5 + 15 * darkness(middle, form.center, form.radius, light) + random() * 2));
      if (size < 4.5) continue;
      const repeats = Math.ceil(polylineLength(segment) / (size * .58 * unitLength)) + 1, skip = Math.floor(random() * unitLength);
      lines.push({ d: smoothPath(segment, false), size, text: Array.from(unit.repeat(repeats + 1)).slice(skip, skip + repeats * unitLength).join('') });
    }
  }
  const radius = form.radius;
  const shadeX = round(form.center[0] - light[0] * radius * .35), shadeY = round(form.center[1] - light[1] * radius * .35);
  const shade = smoothPath(ellipsePoints(shadeX, shadeY, radius * .55, radius * .48, 9, random()).map(([x, y]): Point => [x + (random() - .5) * 40, y + (random() - .5) * 40]), true);
  // Burin strokes run past the right edge of the form towards the seam, at the pair's angle.
  const rightmost = form.outline.reduce((best, point) => point[0] > best[0] ? point : best, form.outline[0]);
  const direction: Point = [Math.cos(angle * Math.PI / 180), Math.sin(angle * Math.PI / 180)];
  const streaks = Array.from({ length: 6 + Math.floor(random() * 4) }, (_, index) => {
    const start: Point = [rightmost[0] - 40 - random() * 40, rightmost[1] + (index - 4) * (16 + random() * 10)];
    const length = 260 + random() * 300, half = .7 + random() * 1.1;
    const end: Point = [start[0] + direction[0] * length, start[1] + direction[1] * length];
    return `M${fmt([start[0] + direction[1] * half, start[1] - direction[0] * half])}L${fmt(end)}L${fmt([start[0] - direction[1] * half, start[1] + direction[0] * half])}Z`;
  });
  const initialSize = round(270 + random() * 70);
  return {
    silhouette, outline: smoothPath(form.outline, true),
    details: form.details.map(points => smoothPath(points, false)), lines, shade, shadeX, shadeY, streaks,
    hatchAngle: round(90 + angle), shadeAngle: round(90 + angle + 55 + random() * 25), hatchGap: round(4.2 + random() * 1.6),
    initial: initialOf(article.title), initialSize,
    // The drop cap overlaps the form's upper left and stays wholly inside the sheet.
    initialX: round(15 + random() * 70), initialY: round(initialSize * .72 + 30 + random() * 50),
  };
}

export type ConstructionShape =
  | { kind: 'disc'; cx: number; cy: number; r: number; d: string; accent: boolean; shading: string }
  | { kind: 'bar'; cx: number; cy: number; d: string; angle: number }
  /** The bar's continuation through the seam into the other half. */
  | { kind: 'spear'; cx: number; cy: number; d: string; angle: number }
  | { kind: 'ring'; cx: number; cy: number; r: number; width: number }
  | { kind: 'half'; cx: number; cy: number; d: string; angle: number }
  | { kind: 'square'; cx: number; cy: number; d: string; angle: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'letter'; x: number; y: number; size: number; char: string; angle: number };

export interface ConstructionSpec {
  /** viewBox 0 0 600 600; the right and bottom edges are the sheet's edges. */
  layout: 'disc' | 'letter'; shapes: ConstructionShape[];
  /** Offset of the blue plate: a slight misregistration, as in offset print. */
  misregister: Point;
}

/**
 * The target article becomes a constructivist print with a fixed grammar:
 * one dominant form that bleeds off the sheet, a black bar at the pair's angle,
 * one secondary form and one accent — never more than four elements.
 */
export function constructionSpec(article: CoverArticle, angle: number): ConstructionSpec {
  const random = seededRandom(hashString(`construction:${keyOf(article)}`));
  const between = (min: number, max: number) => round(min + random() * (max - min));
  const grid = (min: number, max: number) => Math.round(between(min, max) / 50) * 50;
  const lightAngle = -Math.PI * (.6 + random() * .3), light: Point = [Math.cos(lightAngle), Math.sin(lightAngle)];
  const char = initialOf(article.title), layout = random() < .5 ? 'disc' : 'letter';
  const shapes: ConstructionShape[] = [];
  const disc = (cx: number, cy: number, r: number, accent: boolean): ConstructionShape => ({
    kind: 'disc', cx, cy, r, accent, d: roughLoop(ellipsePoints(cx, cy, r, r, 72), random, 1.4),
    // A blue disc gets a halftone shadow; a black one is set entirely in halftone.
    shading: accent ? halftone(cx, cy, r, light, 11, .5) : halftone(cx, cy, r, light, 9.5),
  });
  if (layout === 'disc') {
    const r = between(185, 235);
    shapes.push(disc(round(600 - r * between(.3, .55)), grid(200, 300), r, true));
    shapes.push({ kind: 'letter', char, size: between(250, 330), x: between(10, 70), y: between(640, 690), angle: 0 });
  } else {
    shapes.push({ kind: 'letter', char, size: between(500, 620), x: grid(100, 200), y: between(650, 720), angle: random() < .2 ? -8 : 0 });
    shapes.push(disc(grid(100, 200), grid(100, 200), between(80, 120), false));
  }
  const height = layout === 'disc' ? between(70, 110) : between(42, 66), width = between(520, 600);
  const cx = grid(250, 350), cy = grid(350, 450), x = cx - width / 2, y = cy - height / 2;
  const step = random() < .5 ? between(.25, .4) * width : 0;
  const corners: Point[] = step ? [[x, y], [x + width - step, y], [x + width - step, y - height * .5], [x + width, y - height * .5], [x + width, y + height], [x, y + height]]
    : [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
  shapes.push({ kind: 'bar', cx, cy, angle: round(-angle), d: roughLoop(subdivide(corners, 22), random, 1.1, true) });
  shapes.push({ kind: 'spear', cx, cy, angle: round(-angle), d: roughLoop(subdivide([[x - 760, y + height * .3], [x + 2, y + height * .3], [x + 2, y + height * .7], [x - 760, y + height * .7]], 24), random, .8, true) });
  const accents = [
    () => ({ kind: 'line' as const, ...(() => { const at = grid(100, 500), lean = between(-80, 80); return { x1: at - lean, y1: -40, x2: at + lean, y2: 640 }; })() }),
    () => ({ kind: 'ring' as const, cx: grid(100, 250), cy: grid(100, 200), r: between(45, 80), width: between(3, 8) }),
    () => { const cx = grid(400, 500), cy = grid(500, 550), r = between(60, 100); return { kind: 'half' as const, cx, cy, angle: grid(-180, 180), d: roughLoop([...ellipsePoints(cx, cy, r, r, 36).slice(18), [cx + r, cy], [cx - r, cy]], random, 1) }; },
    () => { const cx = grid(100, 250), cy = grid(100, 200), size = between(70, 120); return { kind: 'square' as const, cx, cy, angle: between(-18, 18), d: roughLoop(subdivide([[cx - size / 2, cy - size / 2], [cx + size / 2, cy - size / 2], [cx + size / 2, cy + size / 2], [cx - size / 2, cy + size / 2]], 20), random, .9, true) }; },
  ];
  // The letter layout keeps its top left for the black disc, so its accent is always a rule.
  shapes.push(layout === 'letter' ? accents[0]() : accents[Math.floor(random() * accents.length)]());
  const misregister: Point = [round((random() < .5 ? -1 : 1) * between(1.5, 3)), round((random() < .5 ? -1 : 1) * between(1, 2.5))];
  return { layout, shapes, misregister };
}
