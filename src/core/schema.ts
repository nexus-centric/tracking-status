// IndexedDB schema versions and the in-memory data migration that runs after every load.
import type { RoadmapItem, Sprint } from './types.js';

export const DB_VERSION = 2;

export interface StoreDef { name: string; keyPath?: string }

// v1: the original stores. v2: adds `roadmap` (one record per roadmap item, keyed by id).
const STEPS: Record<number, StoreDef[]> = {
  1: [
    { name: 'tracks', keyPath: 'id' },
    { name: 'sprints', keyPath: 'id' },
    { name: 'logs', keyPath: 'id' },
    { name: 'marks', keyPath: 'id' },
    { name: 'reviews', keyPath: 'weekStart' },
    { name: 'settings' },
  ],
  2: [{ name: 'roadmap', keyPath: 'id' }],
};

/** Stores to create when upgrading from `oldVersion` (0 for a new database) to DB_VERSION. */
export function storesToCreate(oldVersion: number, target = DB_VERSION): StoreDef[] {
  const out: StoreDef[] = [];
  for (let v = oldVersion + 1; v <= target; v++) out.push(...(STEPS[v] ?? []));
  return out;
}

export interface MigratableData { sprints: Sprint[]; roadmap?: RoadmapItem[] }

/**
 * Brings loaded data to the current shape without touching what the user wrote: a missing roadmap becomes [],
 * roadmap orders are renumbered 0..n-1 per track (stable), and milestone links to missing items are dropped.
 * Returns the records that changed so the caller can write only those back.
 */
export function migrateData<T extends MigratableData>(data: T): { data: T & { roadmap: RoadmapItem[] }; changedItems: RoadmapItem[]; changedSprints: Sprint[] } {
  const roadmap = [...(data.roadmap ?? [])];
  const byTrack = new Map<string, RoadmapItem[]>();
  for (const i of roadmap) (byTrack.get(i.trackId) ?? byTrack.set(i.trackId, []).get(i.trackId)!).push(i);
  const changedItems: RoadmapItem[] = [];
  const fixed = new Map<string, RoadmapItem>();
  for (const list of byTrack.values()) {
    list
      .map((x, k) => ({ x, k }))
      .sort((a, b) => a.x.order - b.x.order || a.k - b.k)
      .forEach(({ x }, n) => {
        if (x.order !== n) { const y = { ...x, order: n }; fixed.set(x.id, y); changedItems.push(y); }
      });
  }
  const items = roadmap.map((x) => fixed.get(x.id) ?? x);
  const ids = new Set(items.map((i) => i.id));
  const changedSprints: Sprint[] = [];
  const sprints = data.sprints.map((s) => {
    if (!s.milestones.some((m) => m.itemId && !ids.has(m.itemId))) return s;
    const ns = { ...s, milestones: s.milestones.map((m) => (m.itemId && !ids.has(m.itemId) ? { ...m, itemId: undefined } : m)) };
    changedSprints.push(ns);
    return ns;
  });
  return { data: { ...data, sprints, roadmap: items }, changedItems, changedSprints };
}
