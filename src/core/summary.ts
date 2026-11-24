// Weekly review: a plain-text summary meant to be pasted to a reviewer (a person or a bot).
import { addDays, fmtDay, weekStart as mondayOf } from './dates.js';
import { fmtMinutes } from './format.js';
import { currentlyPaused, isPaused, makeCtx, weekResult, type WeekResult } from './rhythm.js';
import { activeSprint, milestonesDoneBetween, PACE_LABEL, sprintProgress } from './sprint.js';
import type { Day, DayMark, LogEntry, Sprint, Track, WeekReview } from './types.js';

export interface TrackWeek {
  track: Track;
  paused: boolean;
  week: WeekResult;
  minutes: number;
  full: number;
  tiny: number;
  milestones: string[];
  evidence: string[];
  blockers: string[];
  sprintLine?: string;
  nextStep?: string;
}

export interface WeekSummary {
  weekStart: Day;
  weekEnd: Day;
  tracks: TrackWeek[];
  totalMinutes: number;
  activeDays: number; // distinct days with any log
  text: string;
}

export interface SummaryInput {
  weekStart: Day;
  today: Day;
  tracks: Track[];
  sprints: Sprint[];
  logs: LogEntry[];
  marks: DayMark[];
  review?: WeekReview;
}

export const REVIEW_PROMPT =
  'Nhờ bạn đọc tóm tắt tuần học dưới đây và nhận xét ngắn: tuần này tôi học có đều không, vướng mắc nào nên gỡ trước, và bước cho tuần sau đã đủ nhỏ và cụ thể chưa.';

export function buildWeekSummary(input: SummaryInput): WeekSummary {
  const from = mondayOf(input.weekStart);
  const to = addDays(from, 6);
  const out: TrackWeek[] = [];
  const allDays = new Set<Day>();
  let totalMinutes = 0;
  for (const track of input.tracks) {
    if (track.archived) continue;
    const logs = input.logs.filter((l) => l.trackId === track.id && l.day >= from && l.day <= to && l.day <= input.today);
    const pausedAllWeek = isPaused(track, from) && isPaused(track, to <= input.today ? to : input.today);
    if (track.createdAt > to && !logs.length) continue;
    const ctx = makeCtx({ track, logs: input.logs, marks: input.marks }, input.today);
    const week = weekResult(ctx, from);
    const minutes = logs.reduce((a, l) => a + (l.minutes || 0), 0);
    totalMinutes += minutes;
    logs.forEach((l) => allDays.add(l.day));
    const sprint = activeSprint(input.sprints, track.id) ?? input.sprints.find((s) => s.trackId === track.id && s.closedOn && s.closedOn >= from && s.closedOn <= to);
    const milestones: string[] = [];
    let sprintLine: string | undefined;
    let nextStep: string | undefined;
    for (const s of input.sprints.filter((x) => x.trackId === track.id)) milestones.push(...milestonesDoneBetween(s, from, to).map((m) => m.text));
    if (sprint) {
      const p = sprintProgress(sprint, input.today);
      sprintLine = `Sprint "${sprint.title}": ${p.done}/${p.total} milestone, ${sprint.status === 'active' ? `còn ${p.daysLeft} ngày, ` : ''}${PACE_LABEL[p.pace]}`;
      if (p.next) nextStep = p.next.text;
    }
    if (track.nextStep) nextStep = track.nextStep + (nextStep && nextStep !== track.nextStep ? ` (milestone tiếp: ${nextStep})` : '');
    const evidence: string[] = [];
    const blockers: string[] = [];
    for (const l of logs.sort((a, b) => (a.day < b.day ? -1 : 1))) {
      for (const e of l.evidence) {
        if (e.kind === 'link') evidence.push(`${fmtDay(l.day)}: ${e.label ? e.label + ' - ' : ''}${e.value}`);
        else if (e.kind === 'note') evidence.push(`${fmtDay(l.day)}: ${e.value}`);
        else evidence.push(`${fmtDay(l.day)}: ảnh${e.label ? ' "' + e.label + '"' : ''} (lưu trong app)`);
      }
      if (l.blocker.trim()) blockers.push(`${fmtDay(l.day)}: ${l.blocker.trim()}`);
    }
    out.push({
      track,
      paused: currentlyPaused(track, input.today) || pausedAllWeek,
      week,
      minutes,
      full: logs.filter((l) => l.kind === 'full').length,
      tiny: logs.filter((l) => l.kind === 'tiny').length,
      milestones,
      evidence,
      blockers,
      sprintLine,
      nextStep,
    });
  }
  const summary: WeekSummary = { weekStart: from, weekEnd: to, tracks: out, totalMinutes, activeDays: allDays.size, text: '' };
  summary.text = renderText(summary, input);
  return summary;
}

function weekLine(t: TrackWeek, today: Day): string {
  const w = t.week;
  if (t.paused && w.done === 0) return 'tạm dừng';
  if (w.state === 'paused') return `${w.done} ngày (tuần nghỉ)`;
  const base = `${w.done}/${w.target} ngày mục tiêu`;
  if (w.state === 'met') return `${base}, đạt`;
  if (w.state === 'missed') return `${base}, chưa đạt`;
  return `${base}, tuần đang diễn ra${w.reachable && w.weekStart <= today ? ', vẫn kịp' : ''}`;
}

function renderText(s: WeekSummary, input: SummaryInput): string {
  const year = s.weekEnd.slice(0, 4);
  const lines: string[] = [];
  lines.push(REVIEW_PROMPT, '');
  lines.push(`Tóm tắt tuần ${fmtDay(s.weekStart)} - ${fmtDay(s.weekEnd)}/${year}`);
  lines.push(`Tổng: ${s.activeDays} ngày có học, ${fmtMinutes(s.totalMinutes)}.`);
  for (const t of s.tracks) {
    lines.push('', `## ${t.track.name}: ${weekLine(t, input.today)}`);
    if (t.paused && t.week.done === 0) {
      if (t.track.nextStep) lines.push(`- Việc nhỏ nhất khi quay lại: ${t.track.nextStep}`);
      continue;
    }
    lines.push(`- Thời gian: ${fmtMinutes(t.minutes)}; ${t.full} buổi học đầy đủ, ${t.tiny} lần học ngắn`);
    if (t.sprintLine) lines.push(`- ${t.sprintLine}`);
    if (t.milestones.length) lines.push(`- Milestone xong trong tuần: ${t.milestones.join('; ')}`);
    if (t.evidence.length) {
      lines.push('- Thành quả:');
      t.evidence.forEach((e) => lines.push(`  - ${e}`));
    }
    if (t.blockers.length) {
      lines.push('- Vướng:');
      t.blockers.forEach((b) => lines.push(`  - ${b}`));
    }
    if (t.nextStep) lines.push(`- Bước tiếp theo: ${t.nextStep}`);
  }
  const r = input.review;
  if (r && (r.wins.trim() || r.blockers.trim() || r.next.trim())) {
    lines.push('', '## Tự nhận xét');
    if (r.wins.trim()) lines.push(`- Làm được: ${r.wins.trim()}`);
    if (r.blockers.trim()) lines.push(`- Vướng: ${r.blockers.trim()}`);
    if (r.next.trim()) lines.push(`- Tuần sau: ${r.next.trim()}`);
  }
  return lines.join('\n');
}
