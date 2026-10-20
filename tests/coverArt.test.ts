import { expect, it } from 'vitest';
import { SILHOUETTES, colophon, constructionSpec, engravingSpec, pairAngle } from '../src/lib/coverArt';

const octopus = { title: 'Осьминоги', lang: 'ru' }, jazz = { title: 'Jazz', lang: 'en' };
const titles = ['A', 'Bauhaus', 'Чёрная дыра', 'Квантовая механика', '1984', 'Москва', 'Юрий Гагарин', 'Philosophy', 'Design', 'Jazz', 'Наука', 'Λόγος'];

it('prints the same cover for the same pair', () => {
  const angle = pairAngle(octopus, jazz);
  expect(pairAngle(octopus, jazz)).toBe(angle);
  expect(engravingSpec(octopus, angle)).toEqual(engravingSpec(octopus, angle));
  expect(constructionSpec(jazz, angle)).toEqual(constructionSpec(jazz, angle));
});

it('gives different articles and sections different covers', () => {
  const angle = pairAngle(octopus, jazz);
  expect(engravingSpec(octopus, angle).outline).not.toBe(engravingSpec({ title: 'Москва', lang: 'ru' }, angle).outline);
  expect(constructionSpec(jazz, angle)).not.toEqual(constructionSpec({ title: 'Jazz', lang: 'de' }, angle));
  expect(pairAngle(octopus, jazz)).not.toBe(pairAngle(jazz, octopus));
});

it('keeps the pair angle away from flat and steep bars', () => {
  for (const title of titles) {
    const angle = Math.abs(pairAngle(octopus, { title, lang: 'ru' }));
    expect(angle).toBeGreaterThanOrEqual(8);
    expect(angle).toBeLessThanOrEqual(28);
  }
});

it('draws every silhouette from the vocabulary', () => {
  const seen = new Set<string>();
  for (let index = 0; index < 200 && seen.size < SILHOUETTES.length; index++) seen.add(engravingSpec({ title: `Статья ${index}`, lang: 'ru' }, 12).silhouette);
  expect([...seen].sort()).toEqual([...SILHOUETTES].sort());
});

it('sets the engraving from the title along its form lines, with a drop cap from the first letter', () => {
  for (const title of ['«Чёрная дыра»', ...titles]) {
    const spec = engravingSpec({ title, lang: 'ru' }, 12);
    expect(spec.lines.length).toBeGreaterThan(8);
    for (const line of spec.lines) {
      expect(line.d).toMatch(/^M[\d.-]+ [\d.-]+C/);
      expect(line.size).toBeGreaterThanOrEqual(4.5);
      expect(line.size).toBeLessThanOrEqual(24);
      expect(line.text.replaceAll(' · ', '').length).toBeGreaterThan(0);
    }
    expect(spec.lines.some(line => line.text.includes(title.trim().toLocaleUpperCase()))).toBe(true);
    expect(spec.initialY - spec.initialSize * .72).toBeGreaterThan(0);
    expect(spec.streaks.length).toBeGreaterThanOrEqual(6);
  }
  expect(engravingSpec({ title: '«Чёрная дыра»', lang: 'ru' }, 12).initial).toBe('Ч');
});

it('builds every construction from the grammar: four elements, one bar at the pair angle, a bleeding dominant', () => {
  for (const title of titles) {
    const spec = constructionSpec({ title, lang: 'en' }, -14);
    const kinds = spec.shapes.map(shape => shape.kind);
    expect(kinds.filter(kind => kind !== 'spear')).toHaveLength(4);
    expect(spec.shapes.filter(shape => shape.kind === 'bar')).toEqual([expect.objectContaining({ angle: 14 })]);
    expect(spec.shapes.filter(shape => shape.kind === 'spear')).toEqual([expect.objectContaining({ angle: 14 })]);
    expect(kinds.filter(kind => kind === 'disc')).toHaveLength(1);
    const letter = spec.shapes.find(shape => shape.kind === 'letter')!;
    const disc = spec.shapes.find(shape => shape.kind === 'disc')!;
    if (spec.layout === 'disc') {
      expect(disc).toEqual(expect.objectContaining({ accent: true }));
      if (disc.kind === 'disc') expect(disc.cx + disc.r).toBeGreaterThan(600);
    } else {
      expect(disc).toEqual(expect.objectContaining({ accent: false }));
      if (letter.kind === 'letter') expect(letter.size).toBeGreaterThanOrEqual(500);
    }
    if (letter.kind === 'letter') expect(letter.y).toBeGreaterThan(600);
    expect(Math.abs(spec.misregister[0])).toBeGreaterThanOrEqual(1.5);
  }
  expect(constructionSpec({ title: 'Design', lang: 'en' }, -14).shapes.find(shape => shape.kind === 'letter')).toEqual(expect.objectContaining({ char: 'D' }));
});

it('numbers each pair as one edition', () => {
  const mark = colophon(octopus, jazz, 2026);
  expect(mark).toMatch(/^Оттиск № [0-9A-F]{4} · RU → EN · 2026$/);
  expect(colophon(octopus, jazz, 2026)).toBe(mark);
  expect(colophon(jazz, octopus, 2026)).not.toBe(mark);
});
