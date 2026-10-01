import { describe, expect, it } from 'vitest';
import { pathPoints, sampleCurve } from '../src/lib/threadMotion';
describe('relative stage layout', () => {
  it('keeps long and single-article paths inside the stage at every width', () => {
    for (const count of [1, 2, 5, 13, 31]) for (const width of [328, 716, 1200]) {
      const points = pathPoints(count), curve = sampleCurve(points);
      expect(points).toHaveLength(count);
      expect(curve.every(p => p.x * width > 0 && p.x * width < width && p.y * 300 > 0 && p.y * 300 < 300)).toBe(true);
    }
  });
});
