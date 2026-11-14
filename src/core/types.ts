// Domain types. Dates are local calendar days in 'YYYY-MM-DD' form.

export type Day = string;

export interface Pause {
  from: Day;
  to?: Day; // inclusive last paused day; undefined while still paused
  note?: string;
}

export interface Track {
  id: string;
  name: string;
  color: string;
  why: string; // why this matters, in the user's words
  tinyAction: string; // the smallest version that still counts
  plan: string; // implementation intention: "Sau khi ..., tôi sẽ ..."
  weeklyTarget: number; // target active days per week (1-7)
  restDays: number[]; // planned weekly rest days, JS getDay() numbers (0 = Sunday)
  nextStep: string; // smallest next step, written when stopping
  pauses: Pause[];
  archived: boolean;
  createdAt: Day;
  demo?: boolean;
}

export interface Milestone {
  id: string;
  text: string;
  done: boolean;
  doneOn?: Day;
}

export type SprintStatus = 'active' | 'done' | 'dropped';

export interface Sprint {
  id: string;
  trackId: string;
  title: string;
  deliverable: string; // the concrete output at the end
  start: Day;
  end: Day; // inclusive
  milestones: Milestone[];
  status: SprintStatus;
  closedOn?: Day;
  reflection?: string;
  demo?: boolean;
}

export type EvidenceKind = 'link' | 'note' | 'image';

export interface Evidence {
  kind: EvidenceKind;
  value: string; // URL, text, or image data URL
  label?: string;
}

export type LogKind = 'tiny' | 'full';

export interface LogEntry {
  id: string;
  trackId: string;
  day: Day;
  kind: LogKind;
  minutes: number; // 0 when not tracked
  note: string;
  blocker: string;
  milestoneId?: string; // milestone completed by this session
  evidence: Evidence[];
  createdAt: string; // ISO timestamp
  demo?: boolean;
}

export type MarkKind = 'rest' | 'busy';

// An explicit, one-off day off: 'rest' (planned) or 'busy' (protection used after the fact).
export interface DayMark {
  id: string;
  trackId: string;
  day: Day;
  kind: MarkKind;
  note?: string;
  demo?: boolean;
}

export interface WeekReview {
  weekStart: Day; // Monday
  wins: string;
  blockers: string;
  next: string;
  updatedAt: string;
}

export interface Settings {
  busyPerMonth: number; // allowed 'busy' protections per track per calendar month
}

export const DEFAULT_SETTINGS: Settings = { busyPerMonth: 2 };

export interface Bundle {
  app: 'nhip';
  version: 1;
  exportedAt: string;
  tracks: Track[];
  sprints: Sprint[];
  logs: LogEntry[];
  marks: DayMark[];
  reviews: WeekReview[];
  settings: Settings;
}
