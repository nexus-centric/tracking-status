// Splits the remaining roadmap into 2-4 week sprints. The result is a proposal: the UI lets the user change
// the length of each sprint and move items across boundaries before anything is created.
import { addDays } from './dates.js';
import { costPrefs, itemSessions, type CostPrefs } from './roadmap.js';
import { SPRINT_MAX_DAYS, SPRINT_MIN_DAYS } from './sprint.js';
import type { Day, RoadmapItem, Sprint, Track } from './types.js';

export const MIN_WEEKS = SPRINT_MIN_DAYS / 7; // 2
export const MAX_WEEKS = SPRINT_MAX_DAYS / 7; // 4
export const MAX_PLANNED_SPRINTS = 26;

export interface DraftSprint {
  weeks: number; // 2..4
  itemIds: string[];
  title?: string; // user override
}

export interface LaidOutSprint {
  index: number;
  title: string;
  deliverable: string;
  start: Day;
  end: Day;
  weeks: number;
  items: RoadmapItem[];
  sessions: number;
  capacity: number; // sessions available at the weekly target
  over: boolean; // sessions exceed capacity
}

export interface PlanLayout {
  sprints: LaidOutSprint[];
  finish: Day | null;
  totalSessions: number;
  capacityPerWeek: number;
  warnings: string[];
}

/** Study sessions available in one week: the weekly target, capped by non-rest days. */
export function weeklyCapacity(t: Pick<Track, 'weeklyTarget' | 'restDays'>): number {
  return Math.max(1, Math.min(t.weeklyTarget, 7 - t.restDays.length));
}

const clampWeeks = (w: number) => Math.max(MIN_WEEKS, Math.min(MAX_WEEKS, Math.round(w)));

/**
 * Greedy split: fill each sprint in roadmap order up to its capacity (weeks x sessions per week).
 * An item bigger than a whole sprint gets a sprint of its own. A short tail is folded into the previous sprint
 * when that sprint can grow to at most 4 weeks; otherwise the last sprint is shortened, never below 2 weeks.
 */
export function proposePlan(items: RoadmapItem[], track: Track, weeks = 3): DraftSprint[] {
  const p = costPrefs(track);
  const perWeek = weeklyCapacity(track);
  const w = clampWeeks(weeks);
  const cap = w * perWeek;
  const out: { weeks: number; itemIds: string[]; sessions: number }[] = [];
  let cur: { weeks: number; itemIds: string[]; sessions: number } | null = null;
  for (const it of items) {
    const c = itemSessions(it, p);
    if (!cur || (cur.itemIds.length && cur.sessions + c > cap + 1e-9)) {
      if (out.length >= MAX_PLANNED_SPRINTS) break;
      cur = { weeks: w, itemIds: [], sessions: 0 };
      out.push(cur);
    }
    cur.itemIds.push(it.id);
    cur.sessions += c;
  }
  if (out.length) {
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    const need = Math.ceil(last.sessions / perWeek - 1e-9);
    if (prev && need < MIN_WEEKS && prev.weeks < MAX_WEEKS && prev.sessions + last.sessions <= MAX_WEEKS * perWeek + 1e-9) {
      prev.itemIds.push(...last.itemIds);
      prev.sessions += last.sessions;
      prev.weeks = clampWeeks(Math.max(prev.weeks, Math.ceil(prev.sessions / perWeek - 1e-9)));
      out.pop();
    } else {
      last.weeks = clampWeeks(Math.min(last.weeks, Math.max(MIN_WEEKS, need)));
    }
  }
  return out.map(({ weeks: wk, itemIds }) => ({ weeks: wk, itemIds }));
}

function autoTitle(items: RoadmapItem[], n: number): string {
  const phases = [...new Set(items.map((i) => i.phase).filter((x): x is string => !!x))];
  if (phases.length === 1) return phases[0].slice(0, 200);
  if (phases.length > 1) return `${phases[0]} → ${phases[phases.length - 1]}`.slice(0, 200);
  return `Sprint ${n}`;
}

function autoDeliverable(items: RoadmapItem[]): string {
  if (!items.length) return '';
  if (items.length === 1) return `Hoàn thành: ${items[0].title}`.slice(0, 500);
  return `Hoàn thành ${items.length} mục, từ "${items[0].title}" đến "${items[items.length - 1].title}"`.slice(0, 500);
}

/** Turns drafts into dated sprints back to back from `start`, with effort and capacity for each. */
export function layoutPlan(drafts: DraftSprint[], all: RoadmapItem[], track: Track, start: Day, prefs?: CostPrefs): PlanLayout {
  const p = prefs ?? costPrefs(track);
  const perWeek = weeklyCapacity(track);
  const byId = new Map(all.map((i) => [i.id, i]));
  let day = start;
  const sprints: LaidOutSprint[] = [];
  const nonEmpty = drafts.filter((d) => d.itemIds.length);
  nonEmpty.forEach((d, idx) => {
    const weeks = clampWeeks(d.weeks);
    const items = d.itemIds.map((id) => byId.get(id)).filter((x): x is RoadmapItem => !!x);
    const sessions = items.reduce((a, i) => a + itemSessions(i, p), 0);
    const capacity = weeks * perWeek;
    const end = addDays(day, weeks * 7 - 1);
    sprints.push({ index: idx, title: d.title?.trim() || autoTitle(items, idx + 1), deliverable: autoDeliverable(items), start: day, end, weeks, items, sessions, capacity, over: sessions > capacity + 1e-9 });
    day = addDays(end, 1);
  });
  const warnings: string[] = [];
  const over = sprints.filter((s) => s.over).length;
  if (over) warnings.push(`${over} sprint có khối lượng vượt số buổi học dự kiến. Bạn có thể kéo dài sprint đó hoặc chuyển bớt mục sang sprint sau.`);
  if (drafts.length >= MAX_PLANNED_SPRINTS) warnings.push(`Kế hoạch dừng ở ${MAX_PLANNED_SPRINTS} sprint (khoảng nửa năm). Phần còn lại sẽ được xếp khi bạn lập lại kế hoạch.`);
  return {
    sprints,
    finish: sprints.length ? sprints[sprints.length - 1].end : null,
    totalSessions: sprints.reduce((a, s) => a + s.sessions, 0),
    capacityPerWeek: perWeek,
    warnings,
  };
}

/** Moves the item at a sprint boundary: dir 1 pushes the last item of sprint i to the next, -1 pulls the first item of the next back. */
export function shiftBoundary(drafts: DraftSprint[], i: number, dir: 1 | -1): DraftSprint[] {
  if (i < 0 || i >= drafts.length) return drafts;
  const next = drafts.map((d) => ({ ...d, itemIds: [...d.itemIds] }));
  if (dir === 1) {
    if (next[i].itemIds.length <= 1) return drafts;
    const id = next[i].itemIds.pop()!;
    if (i + 1 >= next.length) next.push({ weeks: MIN_WEEKS, itemIds: [] });
    next[i + 1].itemIds.unshift(id);
  } else {
    if (i + 1 >= next.length || !next[i + 1].itemIds.length) return drafts;
    next[i].itemIds.push(next[i + 1].itemIds.shift()!);
    if (!next[i + 1].itemIds.length) next.splice(i + 1, 1);
  }
  return next;
}

export function setWeeks(drafts: DraftSprint[], i: number, weeks: number): DraftSprint[] {
  return drafts.map((d, k) => (k === i ? { ...d, weeks: clampWeeks(weeks) } : d));
}

/** Remaining items that a new plan should place: not done, and not already in the kept active sprint. */
export function itemsToPlan(items: RoadmapItem[], sprints: Sprint[], trackId: string, closeActive: boolean): RoadmapItem[] {
  const active = sprints.find((s) => s.trackId === trackId && s.status === 'active');
  const kept = new Set<string>();
  if (active && !closeActive) for (const m of active.milestones) if (m.itemId) kept.add(m.itemId);
  return items.filter((i) => i.trackId === trackId && !i.done && !kept.has(i.id)).sort((a, b) => a.order - b.order);
}

/** Default first day of a new plan: today, or the day after the kept active sprint ends (if later). */
export function planStart(sprints: Sprint[], trackId: string, today: Day, closeActive: boolean): Day {
  const active = sprints.filter((s) => s.trackId === trackId && s.status === 'active').sort((a, b) => (a.end < b.end ? 1 : -1))[0];
  if (!active || closeActive) return today;
  const after = addDays(active.end, 1);
  return after > today ? after : today;
}

export interface PlanChanges {
  create: Sprint[]; // new sprints, the first one 'active' when no active sprint is kept
  remove: string[]; // ids of the previous 'planned' sprints of the track (replaced by this plan)
  close?: Sprint; // the active sprint, closed as done, when closeActive is set
}

/**
 * Turns a laid-out plan into sprint records. Previously planned sprints of the track are replaced; the active
 * sprint is kept untouched unless closeActive is set. Dates are exactly those shown in the preview.
 */
export function planChanges(layout: PlanLayout, track: Track, sprints: Sprint[], today: Day, newId: () => string, closeActive = false): PlanChanges {
  const own = sprints.filter((s) => s.trackId === track.id);
  const active = own.find((s) => s.status === 'active');
  const remove = own.filter((s) => s.status === 'planned').map((s) => s.id);
  const close = active && closeActive ? { ...active, status: 'done' as const, closedOn: today, reflection: active.reflection ?? 'Khép lại khi lập lại kế hoạch lộ trình.' } : undefined;
  const hasActive = !!active && !closeActive;
  const create: Sprint[] = layout.sprints.map((s, k) => ({
    id: newId(),
    trackId: track.id,
    title: s.title,
    deliverable: s.deliverable,
    start: s.start,
    end: s.end,
    milestones: s.items.map((i) => ({ id: newId(), text: i.title, done: false, itemId: i.id })),
    status: k === 0 && !hasActive ? 'active' : 'planned',
  }));
  return { create, remove, close };
}
