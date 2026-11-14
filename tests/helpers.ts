import type { DayMark, LogEntry, Track } from '../src/core/types.js';

export function track(over: Partial<Track> = {}): Track {
  return {
    id: 't1', name: 'Test', color: '#2f6f62', why: '', tinyAction: 'Mở docs 10 phút', plan: '', weeklyTarget: 5,
    restDays: [], nextStep: '', pauses: [], archived: false, createdAt: '2026-11-02', ...over,
  };
}

let n = 0;
export function log(day: string, over: Partial<LogEntry> = {}): LogEntry {
  return { id: `l${++n}`, trackId: 't1', day, kind: 'full', minutes: 30, note: '', blocker: '', evidence: [], createdAt: `${day}T12:00:00Z`, ...over };
}

export function mark(day: string, kind: DayMark['kind'], over: Partial<DayMark> = {}): DayMark {
  return { id: `m${++n}`, trackId: 't1', day, kind, ...over };
}
