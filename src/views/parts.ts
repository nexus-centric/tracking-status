// Shared view fragments.
import { addDays, fmtDay, weekStart, weekday, weekdayShort } from '../core/dates.js';
import { heatmap, last7, weekResult, type Ctx, type DayStatus } from '../core/rhythm.js';
import { PACE_LABEL, sprintProgress } from '../core/sprint.js';
import type { Day, Sprint, Track } from '../core/types.js';
import { fmtMinutes } from '../core/format.js';
import { esc } from '../ui.js';

export const STATUS_LABEL: Record<DayStatus, string> = {
  done: 'có học',
  rest: 'ngày nghỉ',
  busy: 'ngày bận, không tính lỡ',
  paused: 'đang tạm dừng',
  miss: 'chưa học',
  open: 'hôm nay, chưa ghi',
  future: 'chưa tới',
  before: 'trước khi bắt đầu',
};

export function scoreRing(score: number, label = 'điểm'): string {
  const p = Math.max(0, Math.min(100, Math.round(score)));
  return `<span class="score-ring" title="Độ đều đặn (0-100): tăng dần khi bạn học đều; ngày nghỉ và ngày bận không làm giảm điểm">
    <svg class="ring" viewBox="0 0 36 36" aria-hidden="true">
      <circle class="ring-bg" cx="18" cy="18" r="15.15" fill="none" stroke-width="2.7"/>
      <circle class="ring-fg" cx="18" cy="18" r="15.15" fill="none" stroke-width="2.7" pathLength="100" stroke-dasharray="${p} 100" transform="rotate(-90 18 18)"/>
    </svg>
    <span class="score-num"><b data-count="${p}">${p}</b><span class="score-lbl">${label}</span></span>
  </span>`;
}

const CHAIN_KEEP = new Set<DayStatus>(['done', 'rest', 'busy', 'paused']);

/** Last 7 days as a chain of nodes. A link glows (and carries a moving beam) when the chain is unbroken. */
export function dots7(ctx: Ctx): string {
  const r = last7(ctx);
  const parts: string[] = [];
  r.days.forEach((d, i) => {
    if (i > 0) {
      const prev = r.days[i - 1].status;
      const on = CHAIN_KEEP.has(prev) && CHAIN_KEEP.has(d.status) && (prev === 'done' || d.status === 'done');
      parts.push(`<span class="link${on ? ' on' : ''}" style="--k:${i}" aria-hidden="true"><i></i></span>`);
    }
    parts.push(`<div class="dot-col"><span class="dot s-${d.status}" ${d.day === ctx.today ? 'data-today="1"' : ''} title="${esc(fmtDay(d.day, true))}: ${STATUS_LABEL[d.status]}"></span><span class="dot-lbl">${d.day === ctx.today ? 'Nay' : weekdayShort(weekday(d.day))}</span></div>`);
  });
  return `<div class="dots7" role="img" aria-label="7 ngày qua: ${r.done} ngày có học">${parts.join('')}</div>`;
}

export function weekBar(ctx: Ctx): string {
  const w = weekResult(ctx, weekStart(ctx.today));
  if (w.state === 'paused') return `<div class="weekbar muted">Tuần này việc học đang tạm dừng</div>`;
  const segs = Array.from({ length: Math.max(w.target, w.done) }, (_, i) => `<span class="seg ${i < w.done ? 'on' : ''}"></span>`).join('');
  let note = '';
  if (w.state === 'met') note = w.done > w.target ? `vượt ${w.done - w.target} ngày` : 'đã đạt';
  else if (w.reachable) note = `cần thêm ${w.target - w.done} ngày`;
  else note = 'tuần này hơi hụt, tuần sau làm tiếp';
  return `<div class="weekbar"><div class="segs${w.done ? ' flowing' : ''}" style="--n:${Math.max(w.target, w.done)};--on:${Math.min(w.done, Math.max(w.target, w.done))}">${segs}<i class="segs-beam" aria-hidden="true"></i></div><span class="wb-text">Tuần này đã học <b>${w.done}/${w.target}</b> ngày · ${note}</span></div>`;
}

export function sprintBar(s: Sprint, today: Day): string {
  const p = sprintProgress(s, today);
  return `<div class="sbar" role="img" aria-label="${p.done}/${p.total} mốc, đã qua ${Math.round(p.timePct * 100)}% thời gian">
    <div class="sbar-fill" style="width:${(p.pct * 100).toFixed(1)}%"><i class="beam" aria-hidden="true"></i></div>
    ${s.status === 'active' ? `<div class="sbar-time" style="left:${(p.timePct * 100).toFixed(1)}%" title="Hôm nay, theo lịch của đợt học"></div>` : ''}
  </div>`;
}

export function sprintMeta(s: Sprint, today: Day): string {
  const p = sprintProgress(s, today);
  const left = s.status === 'active' && p.pace !== 'overdue' ? ` · còn ${p.daysLeft} ngày` : '';
  return `<span class="pace p-${p.pace}">${PACE_LABEL[p.pace]}</span> <span class="muted">${p.done}/${p.total} mốc${left}</span>`;
}

export function heat(ctx: Ctx, weeks: number): string {
  const cols = heatmap(ctx, weeks);
  const lvl = (m: number) => (m >= 60 ? 3 : m >= 25 ? 2 : 1);
  // Label a column only when the 1st of a month falls inside it, so labels never collide.
  const months = cols.map((col) => {
    const first = col.find((c) => c.day.endsWith('-01'));
    return first ? `T${Number(first.day.slice(5, 7))}` : '';
  });
  return `<div class="heat-wrap"><div class="heat" style="--w:${weeks}">
    <div class="heat-days"><span></span><span>T2</span><span></span><span>T4</span><span></span><span>T6</span><span></span><span>CN</span></div>
    ${cols
      .map(
        (col, i) => `<div class="heat-col"><span class="heat-m">${months[i]}</span>${col
          .map((c) => `<span class="cell s-${c.status}${c.status === 'done' ? ' l' + lvl(c.minutes) : ''}" title="${esc(fmtDay(c.day, true))}: ${STATUS_LABEL[c.status]}${c.minutes ? ', ' + fmtMinutes(c.minutes) : ''}"></span>`)
          .join('')}</div>`,
      )
      .join('')}
  </div>
  <div class="legend"><span><i class="cell s-done l1"></i>bước nhỏ</span><span><i class="cell s-done l3"></i>buổi học dài</span><span><i class="cell s-rest"></i>nghỉ</span><span><i class="cell s-busy"></i>bận</span><span><i class="cell s-paused"></i>tạm dừng</span><span><i class="cell s-miss"></i>chưa học</span></div></div>`;
}

export function colorDot(t: Track): string {
  return `<span class="cdot" style="background:${esc(t.color)}"></span>`;
}

export function restDaysText(t: Track): string {
  if (!t.restDays.length) return 'không có ngày nghỉ cố định';
  return 'nghỉ ' + [...t.restDays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(weekdayShort).join(', ');
}

export function weekRangeText(monday: Day): string {
  return `${fmtDay(monday)} - ${fmtDay(addDays(monday, 6))}`;
}

/** Decorative flowing lines behind a page header. Static when the user prefers reduced motion. */
export function heroFlow(): string {
  const paths = [
    'M-20 120 C 160 40, 300 170, 470 90 S 760 20, 980 110',
    'M-20 150 C 200 110, 340 200, 540 130 S 820 90, 980 150',
    'M-20 70 C 140 120, 330 30, 520 70 S 800 150, 980 60',
  ];
  return `<svg class="hero-flow" viewBox="0 0 960 200" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="heroGrad" x1="0" x2="1"><stop offset="0" stop-color="var(--flow-a)" stop-opacity="0"/><stop offset=".35" stop-color="var(--flow-a)"/><stop offset=".7" stop-color="var(--flow-b)"/><stop offset="1" stop-color="var(--flow-c)" stop-opacity="0"/></linearGradient></defs>
    ${paths.map((d, i) => `<path class="hf-base" d="${d}"/><path class="hf-beam" style="--d:${i}" d="${d}" pathLength="100"/>`).join('')}
  </svg>`;
}
