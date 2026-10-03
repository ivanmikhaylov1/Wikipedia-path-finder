import { describe, expect, it } from 'vitest';
import { curveLengths, knowledgeNodes, nearestEdges, pathPoints, phaseAt, sampleCurve, waveRadius } from '../src/lib/threadMotion';

describe('real progress to waves', () => {
  it('is monotonic in depth, visited and elapsed and bounded', () => {
    let previous = 0;
    for (let i = 0; i < 100; i++) { const radius = waveRadius(i, i * 1000, 2400); expect(radius).toBeGreaterThanOrEqual(previous); expect(radius).toBeLessThanOrEqual(.37); previous = radius; }
    expect(waveRadius(-2, -50, -1)).toBe(0);
    expect(waveRadius(6, 5000, 1200)).toBeLessThan(waveRadius(6, 5000, 2400));
    expect(waveRadius(0, 0, 2400, true)).toBe(.4);
  });
  it('honours minimum 2.4s and never meets without a real found event', () => {
    expect(phaseAt(2399, 10, false, false)).toBe('search');
    expect(phaseAt(2400, 10, false, false)).toBe('meet');
    expect(phaseAt(3100, 10, false, false)).toBe('draw');
    expect(phaseAt(4900, 10, false, false)).toBe('done');
    expect(phaseAt(100000, null, true, false)).toBe('search');
    expect(phaseAt(0, 0, false, true)).toBe('done');
    expect(phaseAt(12000, 12000, false, false)).toBe('meet');
    expect(phaseAt(100, null, false, false)).toBe('idle');
  });
});
describe('curve and layout', () => {
  it('passes through every node, samples finite coordinates and keeps endpoints', () => {
    const points = pathPoints(5), sampled = sampleCurve(points);
    expect(sampled).toHaveLength(161);
    points.forEach((p, i) => expect(sampled[i * 40]).toEqual(p));
    expect(sampled.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(sampleCurve([])).toEqual([]); expect(sampleCurve([points[0]])).toEqual([points[0]]);
  });
  it('uses monotonic arc lengths even for uneven segments', () => {
    const lengths = curveLengths(sampleCurve([{ x: 0, y: 0 }, { x: .1, y: .5 }, { x: 1, y: 0 }]), 1200, 460);
    expect(lengths[0]).toBe(0); expect(lengths.at(-1)).toBe(1);
    expect(lengths.every((n, i) => i === 0 || n >= lengths[i - 1])).toBe(true);
  });
  it('is deterministic and connects only the two nearest neighbours', () => {
    const nodes = knowledgeNodes(); expect(nodes).toEqual(knowledgeNodes()); expect(nodes).toHaveLength(150);
    const edges = nearestEdges([{x:0,y:0},{x:.1,y:0},{x:.2,y:0},{x:1,y:1}]);
    expect(edges).not.toContainEqual([0,3]); expect(edges).toContainEqual([0,1]);
  });
});
