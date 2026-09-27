import { describe, expect, it } from 'vitest';
import { makeStringPath } from '../src/components/ConnectionString';
import { countLabel, formatRaceTime } from '../src/components/RaceMode';

describe('доска и гонка', () => {
  it('строит кривую между точными координатами соседних булавок', () => {
    const points = [
      { x: 10, y: 20 }, { x: 110, y: 35 }, { x: 210, y: 25 },
      { x: 10, y: 230 }, { x: 110, y: 245 }, { x: 210, y: 235 },
    ];
    const paths = points.slice(1).map((point, index) => makeStringPath(points[index], point));
    expect(paths).toHaveLength(5);
    expect(paths[0]).toMatch(/^M 10\.0 20\.0 Q .* 110\.0 35\.0$/);
    expect(paths[2]).toMatch(/^M 210\.0 25\.0 Q .* 10\.0 230\.0$/);
    expect(paths[4]).toMatch(/^M 110\.0 245\.0 Q .* 210\.0 235\.0$/);
  });

  it('форматирует секундомер и число переходов', () => {
    expect(formatRaceTime(65_430)).toBe('01:05.43');
    expect(countLabel(1, 'переход', 'перехода', 'переходов')).toBe('1 переход');
    expect(countLabel(2, 'клик', 'клика', 'кликов')).toBe('2 клика');
    expect(countLabel(11, 'клик', 'клика', 'кликов')).toBe('11 кликов');
  });
});
