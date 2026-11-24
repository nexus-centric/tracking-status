import { APP_NAME } from '../core/brand.js';
import { addDays, diffDays, fmtDay, today, weekStart, weekday } from '../core/dates.js';
import { fmtMinutes } from '../core/format.js';
import { busyUsed, currentlyPaused, daysSinceLastLog, momentum, todayState } from '../core/rhythm.js';
import { reentry } from '../core/reentry.js';
import { activeSprint, sprintProgress } from '../core/sprint.js';
import type { Track } from '../core/types.js';
import { ctxFor, itemsOf, state } from '../state.js';
import { costPrefs, roadmapProgress } from '../core/roadmap.js';
import { roadmapLine } from './roadmap.js';
import { esc } from '../ui.js';
import { colorDot, dots7, heroFlow, scoreRing, sprintBar, sprintMeta, weekBar } from './parts.js';
import { backupBanner, sessionStrip } from './today-extra.js';
import { emptyMark, icoCheck, icoTimer } from '../icons.js';

const WD_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

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

  const rings = active.map((t) => {
    const ctx = ctxFor(t);
    return `<a class="hello-ring" href="#/t/${t.id}" style="--c:${esc(t.color)}" title="${esc(t.name)}">${scoreRing(momentum(ctx))}<span class="hr-name">${esc(shortName(t.name))}</span></a>`;
  }).join('');

  return `${backupBanner()}
  <section class="hello">
    ${heroFlow()}
    <div class="hello-main">
      <p class="eyebrow">${WD_LONG[weekday(d)]}, ${fmtDay(d)}</p>
      <h1>${headline(active.length, doneToday, needed)}</h1>
      <p class="muted">Tuần này bạn đã học ${weekDays} ngày, tổng cộng ${fmtMinutes(weekMin)}.</p>
    </div>
    <div class="hello-side">
      ${active.length ? `<div class="hello-overview">${rings}</div>` : ''}
      <a class="btn ghost" href="#/new">Thêm topic học mới</a>
    </div>
  </section>
  ${sessionStrip()}
  <section class="cards">${active.map(card).join('')}</section>
  ${paused.length ? `<section><h2 class="sec-title">Topic đang tạm dừng</h2><div class="cards">${paused.map((t, i) => pausedCard(t, i + active.length)).join('')}</div></section>` : ''}`;
}

function shortName(name: string): string {
  const head = name.split(':')[0].trim();
  return head.length <= 16 ? head : `${head.slice(0, 15)}…`;
}

function headline(total: number, done: number, needed: number): string {
  if (!total) return 'Mọi topic đang tạm dừng';
  if (!needed) return done ? 'Hôm nay bạn đã hoàn thành phần việc của mình' : 'Hôm nay là ngày nghỉ, cứ thong thả';
  if (done) return `Đã xong ${done} topic, còn ${needed} topic chỉ cần học một chút nữa`;
  return needed === 1 ? 'Hôm nay chỉ cần học một chút là đủ' : `Hôm nay có ${needed} topic, mỗi topic chỉ cần học một chút là đủ`;
}

function emptyView(): string {
  return `<section class="empty">
    ${emptyMark}
    <p class="eyebrow">${esc(APP_NAME)}</p>
    <h1>Học đều đặn mỗi ngày, kể cả những hôm bận rộn</h1>
    <p>Mỗi topic đi theo từng sprint 2 đến 4 tuần, cuối sprint có một sản phẩm cụ thể. Ngày nào cũng chỉ cần học một chút là được tính. Ngày nghỉ và ngày bận không làm đứt chuỗi ngày học; lỡ một hôm thì hôm sau làm tiếp là được.</p>
    <div class="row gap wrap"><a class="btn primary" href="#/new">Thêm topic học đầu tiên</a><button class="btn ghost" data-act="load-demo">Xem thử với dữ liệu mẫu</button></div>
    <div class="how">
      <div class="card" style="--i:0"><b>Học một chút mỗi ngày</b><p>Đặt trước việc nhỏ nhất bạn vẫn tính là đã học, ví dụ đọc tài liệu 10 phút. Hôm nào mệt, chỉ cần làm đúng việc đó.</p></div>
      <div class="card" style="--i:1"><b>Sprint 2 đến 4 tuần</b><p>Mỗi sprint kết thúc bằng một thứ làm ra được: một repo, một video, một bản ghi âm. Tiến độ đo bằng các milestone, không chỉ bằng số giờ.</p></div>
      <div class="card" style="--i:2"><b>Đồng hồ và nhìn lại tuần</b><p>Bấm giờ từng buổi học bằng Pomodoro hoặc đếm ngược. Cuối tuần, app gom những gì đã làm thành bản tóm tắt để bạn xin góp ý.</p></div>
    </div>
  </section>`;
}

function stateLine(t: Track): string {
  const ctx = ctxFor(t);
  const st = todayState(ctx);
  const todayLogs = state.logs.filter((l) => l.trackId === t.id && l.day === ctx.today).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  switch (st) {
    case 'done': {
      const min = todayLogs.reduce((a, l) => a + l.minutes, 0);
      const note = todayLogs.map((l) => l.note).filter(Boolean)[0];
      return `<p class="state ok">Hôm nay bạn đã ghi${min ? ` ${fmtMinutes(min)}` : ' một lần học ngắn'}${note ? `: ${esc(note)}` : '.'}</p>`;
    }
    case 'rest':
      return `<p class="state rest">Hôm nay là ngày nghỉ${ctx.marks.get(ctx.today) === 'busy' ? ' (bạn đã đánh dấu bận)' : ''}. Nếu vẫn muốn học, buổi hôm nay được tính thêm.</p>`;
    case 'recover':
      return `<p class="state warn">Hôm qua bạn chưa học. Chỉ cần học một chút hôm nay là chuỗi ngày học vẫn liền mạch: <b>${esc(t.tinyAction || 'học 10 phút')}</b></p>`;
    case 'restart': {
      const r = reentry(t, state.sprints, state.logs, ctx.today);
      const days = daysSinceLastLog(ctx);
      return `<p class="state warn">${days !== null ? `Đã ${days} ngày bạn chưa ghi buổi học nào.` : 'Bạn chưa ghi buổi học nào.'} Không cần học bù, hãy bắt đầu lại bằng việc nhỏ nhất: <b>${esc(r.step)}</b></p>`;
    }
    default:
      return `<p class="state">Hôm nay chỉ cần học một chút: <b>${esc(t.tinyAction || 'học 10 phút')}</b></p>`;
  }
}

function card(t: Track, index = 0): string {
  const ctx = ctxFor(t);
  const st = todayState(ctx);
  const score = momentum(ctx);
  const s = activeSprint(state.sprints, t.id);
  const p = s ? sprintProgress(s, ctx.today) : null;
  const busyMarked = ctx.marks.get(ctx.today) === 'busy';
  const busyLeft = state.settings.busyPerMonth - busyUsed(state.marks, t.id, ctx.today);
  const primary =
    st === 'done'
      ? `<button class="btn" data-act="log" data-id="${t.id}">Ghi thêm buổi học</button><button class="btn ghost" data-tm="quick-start" data-id="${t.id}">${icoTimer} Bấm giờ</button>`
      : `<button class="btn primary" data-act="tiny" data-id="${t.id}">${icoCheck} Đã học một chút</button><button class="btn" data-tm="quick-start" data-id="${t.id}">${icoTimer} Bấm giờ học</button><button class="btn ghost" data-act="log" data-id="${t.id}">Ghi buổi học</button>`;
  const busyBtn =
    st === 'done' || (st === 'rest' && !busyMarked)
      ? ''
      : busyMarked
        ? `<button class="btn ghost small" data-act="unbusy" data-id="${t.id}">Bỏ đánh dấu ngày bận</button>`
        : `<button class="btn ghost small" data-act="busy" data-id="${t.id}" ${busyLeft <= 0 ? 'disabled' : ''} title="Ngày bận không làm đứt chuỗi ngày học. Tháng này còn ${Math.max(0, busyLeft)} lần.">Hôm nay bận (còn ${Math.max(0, busyLeft)} lần)</button>`;
  return `<article class="card track" data-track="${t.id}" style="--c:${esc(t.color)};--i:${index}">
    <header class="card-head">
      <a class="track-name" href="#/t/${t.id}">${colorDot(t)}${esc(t.name)}</a>
      ${scoreRing(score)}
    </header>
    ${stateLine(t)}
    <div class="actions">${primary}${busyBtn}</div>
    <div class="rhythm">${dots7(ctx)}${weekBar(ctx)}</div>
    ${
      s && p
        ? `<div class="sprint-mini">
        <div class="row between"><a href="#/t/${t.id}" class="sprint-title">${esc(s.title)}</a><span class="small">${sprintMeta(s, ctx.today)}</span></div>
        ${sprintBar(s, ctx.today)}
        ${p.next ? `<label class="next-ms"><input type="checkbox" data-act="ms" data-sprint="${s.id}" data-ms="${p.next.id}"> <span>Milestone tiếp theo: ${esc(p.next.text)}</span></label>` : `<p class="small muted">Bạn đã xong mọi milestone của sprint này. <a href="#/t/${t.id}">Kết thúc sprint</a></p>`}
      </div>`
        : state.sprints.some((x) => x.trackId === t.id && x.status === 'planned')
          ? `<p class="small muted">Sprint kế tiếp trong kế hoạch đang chờ. <a href="#/t/${t.id}">Bắt đầu sprint</a></p>`
          : `<p class="small muted">Topic này chưa có sprint. <a href="#/t/${t.id}?new-sprint=1">Đặt một sprint 2 đến 4 tuần</a> để có đích đến cụ thể.</p>`
    }
    ${roadmapMini(t)}
    ${t.plan ? `<p class="plan small">${esc(t.plan)}</p>` : ''}
  </article>`;
}

function roadmapMini(t: Track): string {
  const items = itemsOf(t.id);
  if (!items.length) return '';
  const prog = roadmapProgress(items, costPrefs(t));
  return `<a class="rm-mini" href="#/t/${t.id}/roadmap"><span class="small muted">Lộ trình</span>${roadmapLine(prog, t.color)}<span class="small mono">${prog.done}/${prog.total} · ${Math.round(prog.pct * 100)}%</span></a>`;
}

function pausedCard(t: Track, index = 0): string {
  const d = today();
  const r = reentry(t, state.sprints, state.logs, d);
  const pause = t.pauses.find((p) => p.from <= d && (p.to === undefined || p.to >= d))!;
  const away = diffDays(d, pause.from);
  return `<article class="card paused" data-track="${t.id}" style="--c:${esc(t.color)};--i:${index}">
    <header class="card-head"><a class="track-name" href="#/t/${t.id}">${colorDot(t)}${esc(t.name)}</a><span class="muted small">đã tạm dừng ${away ? `${away} ngày` : 'từ hôm nay'}</span></header>
    ${pause.note ? `<p class="small muted">Lý do: ${esc(pause.note)}</p>` : ''}
    ${r.lastNote ? `<p class="small">Buổi gần nhất (${fmtDay(r.lastDay!)}): ${esc(r.lastNote)}</p>` : ''}
    <p class="state">Khi quay lại, việc nhỏ nhất để bắt đầu là: <b>${esc(r.step)}</b></p>
    <p class="small muted">Gợi ý: tuần đầu tiên chỉ cần học ${r.lighterTarget} ngày, không cần bù phần đã nghỉ.</p>
    ${pause.to ? `<p class="state ok">Bạn đã hẹn quay lại vào ${WD_LONG[weekday(addDays(pause.to, 1))].toLowerCase()} ${fmtDay(addDays(pause.to, 1))}.</p>` : ''}
    <div class="actions">
      <button class="btn primary" data-act="resume" data-id="${t.id}">Học lại từ hôm nay</button>
      ${r.isMonday || pause.to ? '' : `<button class="btn" data-act="resume-on" data-id="${t.id}" data-day="${r.nextMonday}">Hẹn bắt đầu thứ Hai ${fmtDay(r.nextMonday)}</button>`}
    </div>
  </article>`;
}
