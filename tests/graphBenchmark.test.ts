import { expect, it } from 'vitest';
import { runGraphBenchmark } from '../scripts/benchmark-graph';
it('compares incremental indexes and exhaustive traversals on the same changing directed graph', () => {
 const [row]=runGraphBenchmark([{nodes:32,edges:128}],3);
 expect(row.initialEdges).toBe(128);expect(row.addedEdges).toBeGreaterThan(0);
 expect(row.reference.routeLengths).toEqual(row.incremental.routeLengths);
 expect(row.reference.reachableCounts).toEqual(row.incremental.reachableCounts);
 expect(row.reference.stepMs).toHaveLength(3);expect(row.incremental.stepMs.every(ms=>ms>=0)).toBe(true);
});
