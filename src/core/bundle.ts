// Export/import format. Import validates and normalizes every record so a hand-edited or
// older file cannot put the app into a broken state.
import { isDay } from './dates.js';
import { APP_NAME } from './brand.js';
import type { Bundle, DayMark, Estimate, Evidence, LogEntry, Milestone, Pause, RoadmapItem, Settings, Sprint, Track, WeekReview } from './types.js';
import { DEFAULT_SETTINGS } from './types.js';

const str = (v: unknown, max = 4000): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : dflt;
  return Math.max(lo, Math.min(hi, n));
};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

function pause(v: unknown): Pause | null {
  const o = obj(v);
  if (!isDay(o.from)) return null;
  return { from: o.from, to: isDay(o.to) ? o.to : undefined, note: str(o.note, 500) || undefined };
}

export function normTrack(v: unknown): Track | null {
  const o = obj(v);
  const id = str(o.id, 100);
  const name = str(o.name, 120).trim();
  if (!id || !name || !isDay(o.createdAt)) return null;
  return {
    id,
    name,
    color: /^#[0-9a-fA-F]{6}$/.test(str(o.color)) ? str(o.color) : '#2f6f62',
    why: str(o.why, 1000),
    tinyAction: str(o.tinyAction, 300),
    plan: str(o.plan, 300),
    weeklyTarget: num(o.weeklyTarget, 1, 7, 4),
    restDays: [...new Set(arr(o.restDays).filter((d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6))],
    nextStep: str(o.nextStep, 300),
    pauses: arr(o.pauses).map(pause).filter((p): p is Pause => !!p),
    archived: o.archived === true,
    createdAt: o.createdAt,
    sessionMinutes: typeof o.sessionMinutes === 'number' ? num(o.sessionMinutes, 5, 480, 45) : undefined,
    itemsPerSession: typeof o.itemsPerSession === 'number' && Number.isFinite(o.itemsPerSession) ? Math.max(0.1, Math.min(20, Math.round(o.itemsPerSession * 10) / 10)) : undefined,
    demo: o.demo === true || undefined,
  };
}

function milestone(v: unknown): Milestone | null {
  const o = obj(v);
  const id = str(o.id, 100);
  const text = str(o.text, 300).trim();
  if (!id || !text) return null;
  const done = o.done === true;
  return { id, text, done, doneOn: done && isDay(o.doneOn) ? o.doneOn : undefined, itemId: str(o.itemId, 100) || undefined };
}

export function normSprint(v: unknown): Sprint | null {
  const o = obj(v);
  const id = str(o.id, 100);
  const trackId = str(o.trackId, 100);
  if (!id || !trackId || !isDay(o.start) || !isDay(o.end) || o.end < o.start) return null;
  const status = o.status === 'done' || o.status === 'dropped' || o.status === 'planned' ? o.status : 'active';
  return {
    id,
    trackId,
    title: str(o.title, 200).trim() || 'Đợt học',
    deliverable: str(o.deliverable, 500),
    start: o.start,
    end: o.end,
    milestones: arr(o.milestones).map(milestone).filter((m): m is Milestone => !!m),
    status,
    closedOn: isDay(o.closedOn) ? o.closedOn : undefined,
    reflection: str(o.reflection, 2000) || undefined,
    demo: o.demo === true || undefined,
  };
}

function evidence(v: unknown): Evidence | null {
  const o = obj(v);
  const kind = o.kind === 'link' || o.kind === 'note' || o.kind === 'image' ? o.kind : null;
  if (!kind) return null;
  const value = str(o.value, kind === 'image' ? 3_000_000 : 2000).trim();
  if (!value) return null;
  if (kind === 'image' && !/^data:image\/(png|jpeg|webp|gif);base64,/.test(value)) return null;
  if (kind === 'link' && !/^https?:\/\//i.test(value)) return null;
  return { kind, value, label: str(o.label, 200) || undefined };
}

export function normLog(v: unknown): LogEntry | null {
  const o = obj(v);
  const id = str(o.id, 100);
  const trackId = str(o.trackId, 100);
  if (!id || !trackId || !isDay(o.day)) return null;
  return {
    id,
    trackId,
    day: o.day,
    kind: o.kind === 'full' ? 'full' : 'tiny',
    minutes: num(o.minutes, 0, 24 * 60, 0),
    note: str(o.note, 2000),
    blocker: str(o.blocker, 1000),
    milestoneId: str(o.milestoneId, 100) || undefined,
    evidence: arr(o.evidence).map(evidence).filter((e): e is Evidence => !!e),
    createdAt: str(o.createdAt, 40) || new Date().toISOString(),
    demo: o.demo === true || undefined,
  };
}

function estimate(v: unknown): Estimate | undefined {
  const o = obj(v);
  if (o.unit !== 'min' && o.unit !== 'session') return undefined;
  const n = typeof o.value === 'number' && Number.isFinite(o.value) ? o.value : 0;
  if (n <= 0) return undefined;
  return o.unit === 'min' ? { unit: 'min', value: Math.min(1440, Math.max(1, Math.round(n))) } : { unit: 'session', value: Math.min(100, Math.round(n * 10) / 10) };
}

export function normRoadmapItem(v: unknown): RoadmapItem | null {
  const o = obj(v);
  const id = str(o.id, 100);
  const trackId = str(o.trackId, 100);
  const title = str(o.title, 300).trim();
  if (!id || !trackId || !title) return null;
  const done = o.done === true;
  const link = str(o.link, 2000).trim();
  return {
    id,
    trackId,
    order: typeof o.order === 'number' && Number.isFinite(o.order) ? o.order : 0,
    title,
    phase: str(o.phase, 200).trim() || undefined,
    estimate: estimate(o.estimate),
    link: /^https?:\/\//i.test(link) ? link : undefined,
    done,
    doneOn: done && isDay(o.doneOn) ? o.doneOn : undefined,
    demo: o.demo === true || undefined,
  };
}

export function normMark(v: unknown): DayMark | null {
  const o = obj(v);
  const id = str(o.id, 100);
  const trackId = str(o.trackId, 100);
  if (!id || !trackId || !isDay(o.day) || (o.kind !== 'rest' && o.kind !== 'busy')) return null;
  return { id, trackId, day: o.day, kind: o.kind, note: str(o.note, 300) || undefined, demo: o.demo === true || undefined };
}

export function normReview(v: unknown): WeekReview | null {
  const o = obj(v);
  if (!isDay(o.weekStart)) return null;
  return { weekStart: o.weekStart, wins: str(o.wins, 3000), blockers: str(o.blockers, 3000), next: str(o.next, 3000), updatedAt: str(o.updatedAt, 40) };
}

export function normSettings(v: unknown): Settings {
  const o = obj(v);
  return { busyPerMonth: num(o.busyPerMonth, 0, 10, DEFAULT_SETTINGS.busyPerMonth) };
}

/** Current backup schema version. Bump it, and migrate older versions in parseBundle, when the format changes. */
export const BUNDLE_VERSION = 2;
// Version history:
// 1: tracks, sprints, logs, marks, reviews, settings.
// 2: adds `roadmap` (RoadmapItem[]), sprint status 'planned', milestone `itemId`, track planning prefs.
//    A version 1 file is read as version 2 with an empty roadmap.

export interface ParseResult { bundle: Bundle; dropped: number }

export function parseBundle(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('File không phải JSON hợp lệ.');
  }
  const o = obj(raw);
  if (o.app !== 'nhip') throw new Error(`File này không phải bản sao lưu của ${APP_NAME}.`);
  const version = o.version === undefined ? 1 : o.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw new Error('Bản sao lưu thiếu số phiên bản hợp lệ.');
  if (version > BUNDLE_VERSION) throw new Error(`Bản sao lưu được tạo từ phiên bản mới hơn của app (định dạng ${version}). Hãy tải lại trang để cập nhật app rồi thử lại.`);
  let dropped = 0;
  const keep = <T>(list: unknown, f: (v: unknown) => T | null): T[] =>
    arr(list).flatMap((v) => {
      const r = f(v);
      if (!r) dropped++;
      return r ? [r] : [];
    });
  const tracks = keep(o.tracks, normTrack);
  const ids = new Set(tracks.map((t) => t.id));
  const owned = <T extends { trackId: string }>(list: T[]) => list.filter((x) => (ids.has(x.trackId) ? true : (dropped++, false)));
  const roadmap = version >= 2 ? owned(keep(o.roadmap, normRoadmapItem)) : [];
  const itemIds = new Set(roadmap.map((i) => i.id));
  // A milestone may only point at an item that exists in the same file.
  const sprints = owned(keep(o.sprints, normSprint)).map((s) => ({
    ...s,
    milestones: s.milestones.map((m) => (m.itemId && !itemIds.has(m.itemId) ? { ...m, itemId: undefined } : m)),
  }));
  const bundle: Bundle = {
    app: 'nhip',
    version: BUNDLE_VERSION,
    exportedAt: str(o.exportedAt, 40),
    tracks,
    sprints,
    roadmap,
    logs: owned(keep(o.logs, normLog)),
    marks: owned(keep(o.marks, normMark)),
    reviews: keep(o.reviews, normReview),
    settings: normSettings(o.settings),
  };
  return { bundle, dropped };
}

export function makeBundle(data: Omit<Bundle, 'app' | 'version' | 'exportedAt'>): Bundle {
  return { app: 'nhip', version: BUNDLE_VERSION, exportedAt: new Date().toISOString(), ...data };
}

type Data = Omit<Bundle, 'app' | 'version' | 'exportedAt'>;

export interface BundleCounts { tracks: number; sprints: number; roadmap: number; logs: number; marks: number; reviews: number; evidence: number; minutes: number }

export function countBundle(d: Data): BundleCounts {
  return {
    tracks: d.tracks.length,
    sprints: d.sprints.length,
    roadmap: d.roadmap.length,
    logs: d.logs.length,
    marks: d.marks.length,
    reviews: d.reviews.length,
    evidence: d.logs.reduce((a, l) => a + l.evidence.length, 0),
    minutes: d.logs.reduce((a, l) => a + l.minutes, 0),
  };
}

/**
 * Merges a backup into the current data without deleting anything.
 * Records are matched by id (reviews by week). When both sides have a record, the current one is kept,
 * except week reviews, where the most recently edited one wins. A rest/busy mark from the file is skipped
 * when the same track already has a mark on that day.
 */
export function mergeData(current: Data, incoming: Data): { data: Data; added: Omit<BundleCounts, 'evidence' | 'minutes'> } {
  const addById = <T extends { id: string }>(cur: T[], inc: T[]): [T[], number] => {
    const ids = new Set(cur.map((x) => x.id));
    const extra = inc.filter((x) => !ids.has(x.id));
    return [[...cur, ...extra], extra.length];
  };
  const [tracks, nt] = addById(current.tracks, incoming.tracks);
  const [sprints, ns] = addById(current.sprints, incoming.sprints);
  const [roadmap, nrm] = addById(current.roadmap, incoming.roadmap);
  const [logs, nl] = addById(current.logs, incoming.logs);
  const markKey = (m: DayMark) => `${m.trackId}|${m.day}`;
  const markIds = new Set(current.marks.map((m) => m.id));
  const markDays = new Set(current.marks.map(markKey));
  const newMarks = incoming.marks.filter((m) => !markIds.has(m.id) && !markDays.has(markKey(m)));
  const reviews = [...current.reviews];
  let nr = 0;
  for (const r of incoming.reviews) {
    const i = reviews.findIndex((x) => x.weekStart === r.weekStart);
    if (i < 0) { reviews.push(r); nr++; }
    else if ((r.updatedAt || '') > (reviews[i].updatedAt || '')) reviews[i] = r;
  }
  return {
    data: { tracks, sprints, roadmap, logs, marks: [...current.marks, ...newMarks], reviews, settings: current.settings },
    added: { tracks: nt, sprints: ns, roadmap: nrm, logs: nl, marks: newMarks.length, reviews: nr },
  };
}
