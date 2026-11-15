// Roadmap math: item cost, whole-roadmap progress, pace-based projection, and milestone <-> item sync.
// Everything here is an estimate built from the user's own records; the UI states the assumptions.
import { addDays, diffDays } from './dates.js';
import type { Day, LogEntry, RoadmapItem, Sprint, Track } from './types.js';

export const DEFAULT_SESSION_MINUTES = 45;
export const DEFAULT_ITEMS_PER_SESSION = 1;
export const PACE_WINDOW_MAX = 28;
export const PACE_WINDOW_MIN = 14;

export interface CostPrefs { sessionMinutes: number; itemsPerSession: number }

export function costPrefs(t: Pick<Track, 'sessionMinutes' | 'itemsPerSession'>): CostPrefs {
  return {
    sessionMinutes: t.sessionMinutes && t.sessionMinutes > 0 ? t.sessionMinutes : DEFAULT_SESSION_MINUTES,
    itemsPerSession: t.itemsPerSession && t.itemsPerSession > 0 ? t.itemsPerSession : DEFAULT_ITEMS_PER_SESSION,
  };
}

/** Effort of one item in study sessions: its own estimate, or 1 / itemsPerSession when it has none. */
export function itemSessions(item: Pick<RoadmapItem, 'estimate'>, p: CostPrefs): number {
  const e = item.estimate;
  if (e?.unit === 'session') return e.value;
  if (e?.unit === 'min') return e.value / p.sessionMinutes;
  return 1 / p.itemsPerSession;
}

export function trackItems(items: RoadmapItem[], trackId: string): RoadmapItem[] {
  return items.filter((i) => i.trackId === trackId).sort((a, b) => a.order - b.order);
}

export interface PhaseProgress { name: string; total: number; done: number; sessions: number; doneSessions: number }

export interface RoadmapProgress {
  total: number;
  done: number;
  weighted: boolean; // true when at least one item has an estimate, so pct uses effort, not counts
  pct: number; // 0..1
  totalSessions: number;
  doneSessions: number;
  remainingSessions: number;
  phases: PhaseProgress[];
}

export function roadmapProgress(items: RoadmapItem[], p: CostPrefs): RoadmapProgress {
  const weighted = items.some((i) => i.estimate);
  let totalSessions = 0;
  let doneSessions = 0;
  const phases: PhaseProgress[] = [];
  for (const i of items) {
    const c = itemSessions(i, p);
    totalSessions += c;
    if (i.done) doneSessions += c;
    const name = i.phase ?? '';
    let ph = phases.at(-1);
    if (!ph || ph.name !== name) { ph = { name, total: 0, done: 0, sessions: 0, doneSessions: 0 }; phases.push(ph); }
    ph.total++; ph.sessions += c;
    if (i.done) { ph.done++; ph.doneSessions += c; }
  }
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? (weighted ? (totalSessions ? doneSessions / totalSessions : 0) : done / items.length) : 0;
  return { total: items.length, done, weighted, pct, totalSessions, doneSessions, remainingSessions: totalSessions - doneSessions, phases };
}

export type Confidence = 'none' | 'low' | 'ok';

export interface Projection {
  windowDays: number; // days looked back, today included
  activeDays: number; // days in the window with a log or a finished item
  itemsInWindow: number;
  sessionsInWindow: number; // effort of items finished in the window
  pacePerActiveDay: number; // sessions of roadmap effort per active day
  activePerWeek: number; // observed active days per week
  confidence: Confidence;
  remainingSessions: number;
  recentFinish?: Day; // at the recent pace
  targetFinish: Day | null; // at the weekly target, one session per active day; null when nothing is left
  plannedFinish?: Day; // end of the last sprint that holds remaining items, when every remaining item is planned
  behindDays?: number; // recentFinish minus plannedFinish (or targetFinish); positive means later
}

/**
 * Projection from recent pace. Window: the last 28 days, or fewer when the track is younger (confidence is then
 * "low" under 14 days). Pace = effort of items finished in the window / active days in the window. Calendar time
 * = remaining effort / pace, spread over the observed active days per week.
 */
export function projectRoadmap(input: { track: Track; items: RoadmapItem[]; logs: LogEntry[]; sprints: Sprint[]; today: Day }): Projection {
  const { track, today } = input;
  const p = costPrefs(track);
  const prog = roadmapProgress(input.items, p);
  const logs = input.logs.filter((l) => l.trackId === track.id && l.day <= today);
  let start = track.createdAt;
  for (const l of logs) if (l.day < start) start = l.day;
  for (const i of input.items) if (i.doneOn && i.doneOn < start) start = i.doneOn;
  const age = Math.max(1, diffDays(today, start) + 1);
  const windowDays = Math.min(PACE_WINDOW_MAX, age);
  const from = addDays(today, -(windowDays - 1));
  const active = new Set<Day>();
  for (const l of logs) if (l.day >= from) active.add(l.day);
  let itemsInWindow = 0;
  let sessionsInWindow = 0;
  for (const i of input.items) {
    if (i.done && i.doneOn && i.doneOn >= from && i.doneOn <= today) {
      active.add(i.doneOn);
      itemsInWindow++;
      sessionsInWindow += itemSessions(i, p);
    }
  }
  const activeDays = active.size;
  const pacePerActiveDay = activeDays ? sessionsInWindow / activeDays : 0;
  const activePerWeek = (activeDays * 7) / windowDays;
  const remaining = prog.remainingSessions;
  const confidence: Confidence = !itemsInWindow ? 'none' : windowDays >= PACE_WINDOW_MIN && activeDays >= 4 && itemsInWindow >= 3 ? 'ok' : 'low';
  const eps = 1e-9;
  const finishAt = (sessions: number, perActiveDay: number, perWeek: number) =>
    addDays(today, Math.max(1, Math.ceil(((sessions / perActiveDay) * 7) / perWeek - eps)));
  const recentFinish = remaining > eps && itemsInWindow ? finishAt(remaining, pacePerActiveDay, activePerWeek) : undefined;
  const targetFinish = remaining > eps ? finishAt(remaining, 1, Math.max(1, track.weeklyTarget)) : null;
  const plannedFinish = planEnd(input.items, input.sprints, track.id);
  const ref = plannedFinish ?? targetFinish ?? undefined;
  const behindDays = recentFinish && ref && confidence !== 'none' ? diffDays(recentFinish, ref) : undefined;
  return { windowDays, activeDays, itemsInWindow, sessionsInWindow, pacePerActiveDay, activePerWeek, confidence, remainingSessions: remaining, recentFinish, targetFinish, plannedFinish, behindDays };
}

/** Last end day of open sprints that hold the remaining items, or undefined when some remaining item is unplanned. */
export function planEnd(items: RoadmapItem[], sprints: Sprint[], trackId: string): Day | undefined {
  const open = sprints.filter((s) => s.trackId === trackId && (s.status === 'active' || s.status === 'planned'));
  const where = new Map<string, Day>();
  for (const s of open) for (const m of s.milestones) if (m.itemId) where.set(m.itemId, s.end);
  const remaining = items.filter((i) => !i.done);
  if (!remaining.length || remaining.some((i) => !where.has(i.id))) return undefined;
  return remaining.map((i) => where.get(i.id)!).sort().at(-1);
}

/** Ids of roadmap items already placed in an open (active or planned) sprint of the track. */
export function plannedItemIds(sprints: Sprint[], trackId: string, statuses: Sprint['status'][] = ['active', 'planned']): Set<string> {
  const ids = new Set<string>();
  for (const s of sprints) if (s.trackId === trackId && statuses.includes(s.status)) for (const m of s.milestones) if (m.itemId) ids.add(m.itemId);
  return ids;
}

/** Sets an item done or not done and mirrors the change on every linked milestone of an open (active or planned) sprint. */
export function setItemDone(items: RoadmapItem[], sprints: Sprint[], itemId: string, done: boolean, day: Day): { item?: RoadmapItem; sprints: Sprint[] } {
  const cur = items.find((i) => i.id === itemId);
  if (!cur) return { sprints: [] };
  const item: RoadmapItem = { ...cur, done, doneOn: done ? (cur.done && cur.doneOn ? cur.doneOn : day) : undefined };
  const changed: Sprint[] = [];
  for (const s of sprints) {
    // Closed sprints are history: their milestones keep the state they had when the sprint ended.
    if (s.status === 'done' || s.status === 'dropped') continue;
    if (!s.milestones.some((m) => m.itemId === itemId && m.done !== done)) continue;
    changed.push({ ...s, milestones: s.milestones.map((m) => (m.itemId === itemId ? { ...m, done, doneOn: done ? (m.doneOn ?? item.doneOn) : undefined } : m)) });
  }
  return { item, sprints: changed };
}

/** Sets a milestone done or not done; when it is linked, the roadmap item (and other linked milestones) follow. */
export function setMilestoneDone(items: RoadmapItem[], sprints: Sprint[], sprintId: string, msId: string, done: boolean, day: Day): { item?: RoadmapItem; sprints: Sprint[] } {
  const s = sprints.find((x) => x.id === sprintId);
  const m = s?.milestones.find((x) => x.id === msId);
  if (!s || !m) return { sprints: [] };
  const own: Sprint = { ...s, milestones: s.milestones.map((x) => (x.id === msId ? { ...x, done, doneOn: done ? (x.doneOn ?? day) : undefined } : x)) };
  if (!m.itemId || !items.some((i) => i.id === m.itemId)) return { sprints: [own] };
  const rest = sprints.map((x) => (x.id === s.id ? own : x));
  const r = setItemDone(items, rest, m.itemId, done, done ? (m.doneOn ?? day) : day);
  const merged = new Map<string, Sprint>([[own.id, own]]);
  for (const x of r.sprints) merged.set(x.id, x);
  return { item: r.item, sprints: [...merged.values()] };
}

/** Moves an item one step up or down (inside the whole roadmap order). Returns the items whose order changed. */
export function moveItem(items: RoadmapItem[], itemId: string, dir: -1 | 1): RoadmapItem[] {
  const i = items.findIndex((x) => x.id === itemId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return [];
  const a = items[i];
  const b = items[j];
  // Moving across a phase boundary adopts the neighbour's phase, so the item visibly joins that section.
  const phase = a.phase !== b.phase ? b.phase : a.phase;
  return [{ ...a, order: b.order, phase }, { ...b, order: a.order }];
}

/** Re-numbers orders 0..n-1 in the given sequence. */
export function renumber(items: RoadmapItem[]): RoadmapItem[] {
  return items.map((x, i) => (x.order === i ? x : { ...x, order: i }));
}
