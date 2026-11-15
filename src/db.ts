// IndexedDB persistence. The whole dataset is small, so it is loaded into memory at start
// and every change is written through record by record.
import type { DayMark, LogEntry, RoadmapItem, Settings, Sprint, Track, WeekReview } from './core/types.js';
import { DEFAULT_SETTINGS } from './core/types.js';
import { DB_VERSION, migrateData, storesToCreate } from './core/schema.js';

const DB_NAME = 'nhip';
export const STORES = ['tracks', 'sprints', 'roadmap', 'logs', 'marks', 'reviews'] as const;
export type StoreName = (typeof STORES)[number];

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    // Versioned upgrade: only the stores added after the old version are created; existing data is kept.
    req.onupgradeneeded = (e) => {
      const db = req.result;
      for (const s of storesToCreate(e.oldVersion)) {
        if (!db.objectStoreNames.contains(s.name)) db.createObjectStore(s.name, s.keyPath ? { keyPath: s.keyPath } : undefined);
      }
    };
    req.onsuccess = () => {
      // Let a newer version of the app in another tab upgrade the database instead of waiting on this tab.
      req.result.onversionchange = () => { req.result.close(); dbp = null; };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export interface Data {
  tracks: Track[];
  sprints: Sprint[];
  roadmap: RoadmapItem[];
  logs: LogEntry[];
  marks: DayMark[];
  reviews: WeekReview[];
  settings: Settings;
}

export async function loadAll(): Promise<Data> {
  const db = await open();
  const tx = db.transaction([...STORES, 'settings'], 'readonly');
  const [tracks, sprints, roadmap, logs, marks, reviews, settings] = await Promise.all([
    req(tx.objectStore('tracks').getAll()),
    req(tx.objectStore('sprints').getAll()),
    req(tx.objectStore('roadmap').getAll()),
    req(tx.objectStore('logs').getAll()),
    req(tx.objectStore('marks').getAll()),
    req(tx.objectStore('reviews').getAll()),
    req(tx.objectStore('settings').get('settings')),
  ]);
  const m = migrateData({ tracks, sprints, roadmap, logs, marks, reviews, settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) } });
  if (m.changedItems.length || m.changedSprints.length) {
    const wtx = db.transaction(['roadmap', 'sprints'], 'readwrite');
    for (const i of m.changedItems) wtx.objectStore('roadmap').put(i);
    for (const s of m.changedSprints) wtx.objectStore('sprints').put(s);
    await done(wtx);
  }
  return m.data;
}

export async function put(store: StoreName, value: unknown): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await done(tx);
}

export async function del(store: StoreName, key: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await done(tx);
}

export async function putSettings(s: Settings): Promise<void> {
  const db = await open();
  const tx = db.transaction('settings', 'readwrite');
  tx.objectStore('settings').put(s, 'settings');
  await done(tx);
}

/** Writes several records of several stores in one transaction. */
export async function putMany(writes: { store: StoreName; value: unknown }[], deletes: { store: StoreName; key: string }[] = []): Promise<void> {
  if (!writes.length && !deletes.length) return;
  const db = await open();
  const names = [...new Set([...writes.map((w) => w.store), ...deletes.map((d) => d.store)])];
  const tx = db.transaction(names, 'readwrite');
  for (const w of writes) tx.objectStore(w.store).put(w.value);
  for (const d of deletes) tx.objectStore(d.store).delete(d.key);
  await done(tx);
}

/** Replaces the whole dataset in one transaction. */
export async function replaceAll(data: Data): Promise<void> {
  const db = await open();
  const tx = db.transaction([...STORES, 'settings'], 'readwrite');
  for (const s of STORES) tx.objectStore(s).clear();
  for (const t of data.tracks) tx.objectStore('tracks').put(t);
  for (const s of data.sprints) tx.objectStore('sprints').put(s);
  for (const i of data.roadmap) tx.objectStore('roadmap').put(i);
  for (const l of data.logs) tx.objectStore('logs').put(l);
  for (const m of data.marks) tx.objectStore('marks').put(m);
  for (const r of data.reviews) tx.objectStore('reviews').put(r);
  tx.objectStore('settings').put(data.settings, 'settings');
  await done(tx);
}
