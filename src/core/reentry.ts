// Gentle re-entry for a paused or stalled track: no lost streak, just the smallest next step.
import { addDays, diffDays, weekday } from './dates.js';
import { activeSprint } from './sprint.js';
import type { Day, LogEntry, Sprint, Track } from './types.js';

export interface Reentry {
  daysAway: number | null; // days since the last log, null if never logged
  lastNote?: string;
  lastDay?: Day;
  step: string; // smallest next step
  fromMilestone?: string;
  nextMonday: Day; // a "fresh start" landmark
  isMonday: boolean;
  lighterTarget: number; // suggested weekly target for the first week back
}

export function reentry(track: Track, sprints: Sprint[], logs: LogEntry[], today: Day): Reentry {
  const own = logs.filter((l) => l.trackId === track.id && l.day <= today).sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.createdAt < b.createdAt ? 1 : -1));
  const last = own[0];
  const sprint = activeSprint(sprints, track.id);
  const next = sprint?.milestones.find((m) => !m.done);
  let step: string;
  if (track.nextStep.trim()) step = track.nextStep.trim();
  else if (next) step = `Làm 10 phút đầu tiên cho milestone: ${next.text}`;
  else step = track.tinyAction.trim() || 'Mở lại tài liệu và làm 10 phút';
  const wd = weekday(today);
  return {
    daysAway: last ? diffDays(today, last.day) : null,
    lastNote: last?.note.trim() || undefined,
    lastDay: last?.day,
    step,
    fromMilestone: next?.text,
    nextMonday: addDays(today, wd === 1 ? 7 : ((8 - wd) % 7) || 7),
    isMonday: wd === 1,
    lighterTarget: Math.max(1, Math.min(track.weeklyTarget, Math.ceil(track.weeklyTarget / 2))),
  };
}

/** A track counts as stalled after this many days without a log while not paused. */
export const STALL_DAYS = 5;
