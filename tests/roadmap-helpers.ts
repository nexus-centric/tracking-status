import type { RoadmapItem } from '../src/core/types.js';

export function items(n: number, over: (i: number) => Partial<RoadmapItem> = () => ({})): RoadmapItem[] {
  return Array.from({ length: n }, (_, i) => ({ id: `i${i + 1}`, trackId: 't1', order: i, title: `Bài ${i + 1}`, done: false, ...over(i) }));
}
