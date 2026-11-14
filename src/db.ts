// IndexedDB persistence. The whole dataset is small, so it is loaded into memory at start
// and every change is written through record by record.
import type { DayMark, LogEntry, Settings, Sprint, Track, WeekReview } from './core/types.js';
import { DEFAULT_SETTINGS } from './core/types.js';

const DB_NAME = 'nhip';
const VERSION = 1;
export const STORES = ['tracks', 'sprints', 'logs', 'marks', 'reviews'] as const;
export type StoreName = (typeof STORES)[number];

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('tracks', { keyPath: 'id' });
      db.createObjectStore('sprints', { keyPath: 'id' });
      db.createObjectStore('logs', { keyPath: 'id' });
      db.createObjectStore('marks', { keyPath: 'id' });
      db.createObjectStore('reviews', { keyPath: 'weekStart' });
      db.createObjectStore('settings');
    };
    req.onsuccess = () => resolve(req.result);
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
  logs: LogEntry[];
  marks: DayMark[];
  reviews: WeekReview[];
  settings: Settings;
}

export async function loadAll(): Promise<Data> {
  const db = await open();
  const tx = db.transaction([...STORES, 'settings'], 'readonly');
  const [tracks, sprints, logs, marks, reviews, settings] = await Promise.all([
    req(tx.objectStore('tracks').getAll()),
    req(tx.objectStore('sprints').getAll()),
    req(tx.objectStore('logs').getAll()),
    req(tx.objectStore('marks').getAll()),
    req(tx.objectStore('reviews').getAll()),
    req(tx.objectStore('settings').get('settings')),
  ]);
  return { tracks, sprints, logs, marks, reviews, settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) } };
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

/** Replaces the whole dataset in one transaction. */
export async function replaceAll(data: Data): Promise<void> {
  const db = await open();
  const tx = db.transaction([...STORES, 'settings'], 'readwrite');
  for (const s of STORES) tx.objectStore(s).clear();
  for (const t of data.tracks) tx.objectStore('tracks').put(t);
  for (const s of data.sprints) tx.objectStore('sprints').put(s);
  for (const l of data.logs) tx.objectStore('logs').put(l);
  for (const m of data.marks) tx.objectStore('marks').put(m);
  for (const r of data.reviews) tx.objectStore('reviews').put(r);
  tx.objectStore('settings').put(data.settings, 'settings');
  await done(tx);
}
