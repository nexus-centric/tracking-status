import { addDays, diffDays, fmtDay, today, weekStart, weekday } from '../core/dates.js';
import { fmtMinutes } from '../core/format.js';
import { busyUsed, currentlyPaused, daysSinceLastLog, momentum, todayState } from '../core/rhythm.js';
import { reentry } from '../core/reentry.js';
import { activeSprint, sprintProgress } from '../core/sprint.js';
import type { Track } from '../core/types.js';
import { ctxFor, hasDemo, state } from '../state.js';
import { esc } from '../ui.js';
import { colorDot, dots7, sprintBar, sprintMeta, weekBar } from './parts.js';

const WD_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

export function demoBanner(): string {
  if (!hasDemo()) return '';
  return `<div class="banner"><span><b>Đang xem dữ liệu mẫu.</b> Ba việc học mẫu để thử app; dữ liệu của bạn (nếu có) vẫn giữ nguyên.</span><button class="btn small ghost" data-act="remove-demo">Xoá dữ liệu mẫu</button></div>`;
}

export function todayView(): string {
  const d = today();
  const active = state.tracks.filter((t) => !t.archived && !currentlyPaused(t, d));
  const paused = state.tracks.filter((t) => !t.archived && currentlyPaused(t, d));
  const mon = weekStart(d);
  const weekLogs = state.logs.filter((l) => l.day >= mon && l.day <= d && state.tracks.some((t) => t.id === l.trackId && !t.archived));
  const weekDays = new Set(weekLogs.map((l) => l.day)).size;
  const weekMin = weekLogs.reduce((a, l) => a + l.minutes, 0);
  const states = active.map((t) => todayState(ctxFor(t)));
  const doneToday = states.filter((s) => s === 'done').length;
  const needed = states.filter((s) => s !== 'done' && s !== 'rest').length;

  if (!state.tracks.filter((t) => !t.archived).length) return emptyView();

  return `${demoBanner()}
  <section class="hello">
    <div>
      <p class="eyebrow">${WD_LONG[weekday(d)]}, ${fmtDay(d)}</p>
      <h1>${headline(active.length, doneToday, needed)}</h1>
      <p class="muted">Tuần này: ${weekDays} ngày có học · ${fmtMinutes(weekMin)}</p>
    </div>
    <a class="btn ghost" href="#/new">Thêm việc học</a>
  </section>
  <section class="cards">${active.map(card).join('')}</section>
  ${paused.length ? `<section><h2 class="sec-title">Đang tạm dừng</h2><div class="cards">${paused.map(pausedCard).join('')}</div></section>` : ''}`;
}

function headline(total: number, done: number, needed: number): string {
  if (!total) return 'Mọi việc đang tạm dừng';
  if (!needed) return done ? 'Hôm nay đã đủ nhịp' : 'Hôm nay là ngày nghỉ';
  if (done) return `Đã ghi ${done} việc, còn ${needed} việc chờ một bước nhỏ`;
  return needed === 1 ? 'Hôm nay chỉ cần một bước nhỏ' : `Hôm nay có ${needed} việc, mỗi việc một bước nhỏ là đủ`;
}

function emptyView(): string {
  return `<section class="empty">
    <h1>Giữ nhịp học, kể cả những ngày bận</h1>
    <p>Mỗi việc học có một đợt 2-4 tuần với sản phẩm cụ thể ở cuối. Mỗi ngày chỉ cần một bước nhỏ là tính. Ngày nghỉ và ngày bận không làm mất nhịp, lỡ một ngày thì hôm sau làm tiếp là được.</p>
    <div class="row gap wrap"><a class="btn primary" href="#/new">Thêm việc học đầu tiên</a><button class="btn ghost" data-act="load-demo">Xem dữ liệu mẫu</button></div>
    <div class="how">
      <div class="card"><b>Bước nhỏ mỗi ngày</b><p>Đặt trước phiên bản nhỏ nhất, ví dụ đọc docs 10 phút. Ngày mệt chỉ cần làm đúng bước đó.</p></div>
      <div class="card"><b>Đợt 2-4 tuần</b><p>Mỗi đợt kết thúc bằng một thứ làm ra được: repo, video, bản ghi. Tiến độ đo bằng mốc, không chỉ bằng giờ.</p></div>
      <div class="card"><b>Nhìn lại cuối tuần</b><p>App tự gom việc đã làm, chỗ vướng và bước tiếp theo thành bản tóm tắt để gửi nhận xét.</p></div>
    </div>
  </section>`;
}

function stateLine(t: Track): string {
  const ctx = ctxFor(t);
  const st = todayState(ctx);
  const todayLogs = state.logs.filter((l) => l.trackId === t.id && l.day === ctx.today);
  switch (st) {
    case 'done': {
      const min = todayLogs.reduce((a, l) => a + l.minutes, 0);
      const note = todayLogs.map((l) => l.note).filter(Boolean)[0];
      return `<p class="state ok">Hôm nay đã ghi${min ? ` ${fmtMinutes(min)}` : ' một bước nhỏ'}${note ? `: ${esc(note)}` : '.'}</p>`;
    }
    case 'rest':
      return `<p class="state rest">Hôm nay là ngày nghỉ${ctx.marks.get(ctx.today) === 'busy' ? ' (đã đánh dấu bận)' : ''}. Nếu vẫn muốn làm, phiên hôm nay được tính thêm.</p>`;
    case 'recover':
      return `<p class="state warn">Hôm qua lỡ một ngày. Một bước nhỏ hôm nay là đủ để không lỡ hai ngày liền: <b>${esc(t.tinyAction || 'làm 10 phút')}</b></p>`;
    case 'restart': {
      const r = reentry(t, state.sprints, state.logs, ctx.today);
      const days = daysSinceLastLog(ctx);
      return `<p class="state warn">${days !== null ? `Đã ${days} ngày chưa ghi.` : 'Chưa có buổi nào.'} Không cần bù, bắt đầu lại bằng bước nhỏ nhất: <b>${esc(r.step)}</b></p>`;
    }
    default:
      return `<p class="state">Bước nhỏ hôm nay: <b>${esc(t.tinyAction || 'làm 10 phút')}</b></p>`;
  }
}

function card(t: Track): string {
  const ctx = ctxFor(t);
  const st = todayState(ctx);
  const score = momentum(ctx);
  const s = activeSprint(state.sprints, t.id);
  const p = s ? sprintProgress(s, ctx.today) : null;
  const busyMarked = ctx.marks.get(ctx.today) === 'busy';
  const busyLeft = state.settings.busyPerMonth - busyUsed(state.marks, t.id, ctx.today);
  const primary =
    st === 'done'
      ? `<button class="btn" data-act="log" data-id="${t.id}">Ghi thêm</button>`
      : `<button class="btn primary" data-act="tiny" data-id="${t.id}">Xong bước nhỏ</button><button class="btn" data-act="log" data-id="${t.id}">Ghi phiên học</button>`;
  const busyBtn =
    st === 'done' || (st === 'rest' && !busyMarked)
      ? ''
      : busyMarked
        ? `<button class="btn ghost small" data-act="unbusy" data-id="${t.id}">Bỏ đánh dấu bận</button>`
        : `<button class="btn ghost small" data-act="busy" data-id="${t.id}" ${busyLeft <= 0 ? 'disabled' : ''} title="Không tính là lỡ. Còn ${Math.max(0, busyLeft)} lần trong tháng.">Hôm nay bận (còn ${Math.max(0, busyLeft)})</button>`;
  return `<article class="card track" style="--c:${esc(t.color)}">
    <header class="card-head">
      <a class="track-name" href="#/t/${t.id}">${colorDot(t)}${esc(t.name)}</a>
      <span class="score" title="Điểm nhịp 0-100: tăng dần khi học đều, ngày nghỉ và ngày bận không làm giảm">Nhịp <b>${score}</b></span>
    </header>
    ${stateLine(t)}
    <div class="actions">${primary}${busyBtn}</div>
    <div class="rhythm">${dots7(ctx)}${weekBar(ctx)}</div>
    ${
      s && p
        ? `<div class="sprint-mini">
        <div class="row between"><a href="#/t/${t.id}" class="sprint-title">${esc(s.title)}</a><span class="small">${sprintMeta(s, ctx.today)}</span></div>
        ${sprintBar(s, ctx.today)}
        ${p.next ? `<label class="next-ms"><input type="checkbox" data-act="ms" data-sprint="${s.id}" data-ms="${p.next.id}"> <span>Mốc tiếp: ${esc(p.next.text)}</span></label>` : `<p class="small muted">Đã xong mọi mốc. <a href="#/t/${t.id}">Kết thúc đợt</a></p>`}
      </div>`
        : `<p class="small muted">Chưa có đợt học. <a href="#/t/${t.id}?new-sprint=1">Đặt một đợt 2-4 tuần</a> để có đích cụ thể.</p>`
    }
    ${t.plan ? `<p class="plan small">${esc(t.plan)}</p>` : ''}
  </article>`;
}

function pausedCard(t: Track): string {
  const d = today();
  const r = reentry(t, state.sprints, state.logs, d);
  const pause = t.pauses.find((p) => p.from <= d && (p.to === undefined || p.to >= d))!;
  const away = diffDays(d, pause.from);
  return `<article class="card paused" style="--c:${esc(t.color)}">
    <header class="card-head"><a class="track-name" href="#/t/${t.id}">${colorDot(t)}${esc(t.name)}</a><span class="muted small">tạm dừng ${away ? `${away} ngày` : 'từ hôm nay'}</span></header>
    ${pause.note ? `<p class="small muted">Lý do: ${esc(pause.note)}</p>` : ''}
    ${r.lastNote ? `<p class="small">Lần cuối (${fmtDay(r.lastDay!)}): ${esc(r.lastNote)}</p>` : ''}
    <p class="state">Khi quay lại, bước nhỏ nhất là: <b>${esc(r.step)}</b></p>
    <p class="small muted">Gợi ý: tuần đầu chỉ cần ${r.lighterTarget} ngày, không cần bù phần đã nghỉ.</p>
    ${pause.to ? `<p class="state ok">Đã hẹn quay lại ${WD_LONG[weekday(addDays(pause.to, 1))].toLowerCase()} ${fmtDay(addDays(pause.to, 1))}.</p>` : ''}
    <div class="actions">
      <button class="btn primary" data-act="resume" data-id="${t.id}">Quay lại hôm nay</button>
      ${r.isMonday || pause.to ? '' : `<button class="btn" data-act="resume-on" data-id="${t.id}" data-day="${r.nextMonday}">Hẹn thứ Hai ${fmtDay(r.nextMonday)}</button>`}
    </div>
  </article>`;
}
