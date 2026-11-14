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

export function dots7(ctx: Ctx): string {
  const r = last7(ctx);
  return `<div class="dots7" aria-label="7 ngày qua: ${r.done} ngày có học">${r.days
    .map((d) => `<div class="dot-col"><span class="dot s-${d.status}" title="${esc(fmtDay(d.day, true))}: ${STATUS_LABEL[d.status]}"></span><span class="dot-lbl">${d.day === ctx.today ? 'Nay' : weekdayShort(weekday(d.day))}</span></div>`)
    .join('')}</div>`;
}

export function weekBar(ctx: Ctx): string {
  const w = weekResult(ctx, weekStart(ctx.today));
  if (w.state === 'paused') return `<div class="weekbar muted">Tuần này đang nghỉ</div>`;
  const segs = Array.from({ length: Math.max(w.target, w.done) }, (_, i) => `<span class="seg ${i < w.done ? 'on' : ''}"></span>`).join('');
  let note = '';
  if (w.state === 'met') note = w.done > w.target ? `vượt ${w.done - w.target} ngày` : 'đã đạt';
  else if (w.reachable) note = `còn ${w.target - w.done} ngày nữa`;
  else note = 'tuần này hơi hụt, không sao';
  return `<div class="weekbar"><div class="segs" style="--n:${Math.max(w.target, w.done)}">${segs}</div><span class="wb-text">Tuần này <b>${w.done}/${w.target}</b> ngày · ${note}</span></div>`;
}

export function sprintBar(s: Sprint, today: Day): string {
  const p = sprintProgress(s, today);
  return `<div class="sbar" role="img" aria-label="${p.done}/${p.total} mốc, đã qua ${Math.round(p.timePct * 100)}% thời gian">
    <div class="sbar-fill" style="width:${(p.pct * 100).toFixed(1)}%"></div>
    ${s.status === 'active' ? `<div class="sbar-time" style="left:${(p.timePct * 100).toFixed(1)}%" title="Hôm nay"></div>` : ''}
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
  const months: string[] = [];
  let lastMonth = '';
  for (const col of cols) {
    const m = col[0].day.slice(5, 7);
    months.push(m !== lastMonth ? `T${Number(m)}` : '');
    lastMonth = m;
  }
  return `<div class="heat-wrap"><div class="heat" style="--w:${weeks}">
    <div class="heat-days"><span>T2</span><span></span><span>T4</span><span></span><span>T6</span><span></span><span>CN</span></div>
    ${cols
      .map(
        (col, i) => `<div class="heat-col"><span class="heat-m">${months[i]}</span>${col
          .map((c) => `<span class="cell s-${c.status}${c.status === 'done' ? ' l' + lvl(c.minutes) : ''}" title="${esc(fmtDay(c.day, true))}: ${STATUS_LABEL[c.status]}${c.minutes ? ', ' + fmtMinutes(c.minutes) : ''}"></span>`)
          .join('')}</div>`,
      )
      .join('')}
  </div>
  <div class="legend"><span><i class="cell s-done l1"></i>bước nhỏ</span><span><i class="cell s-done l3"></i>phiên dài</span><span><i class="cell s-rest"></i>nghỉ</span><span><i class="cell s-busy"></i>bận</span><span><i class="cell s-paused"></i>tạm dừng</span><span><i class="cell s-miss"></i>chưa học</span></div></div>`;
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
