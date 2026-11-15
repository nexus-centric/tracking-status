// Sprint progress: progress is measured by finished milestones, compared with elapsed time.
import { addDays, diffDays } from './dates.js';
import type { Day, Milestone, Sprint } from './types.js';

export type Pace = 'not-started' | 'ahead' | 'on-track' | 'behind' | 'overdue' | 'done' | 'dropped' | 'no-milestones';

export interface SprintProgress {
  total: number;
  done: number;
  pct: number; // 0..1 milestones done
  totalDays: number;
  elapsed: number; // days elapsed including today, clamped to the sprint
  timePct: number; // 0..1
  daysLeft: number; // days after today until the end, inclusive of the end day
  pace: Pace;
  next?: Milestone;
  expectedByNow: number; // milestones a linear plan would have finished by today
}

export const SPRINT_MIN_DAYS = 14;
export const SPRINT_MAX_DAYS = 28;

export function sprintLength(s: Pick<Sprint, 'start' | 'end'>): number {
  return diffDays(s.end, s.start) + 1;
}

/** Returns a Vietnamese warning when the sprint length is outside the 2-4 week range, or null. */
export function lengthWarning(start: Day, end: Day): string | null {
  const n = diffDays(end, start) + 1;
  if (n < 1) return 'Ngày kết thúc phải sau ngày bắt đầu.';
  if (n < SPRINT_MIN_DAYS) return `Đợt này chỉ ${n} ngày. Đợt 2-4 tuần thường đủ thời gian để ra một sản phẩm nhỏ.`;
  if (n > SPRINT_MAX_DAYS) return `Đợt này dài ${n} ngày. Đợt dài hơn 4 tuần dễ mất hạn chót; thử tách thành hai đợt.`;
  return null;
}

export function defaultEnd(start: Day, weeks = 3): Day {
  return addDays(start, weeks * 7 - 1);
}

export function sprintProgress(s: Sprint, today: Day): SprintProgress {
  const total = s.milestones.length;
  const done = s.milestones.filter((m) => m.done).length;
  const pct = total ? done / total : 0;
  const totalDays = Math.max(1, sprintLength(s));
  const elapsed = Math.max(0, Math.min(totalDays, diffDays(today, s.start) + 1));
  const timePct = elapsed / totalDays;
  const daysLeft = Math.max(0, diffDays(s.end, today));
  const next = s.milestones.find((m) => !m.done);
  const expectedByNow = Math.floor(total * timePct + 1e-9);
  let pace: Pace;
  if (s.status === 'done') pace = 'done';
  else if (s.status === 'dropped') pace = 'dropped';
  else if (total === 0) pace = 'no-milestones';
  else if (done === total) pace = 'done';
  else if (today < s.start) pace = 'not-started';
  else if (today > s.end) pace = 'overdue';
  else {
    const delta = pct - timePct;
    pace = delta >= 0.15 ? 'ahead' : delta >= -0.2 ? 'on-track' : 'behind';
  }
  return { total, done, pct, totalDays, elapsed, timePct, daysLeft, pace, next, expectedByNow };
}

export const PACE_LABEL: Record<Pace, string> = {
  'not-started': 'chưa bắt đầu',
  ahead: 'nhanh hơn dự kiến',
  'on-track': 'đúng tiến độ',
  behind: 'chậm hơn dự kiến',
  overdue: 'đã quá hạn',
  done: 'đã xong',
  dropped: 'đã dừng',
  'no-milestones': 'chưa có mốc',
};

/** The active sprint of a track: the latest-started sprint with status 'active'. */
export function activeSprint(sprints: Sprint[], trackId: string): Sprint | undefined {
  return sprints
    .filter((s) => s.trackId === trackId && s.status === 'active')
    .sort((a, b) => (a.start < b.start ? 1 : -1))[0];
}

/** Milestones finished inside [from, to]. */
export function milestonesDoneBetween(s: Sprint, from: Day, to: Day): Milestone[] {
  return s.milestones.filter((m) => m.done && m.doneOn && m.doneOn >= from && m.doneOn <= to);
}
