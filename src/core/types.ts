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
  sessionMinutes?: number; // planning: minutes in one study session (default 45)
  itemsPerSession?: number; // planning: roadmap items without an estimate finished per session (default 1)
  demo?: boolean;
}

export interface Milestone {
  id: string;
  text: string;
  done: boolean;
  doneOn?: Day;
  itemId?: string; // linked roadmap item; completing one completes the other
}

/** Optional effort estimate of a roadmap item. */
export interface Estimate {
  unit: 'min' | 'session';
  value: number;
}

/** One step of a track's whole learning roadmap (a lesson, a chapter, a lab). */
export interface RoadmapItem {
  id: string;
  trackId: string;
  order: number; // position inside the track's roadmap, ascending
  title: string;
  phase?: string; // section or module name
  estimate?: Estimate;
  link?: string;
  done: boolean;
  doneOn?: Day;
  demo?: boolean;
}

export type SprintStatus = 'planned' | 'active' | 'done' | 'dropped';

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
  version: 2;
  exportedAt: string;
  tracks: Track[];
  sprints: Sprint[];
  roadmap: RoadmapItem[];
  logs: LogEntry[];
  marks: DayMark[];
  reviews: WeekReview[];
  settings: Settings;
}
