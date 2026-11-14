// Rhythm math. The design goal is a measure that survives normal life: planned rest days,
// a few protected busy days, and pauses never count as misses, and a single missed day
// is treated as a recoverable event rather than a reset (see docs/DESIGN.md).
import { addDays, diffDays, monthKey, range, weekStart, weekday } from './dates.js';
import type { Day, DayMark, LogEntry, Settings, Track } from './types.js';

export type DayStatus = 'done' | 'rest' | 'busy' | 'paused' | 'miss' | 'open' | 'future' | 'before';

export interface TrackData {
  track: Track;
  logs: LogEntry[]; // logs of this track (others are ignored)
  marks: DayMark[]; // marks of this track
}

export interface Ctx {
  track: Track;
  doneDays: Set<Day>;
  minutes: Map<Day, number>;
  marks: Map<Day, DayMark['kind']>;
  start: Day; // first day the track counts from
  today: Day;
}

export function makeCtx(data: TrackData, today: Day): Ctx {
  const { track } = data;
  const doneDays = new Set<Day>();
  const minutes = new Map<Day, number>();
  let start = track.createdAt;
  for (const l of data.logs) {
    if (l.trackId !== track.id || l.day > today) continue;
    doneDays.add(l.day);
    minutes.set(l.day, (minutes.get(l.day) ?? 0) + (l.minutes || 0));
    if (l.day < start) start = l.day;
  }
  const marks = new Map<Day, DayMark['kind']>();
  for (const m of data.marks) if (m.trackId === track.id) marks.set(m.day, m.kind);
  return { track, doneDays, minutes, marks, start, today };
}

export function isPaused(track: Track, day: Day): boolean {
  return track.pauses.some((p) => day >= p.from && (p.to === undefined || day <= p.to));
}

/** Paused on the given day: an open pause, or a pause scheduled to end on a later day. */
export function currentlyPaused(track: Track, day: Day): boolean {
  return isPaused(track, day);
}

export function dayStatus(ctx: Ctx, day: Day): DayStatus {
  if (day > ctx.today) return 'future';
  if (ctx.doneDays.has(day)) return 'done';
  if (day < ctx.start) return 'before';
  if (isPaused(ctx.track, day)) return 'paused';
  const mark = ctx.marks.get(day);
  if (mark) return mark;
  if (ctx.track.restDays.includes(weekday(day))) return 'rest';
  if (day === ctx.today) return 'open';
  return 'miss';
}

const OFF: DayStatus[] = ['rest', 'busy', 'paused'];

export interface Last7 {
  done: number;
  off: number; // rest, busy or paused days
  missed: number;
  days: { day: Day; status: DayStatus }[];
}

/** The last seven days ending today. */
export function last7(ctx: Ctx): Last7 {
  const days = range(addDays(ctx.today, -6), ctx.today).map((day) => ({ day, status: dayStatus(ctx, day) }));
  return {
    done: days.filter((d) => d.status === 'done').length,
    off: days.filter((d) => OFF.includes(d.status)).length,
    missed: days.filter((d) => d.status === 'miss').length,
    days,
  };
}

export type WeekState = 'met' | 'missed' | 'in-progress' | 'paused' | 'future';

export interface WeekResult {
  weekStart: Day;
  target: number;
  done: number;
  available: number; // days in the week that were not off
  remaining: number; // days still usable (today and later) in an in-progress week
  state: WeekState;
  reachable: boolean; // in-progress week can still be met
}

/**
 * Weekly target for one Monday-Sunday week. The base target is prorated for a track that
 * started mid-week and is capped by the number of days that were not rest, busy or paused.
 */
export function weekResult(ctx: Ctx, monday: Day): WeekResult {
  const days = range(monday, addDays(monday, 6));
  let eligible = 0;
  let available = 0;
  let done = 0;
  let remaining = 0;
  for (const d of days) {
    const st = dayStatus(ctx, d);
    if (st === 'done') done++;
    const counted = d >= ctx.start && !isPaused(ctx.track, d);
    if (counted) eligible++;
    if (st === 'done' || st === 'miss' || st === 'open' || (st === 'future' && counted && !isOffPlanned(ctx, d))) available++;
    if ((st === 'open' || (st === 'future' && counted && !isOffPlanned(ctx, d)))) remaining++;
  }
  const base = Math.ceil((ctx.track.weeklyTarget * eligible) / 7);
  const target = Math.max(0, Math.min(base, available));
  const sunday = days[6];
  let state: WeekState;
  if (monday > ctx.today) state = 'future';
  else if (target === 0) state = done > 0 ? 'met' : 'paused';
  else if (done >= target) state = 'met';
  else if (sunday >= ctx.today) state = 'in-progress';
  else state = 'missed';
  return { weekStart: monday, target, done, available, remaining, state, reachable: state === 'met' || done + remaining >= target };
}

function isOffPlanned(ctx: Ctx, day: Day): boolean {
  const mark = ctx.marks.get(day);
  if (mark) return true;
  return ctx.track.restDays.includes(weekday(day));
}

/** Consecutive met weeks. The current week only adds when met and never breaks the run while in progress. */
export function weekStreak(ctx: Ctx): number {
  let n = 0;
  let monday = weekStart(ctx.today);
  const first = weekStart(ctx.start);
  const cur = weekResult(ctx, monday);
  if (cur.state === 'met') n++;
  monday = addDays(monday, -7);
  while (monday >= first) {
    const w = weekResult(ctx, monday);
    if (w.state === 'met') n++;
    else if (w.state !== 'paused') break;
    monday = addDays(monday, -7);
  }
  return n;
}

/** Missed days in a row before today, skipping rest, busy and paused days. */
export function missRun(ctx: Ctx): number {
  let n = 0;
  for (let d = addDays(ctx.today, -1); d >= ctx.start; d = addDays(d, -1)) {
    const st = dayStatus(ctx, d);
    if (st === 'miss') n++;
    else if (st === 'done' || st === 'before') break;
  }
  return n;
}

export type TodayState = 'paused' | 'done' | 'rest' | 'on-track' | 'recover' | 'restart';

/**
 * 'recover': one miss just happened, so today's tiny step keeps it from becoming two in a row.
 * 'restart': two or more misses; the app offers a gentle re-entry instead of a broken streak.
 */
export function todayState(ctx: Ctx): TodayState {
  if (currentlyPaused(ctx.track, ctx.today)) return 'paused';
  const st = dayStatus(ctx, ctx.today);
  if (st === 'done') return 'done';
  if (st === 'rest' || st === 'busy') return 'rest';
  const run = missRun(ctx);
  if (run === 0) return 'on-track';
  if (run === 1) return 'recover';
  return 'restart';
}

/**
 * Momentum score from 0 to 100, an exponential moving average in the style of Loop Habit
 * Tracker (multiplier 0.5^(sqrt(f)/13)). Each day's input is the share of the weekly target
 * reached in the trailing seven days, capped at 1. Off days and pauses are skipped, so they
 * neither raise nor lower the score. An open today is left out until it is logged.
 */
export function momentum(ctx: Ctx): number {
  const f = Math.max(1, Math.min(7, ctx.track.weeklyTarget)) / 7;
  const m = Math.pow(0.5, Math.sqrt(f) / 13);
  let score = 0;
  for (let d = ctx.start; d <= ctx.today; d = addDays(d, 1)) {
    const st = dayStatus(ctx, d);
    if (st === 'open' || st === 'paused' || st === 'rest' || st === 'busy' || st === 'before') continue;
    let done = 0;
    let avail = 0;
    for (let k = 0; k < 7; k++) {
      const w = addDays(d, -k);
      if (w < ctx.start) continue;
      const s = dayStatus(ctx, w);
      if (s === 'done') { done++; avail++; } else if (s === 'miss' || s === 'open') avail++;
    }
    const target = Math.min(ctx.track.weeklyTarget, Math.max(avail, 1));
    const p = Math.min(1, done / target);
    score = score * m + p * (1 - m);
  }
  return Math.round(score * 100);
}

export function busyUsed(marks: DayMark[], trackId: string, day: Day): number {
  const key = monthKey(day);
  return marks.filter((m) => m.trackId === trackId && m.kind === 'busy' && monthKey(m.day) === key).length;
}

export function canUseBusy(marks: DayMark[], trackId: string, day: Day, settings: Settings): boolean {
  return busyUsed(marks, trackId, day) < settings.busyPerMonth;
}

export interface HeatCell { day: Day; status: DayStatus; minutes: number }

/** Grid of `weeks` Monday-first columns ending with the current week. */
export function heatmap(ctx: Ctx, weeks: number): HeatCell[][] {
  const lastMonday = weekStart(ctx.today);
  const cols: HeatCell[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const monday = addDays(lastMonday, -7 * w);
    cols.push(range(monday, addDays(monday, 6)).map((day) => ({ day, status: dayStatus(ctx, day), minutes: ctx.minutes.get(day) ?? 0 })));
  }
  return cols;
}

export function daysSinceLastLog(ctx: Ctx): number | null {
  let last: Day | null = null;
  for (const d of ctx.doneDays) if (!last || d > last) last = d;
  return last ? diffDays(ctx.today, last) : null;
}
