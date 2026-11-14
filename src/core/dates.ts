// Calendar-day helpers working on 'YYYY-MM-DD' strings. All arithmetic is done in UTC
// so daylight-saving changes cannot shift a day.
import type { Day } from './types.js';

const MS = 86_400_000;

export function toDay(d: Date): Day {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function today(): Day {
  return toDay(new Date());
}

function utc(day: Day): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): Day {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isDay(s: unknown): s is Day {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromUtc(utc(s)) === s;
}

export function addDays(day: Day, n: number): Day {
  return fromUtc(utc(day) + n * MS);
}

export function diffDays(a: Day, b: Day): number {
  return Math.round((utc(a) - utc(b)) / MS);
}

/** JS getDay() convention: 0 = Sunday ... 6 = Saturday. */
export function weekday(day: Day): number {
  return new Date(utc(day)).getUTCDay();
}

/** Monday of the week containing day. */
export function weekStart(day: Day): Day {
  const wd = weekday(day);
  return addDays(day, wd === 0 ? -6 : 1 - wd);
}

export function range(from: Day, to: Day): Day[] {
  const out: Day[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthKey(day: Day): string {
  return day.slice(0, 7);
}

const WD_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function weekdayShort(n: number): string {
  return WD_SHORT[n];
}

/** "15/11" style, optionally with weekday prefix. */
export function fmtDay(day: Day, withWeekday = false): string {
  const [, m, d] = day.split('-');
  const s = `${Number(d)}/${Number(m)}`;
  return withWeekday ? `${WD_SHORT[weekday(day)]} ${s}` : s;
}
