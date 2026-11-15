// In-memory state with write-through persistence.
import { canUseBusy, makeCtx, type Ctx } from './core/rhythm.js';
import { today } from './core/dates.js';
import { demoBundle } from './core/demo.js';
import { countBundle, makeBundle, mergeData, parseBundle } from './core/bundle.js';
import type { Bundle, Day, DayMark, LogEntry, Settings, Sprint, Track, WeekReview } from './core/types.js';
import { DEFAULT_SETTINGS } from './core/types.js';
import * as db from './db.js';
import { uid } from './core/id.js';

export const state: db.Data = { tracks: [], sprints: [], logs: [], marks: [], reviews: [], settings: { ...DEFAULT_SETTINGS } };

type Listener = () => void;
const listeners: Listener[] = [];
export function onChange(fn: Listener): void { listeners.push(fn); }
function emit(): void { listeners.forEach((f) => f()); }

export async function init(): Promise<void> {
  Object.assign(state, await db.loadAll());
}

export const getTrack = (id: string) => state.tracks.find((t) => t.id === id);
export const ctxFor = (t: Track, day: Day = today()): Ctx => makeCtx({ track: t, logs: state.logs, marks: state.marks }, day);
export const hasDemo = () => state.tracks.some((t) => t.demo);

function upsert<T extends { id: string }>(list: T[], v: T): void {
  const i = list.findIndex((x) => x.id === v.id);
  if (i >= 0) list[i] = v; else list.push(v);
}

export async function saveTrack(t: Track): Promise<void> { upsert(state.tracks, t); await db.put('tracks', t); emit(); }
export async function saveSprint(s: Sprint): Promise<void> { upsert(state.sprints, s); await db.put('sprints', s); emit(); }
export async function saveLog(l: LogEntry): Promise<void> { upsert(state.logs, l); await db.put('logs', l); emit(); }

export async function deleteLog(id: string): Promise<LogEntry | undefined> {
  const l = state.logs.find((x) => x.id === id);
  state.logs = state.logs.filter((x) => x.id !== id);
  await db.del('logs', id);
  emit();
  return l;
}

export async function deleteSprint(id: string): Promise<void> {
  state.sprints = state.sprints.filter((x) => x.id !== id);
  await db.del('sprints', id);
  emit();
}

export async function deleteTrack(id: string): Promise<void> {
  const rm = async <K extends 'sprints' | 'logs' | 'marks'>(store: K) => {
    const list = state[store] as { id: string; trackId: string }[];
    for (const x of list.filter((x) => x.trackId === id)) await db.del(store, x.id);
    (state[store] as { id: string; trackId: string }[]) = list.filter((x) => x.trackId !== id);
  };
  await rm('sprints');
  await rm('logs');
  await rm('marks');
  state.tracks = state.tracks.filter((t) => t.id !== id);
  await db.del('tracks', id);
  emit();
}

export function markOn(trackId: string, day: Day): DayMark | undefined {
  return state.marks.find((m) => m.trackId === trackId && m.day === day);
}

/** Sets or clears a rest/busy mark. Returns false when the monthly busy allowance is used up. */
export async function setMark(trackId: string, day: Day, kind: DayMark['kind'] | null, note = ''): Promise<boolean> {
  const existing = markOn(trackId, day);
  if (existing) {
    state.marks = state.marks.filter((m) => m.id !== existing.id);
    await db.del('marks', existing.id);
  }
  if (kind === 'busy' && !canUseBusy(state.marks, trackId, day, state.settings)) { emit(); return false; }
  if (kind) {
    const m: DayMark = { id: uid(), trackId, day, kind, note: note || undefined };
    state.marks.push(m);
    await db.put('marks', m);
  }
  emit();
  return true;
}

export async function saveReview(r: WeekReview, silent = false): Promise<void> {
  const i = state.reviews.findIndex((x) => x.weekStart === r.weekStart);
  if (i >= 0) state.reviews[i] = r; else state.reviews.push(r);
  await db.put('reviews', r);
  if (!silent) emit();
}

export async function saveSettings(s: Settings): Promise<void> { state.settings = s; await db.putSettings(s); emit(); }

export function exportBundle(): Bundle {
  return makeBundle({ tracks: state.tracks, sprints: state.sprints, logs: state.logs, marks: state.marks, reviews: state.reviews, settings: state.settings });
}

/** Replaces or merges the current data with a parsed backup. */
export async function applyImport(bundle: Bundle, mode: 'merge' | 'replace'): Promise<{ tracks: number; logs: number; addedLogs: number }> {
  const incoming: db.Data = { tracks: bundle.tracks, sprints: bundle.sprints, logs: bundle.logs, marks: bundle.marks, reviews: bundle.reviews, settings: bundle.settings };
  const current: db.Data = { tracks: state.tracks, sprints: state.sprints, logs: state.logs, marks: state.marks, reviews: state.reviews, settings: state.settings };
  const data = mode === 'replace' ? incoming : mergeData(current, incoming).data;
  const addedLogs = mode === 'replace' ? data.logs.length : data.logs.length - current.logs.length;
  await db.replaceAll(data);
  Object.assign(state, data);
  emit();
  return { tracks: data.tracks.length, logs: data.logs.length, addedLogs };
}

export function previewImport(text: string) {
  const { bundle, dropped } = parseBundle(text);
  const current: db.Data = { tracks: state.tracks, sprints: state.sprints, logs: state.logs, marks: state.marks, reviews: state.reviews, settings: state.settings };
  return { bundle, dropped, file: countBundle(bundle), current: countBundle(current), merge: mergeData(current, bundle).added };
}

export async function loadDemo(): Promise<void> {
  const demo = demoBundle(today());
  const ids = new Set(demo.tracks.map((t) => t.id));
  const keep = <T extends { demo?: boolean }>(l: T[]) => l.filter((x) => !x.demo);
  const data: db.Data = {
    tracks: [...keep(state.tracks).filter((t) => !ids.has(t.id)), ...demo.tracks],
    sprints: [...keep(state.sprints), ...demo.sprints],
    logs: [...keep(state.logs), ...demo.logs],
    marks: [...keep(state.marks), ...demo.marks],
    reviews: state.reviews,
    settings: state.settings,
  };
  await db.replaceAll(data);
  Object.assign(state, data);
  emit();
}

export async function removeDemo(): Promise<void> {
  const keep = <T extends { demo?: boolean }>(l: T[]) => l.filter((x) => !x.demo);
  const data: db.Data = { tracks: keep(state.tracks), sprints: keep(state.sprints), logs: keep(state.logs), marks: keep(state.marks), reviews: state.reviews, settings: state.settings };
  await db.replaceAll(data);
  Object.assign(state, data);
  emit();
}

export async function wipe(): Promise<void> {
  const data: db.Data = { tracks: [], sprints: [], logs: [], marks: [], reviews: [], settings: { ...DEFAULT_SETTINGS } };
  await db.replaceAll(data);
  Object.assign(state, data);
  emit();
}

export function newId(): string { return uid(); }
