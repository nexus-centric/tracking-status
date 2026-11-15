// Study session timer: pure state logic, no DOM.
// Time is always derived from wall-clock timestamps (Date.now()), never from counting interval ticks,
// so a reload, a sleeping tab or a throttled background timer cannot make the clock drift.

import type { Day, LogKind } from './types.js';

export type TimerMode = 'stopwatch' | 'countdown' | 'pomodoro';
export type TimerStatus = 'running' | 'paused' | 'stopped';
export type PhaseKind = 'focus' | 'break' | 'long';

export interface PomodoroConfig {
  focus: number; // minutes
  brk: number; // short break, minutes
  long: number; // long break, minutes
  every: number; // a long break after this many focus blocks
}

export const DEFAULT_POMODORO: PomodoroConfig = { focus: 25, brk: 5, long: 20, every: 4 };
export const TIMER_KEY = 'nhip:timer';
export const TIMER_PREFS_KEY = 'nhip:timer-prefs';
const MIN = 60_000;

export interface TimerSession {
  v: 1;
  mode: TimerMode;
  trackId: string;
  day: Day; // local day the session started; the log entry is saved on this day
  targetMin: number; // countdown target
  pomo: PomodoroConfig;
  status: TimerStatus;
  startedAt: number; // epoch ms of the first start
  runStart: number | null; // epoch ms when the current running stretch began; null when not running
  accMs: number; // active time accumulated before runStart
  announced: number; // index of the last phase boundary already announced (notification/sound)
}

export interface TimerPrefs {
  mode: TimerMode;
  trackId: string;
  targetMin: number;
  pomo: PomodoroConfig;
  wakeLock: boolean;
  sound: boolean;
}

export const DEFAULT_TIMER_PREFS: TimerPrefs = { mode: 'pomodoro', trackId: '', targetMin: 25, pomo: { ...DEFAULT_POMODORO }, wakeLock: false, sound: true };

const clampInt = (n: unknown, lo: number, hi: number, fallback: number): number => {
  const x = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.max(lo, Math.min(hi, x));
};

export function normalizePomodoro(p: Partial<PomodoroConfig> | undefined): PomodoroConfig {
  return {
    focus: clampInt(p?.focus, 1, 180, DEFAULT_POMODORO.focus),
    brk: clampInt(p?.brk, 1, 60, DEFAULT_POMODORO.brk),
    long: clampInt(p?.long, 1, 90, DEFAULT_POMODORO.long),
    every: clampInt(p?.every, 1, 12, DEFAULT_POMODORO.every),
  };
}

const isMode = (m: unknown): m is TimerMode => m === 'stopwatch' || m === 'countdown' || m === 'pomodoro';

export function startSession(opts: { mode: TimerMode; trackId: string; day: Day; targetMin?: number; pomo?: Partial<PomodoroConfig> }, now: number): TimerSession {
  return {
    v: 1,
    mode: opts.mode,
    trackId: opts.trackId,
    day: opts.day,
    targetMin: clampInt(opts.targetMin, 1, 600, 25),
    pomo: normalizePomodoro(opts.pomo),
    status: 'running',
    startedAt: now,
    runStart: now,
    accMs: 0,
    announced: 0,
  };
}

/** Active (non-paused) time in ms. Never negative, even if the clock went backwards. */
export function elapsedMs(s: TimerSession, now: number): number {
  const run = s.status === 'running' && s.runStart !== null ? Math.max(0, now - s.runStart) : 0;
  const total = s.accMs + run;
  return s.mode === 'countdown' ? Math.min(total, s.targetMin * MIN) : total;
}

export function pauseSession(s: TimerSession, now: number): TimerSession {
  if (s.status !== 'running') return s;
  return { ...s, status: 'paused', accMs: elapsedMs(s, now), runStart: null };
}

export function resumeSession(s: TimerSession, now: number): TimerSession {
  if (s.status === 'running') return s;
  return { ...s, status: 'running', runStart: now };
}

export function stopSession(s: TimerSession, now: number): TimerSession {
  if (s.status === 'stopped') return s;
  return { ...s, status: 'stopped', accMs: elapsedMs(s, now), runStart: null };
}

export interface Phase {
  index: number; // 0-based position in the focus/break sequence
  kind: PhaseKind;
  startMs: number; // offset from session start, active time
  lengthMs: number;
  focusBefore: number; // completed focus blocks before this phase
}

/** The pomodoro phase that contains active offset `t` (ms). */
export function phaseAt(p: PomodoroConfig, t: number): Phase {
  const f = p.focus * MIN;
  const b = p.brk * MIN;
  const l = p.long * MIN;
  // One cycle = `every` focus blocks, (every - 1) short breaks and one long break.
  const cycle = p.every * f + (p.every - 1) * b + l;
  const perCycle = p.every * 2; // phases per cycle
  const c = Math.floor(Math.max(0, t) / cycle);
  let off = c * cycle;
  let index = c * perCycle;
  let focusBefore = c * p.every;
  for (let i = 0; i < p.every; i++) {
    if (t < off + f) return { index, kind: 'focus', startMs: off, lengthMs: f, focusBefore };
    off += f; index++; focusBefore++;
    const isLong = i === p.every - 1;
    const len = isLong ? l : b;
    if (t < off + len) return { index, kind: isLong ? 'long' : 'break', startMs: off, lengthMs: len, focusBefore };
    off += len; index++;
  }
  // Unreachable: t is always inside the cycle computed above.
  return { index, kind: 'focus', startMs: off, lengthMs: f, focusBefore };
}

/** Focus time inside the first `t` ms of a pomodoro session. */
export function focusMsAt(p: PomodoroConfig, t: number): number {
  const ph = phaseAt(p, t);
  const done = ph.focusBefore * p.focus * MIN;
  return ph.kind === 'focus' ? done + (t - ph.startMs) : done;
}

export interface TimerView {
  status: TimerStatus;
  mode: TimerMode;
  elapsedMs: number;
  /** Big number on the clock face: remaining time for countdown/pomodoro phase, elapsed for stopwatch. */
  displayMs: number;
  /** 0..1 progress of the ring. */
  progress: number;
  phase?: Phase;
  focusMs: number;
  finished: boolean; // countdown reached its target
}

export function viewAt(s: TimerSession, now: number): TimerView {
  const e = elapsedMs(s, now);
  if (s.mode === 'countdown') {
    const total = s.targetMin * MIN;
    return { status: s.status, mode: s.mode, elapsedMs: e, displayMs: Math.max(0, total - e), progress: total ? e / total : 0, focusMs: e, finished: e >= total };
  }
  if (s.mode === 'pomodoro') {
    const ph = phaseAt(s.pomo, e);
    const into = e - ph.startMs;
    return { status: s.status, mode: s.mode, elapsedMs: e, displayMs: Math.max(0, ph.lengthMs - into), progress: ph.lengthMs ? into / ph.lengthMs : 0, phase: ph, focusMs: focusMsAt(s.pomo, e), finished: false };
  }
  // Stopwatch: the ring fills once per hour.
  return { status: s.status, mode: s.mode, elapsedMs: e, displayMs: e, progress: (e % (60 * MIN)) / (60 * MIN), focusMs: e, finished: false };
}

/**
 * Epoch ms of the next moment worth announcing (end of the countdown or of the current pomodoro phase),
 * or null when nothing is pending (paused, stopped, stopwatch, or countdown already done).
 */
export function nextBoundaryAt(s: TimerSession, now: number): number | null {
  if (s.status !== 'running') return null;
  const e = elapsedMs(s, now);
  if (s.mode === 'countdown') {
    const left = s.targetMin * MIN - e;
    return left > 0 ? now + left : null;
  }
  if (s.mode === 'pomodoro') {
    const ph = phaseAt(s.pomo, e);
    return now + (ph.startMs + ph.lengthMs - e);
  }
  return null;
}

/**
 * Boundary counter used to announce each phase change exactly once, even across reloads:
 * pomodoro = index of the current phase; countdown = 1 once finished; stopwatch = 0.
 */
export function boundaryIndex(s: TimerSession, now: number): number {
  if (s.mode === 'pomodoro') return phaseAt(s.pomo, elapsedMs(s, now)).index;
  if (s.mode === 'countdown') return elapsedMs(s, now) >= s.targetMin * MIN ? 1 : 0;
  return 0;
}

/** Minutes to write into the log entry. Pomodoro counts focus time only, breaks are excluded. */
export function minutesToLog(s: TimerSession, now: number): number {
  const v = viewAt(s, now);
  const ms = s.mode === 'pomodoro' ? v.focusMs : v.elapsedMs;
  return Math.max(0, Math.min(1440, Math.round(ms / MIN)));
}

/** Suggested log kind: a session of 15 minutes or more is a full session, shorter is a tiny step. */
export function suggestedKind(minutes: number): LogKind {
  return minutes >= 15 ? 'full' : 'tiny';
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Parses a stored session; returns null for anything malformed so a bad value can never break the app. */
export function parseSession(raw: string | null | undefined): TimerSession | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<TimerSession>;
    if (!o || o.v !== 1 || !isMode(o.mode) || typeof o.trackId !== 'string' || typeof o.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.day)) return null;
    if (o.status !== 'running' && o.status !== 'paused' && o.status !== 'stopped') return null;
    if (typeof o.startedAt !== 'number' || !Number.isFinite(o.startedAt)) return null;
    const runStart = o.status === 'running' && typeof o.runStart === 'number' && Number.isFinite(o.runStart) ? o.runStart : null;
    if (o.status === 'running' && runStart === null) return null;
    return {
      v: 1,
      mode: o.mode,
      trackId: o.trackId,
      day: o.day,
      targetMin: clampInt(o.targetMin, 1, 600, 25),
      pomo: normalizePomodoro(o.pomo),
      status: o.status,
      startedAt: o.startedAt,
      runStart,
      accMs: Math.max(0, typeof o.accMs === 'number' && Number.isFinite(o.accMs) ? o.accMs : 0),
      announced: clampInt(o.announced, 0, 1e6, 0),
    };
  } catch {
    return null;
  }
}

export function parseTimerPrefs(raw: string | null | undefined): TimerPrefs {
  const d = DEFAULT_TIMER_PREFS;
  if (!raw) return { ...d, pomo: { ...d.pomo } };
  try {
    const o = JSON.parse(raw) as Partial<TimerPrefs>;
    return {
      mode: isMode(o.mode) ? o.mode : d.mode,
      trackId: typeof o.trackId === 'string' ? o.trackId : '',
      targetMin: clampInt(o.targetMin, 1, 600, d.targetMin),
      pomo: normalizePomodoro(o.pomo),
      wakeLock: o.wakeLock === true,
      sound: o.sound !== false,
    };
  } catch {
    return { ...d, pomo: { ...d.pomo } };
  }
}
