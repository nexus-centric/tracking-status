// Weekly review, evidence log and settings.
import { addDays, fmtDay, today, weekStart } from '../core/dates.js';
import { fmtMinutes } from '../core/format.js';
import { buildWeekSummary } from '../core/summary.js';
import type { WeekReview } from '../core/types.js';
import { exportBundle, hasDemo, saveReview, state } from '../state.js';
import { esc } from '../ui.js';
import { colorDot, weekRangeText } from './parts.js';
import type { View } from './track.js';

export function weekView(params: URLSearchParams): View {
  const d = today();
  const cur = weekStart(d);
  const w = params.get('w');
  const monday = w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? weekStart(w) : cur;
  const review: WeekReview = state.reviews.find((r) => r.weekStart === monday) ?? { weekStart: monday, wins: '', blockers: '', next: '', updatedAt: '' };
  const sum = () => buildWeekSummary({ weekStart: monday, today: d, tracks: state.tracks, sprints: state.sprints, logs: state.logs, marks: state.marks, review });
  const s = sum();
  const label = monday === cur ? 'Tuần này' : monday === addDays(cur, -7) ? 'Tuần trước' : `Tuần ${weekRangeText(monday)}`;
  const stateText: Record<string, string> = { met: 'đạt', missed: 'chưa đạt', 'in-progress': 'đang diễn ra', paused: 'nghỉ', future: '' };
  const html = `<section class="week-head">
    <div><p class="eyebrow">Nhìn lại tuần</p><h1>${label}</h1><p class="muted">${weekRangeText(monday)} · ${s.activeDays} ngày có học · ${fmtMinutes(s.totalMinutes)}</p></div>
    <div class="row gap"><a class="btn ghost small" href="#/week?w=${addDays(monday, -7)}">Tuần trước</a>${monday < cur ? `<a class="btn ghost small" href="#/week?w=${addDays(monday, 7)}">Tuần sau</a>` : ''}</div>
  </section>
  <section class="card">
    <table class="wk-table"><thead><tr><th>Việc học</th><th>Ngày</th><th>Thời gian</th><th>Mốc xong</th></tr></thead><tbody>
    ${s.tracks.map((t) => `<tr><td>${colorDot(t.track)}<a href="#/t/${t.track.id}">${esc(t.track.name)}</a></td><td>${t.paused && !t.week.done ? '<span class="muted">tạm dừng</span>' : `${t.week.done}/${t.week.target} <span class="small muted">${stateText[t.week.state]}</span>`}</td><td>${fmtMinutes(t.minutes)}</td><td>${t.milestones.length}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Chưa có việc học nào trong tuần này.</td></tr>'}
    </tbody></table>
  </section>
  <section class="week-grid">
    <form class="card review-form">
      <h2>Tự nhận xét</h2>
      <label class="field"><span>Làm được gì</span><textarea name="wins" rows="3" placeholder="Kể cả việc nhỏ">${esc(review.wins)}</textarea></label>
      <label class="field"><span>Vướng ở đâu</span><textarea name="blockers" rows="3" placeholder="Điều gì làm chậm, cần hỏi ai">${esc(review.blockers)}</textarea></label>
      <label class="field"><span>Tuần sau làm gì</span><textarea name="next" rows="3" placeholder="Một hai việc cụ thể, đủ nhỏ">${esc(review.next)}</textarea></label>
      <p class="small muted saved-note">Tự lưu khi gõ.</p>
    </form>
    <div class="card summary-card">
      <div class="row between wrap"><h2>Tóm tắt để gửi nhận xét</h2><button class="btn primary small" data-act="copy-summary">Sao chép</button></div>
      <p class="small muted">Dán vào chat với bot hoặc người hướng dẫn để nhận góp ý.</p>
      <pre class="summary">${esc(s.text)}</pre>
    </div>
  </section>`;
  return {
    title: 'Nhìn lại tuần',
    html,
    mount(root) {
      const form = root.querySelector<HTMLFormElement>('.review-form')!;
      const pre = root.querySelector('.summary')!;
      let timer = 0;
      form.addEventListener('input', () => {
        review.wins = (form.elements.namedItem('wins') as HTMLTextAreaElement).value;
        review.blockers = (form.elements.namedItem('blockers') as HTMLTextAreaElement).value;
        review.next = (form.elements.namedItem('next') as HTMLTextAreaElement).value;
        review.updatedAt = new Date().toISOString();
        pre.textContent = sum().text;
        clearTimeout(timer);
        timer = window.setTimeout(() => saveReview({ ...review }, true), 400);
      });
    },
  };
}

export function evidenceView(params: URLSearchParams): View {
  const filter = params.get('t') ?? '';
  const kind = params.get('k') ?? '';
  const tracks = state.tracks.filter((t) => state.logs.some((l) => l.trackId === t.id && l.evidence.length));
  const items = state.logs
    .filter((l) => l.evidence.length && (!filter || l.trackId === filter))
    .sort((a, b) => (a.day === b.day ? (a.createdAt < b.createdAt ? 1 : -1) : a.day < b.day ? 1 : -1))
    .flatMap((l) => l.evidence.filter((e) => !kind || e.kind === kind).map((e) => ({ l, e })));
  const byWeek = new Map<string, typeof items>();
  for (const it of items) {
    const k = weekStart(it.l.day);
    if (!byWeek.has(k)) byWeek.set(k, []);
    byWeek.get(k)!.push(it);
  }
  const q = (t: string, k: string) => `#/evidence?${new URLSearchParams({ ...(t ? { t } : {}), ...(k ? { k } : {}) }).toString()}`;
  const html = `<section class="week-head"><div><p class="eyebrow">Những gì đã làm ra</p><h1>Bằng chứng</h1><p class="muted">${items.length} mục từ các buổi học: link commit, ghi chú, ảnh.</p></div></section>
  <div class="row gap wrap filters">
    <a class="chip ${!filter ? 'on' : ''}" href="${q('', kind)}">Tất cả</a>
    ${tracks.map((t) => `<a class="chip ${filter === t.id ? 'on' : ''}" href="${q(t.id, kind)}">${colorDot(t)}${esc(t.name)}</a>`).join('')}
    <span class="sep"></span>
    ${[['', 'Mọi loại'], ['link', 'Link'], ['note', 'Ghi chú'], ['image', 'Ảnh']].map(([k, lbl]) => `<a class="chip ${kind === k ? 'on' : ''}" href="${q(filter, k)}">${lbl}</a>`).join('')}
  </div>
  ${items.length ? [...byWeek.entries()].map(([wk, list]) => `<section class="ev-week"><h2 class="sec-title">${weekRangeText(wk)}</h2><div class="ev-grid">${list.map(({ l, e }) => {
    const t = state.tracks.find((x) => x.id === l.trackId);
    const head = `<div class="ev-meta">${t ? colorDot(t) + esc(t.name) : ''} · ${fmtDay(l.day, true)}</div>`;
    const body = e.kind === 'image'
      ? `<button class="thumb big" data-act="img" data-src="${esc(e.value)}"><img src="${esc(e.value)}" alt="${esc(e.label || 'ảnh bằng chứng')}"></button>`
      : e.kind === 'link'
        ? `<a href="${esc(e.value)}" target="_blank" rel="noopener noreferrer" class="ev-link">${esc(e.label || e.value)}</a><span class="small muted url">${esc(e.value)}</span>`
        : `<p>${esc(e.value)}</p>`;
    return `<article class="card ev-card k-${e.kind}">${head}${body}${l.note ? `<p class="small muted">${esc(l.note)}</p>` : ''}</article>`;
  }).join('')}</div></section>`).join('') : `<section class="card"><p class="muted">Chưa có bằng chứng nào. Khi ghi buổi học, thêm link commit, ghi chú kết quả hoặc ảnh chụp màn hình; chúng sẽ hiện ở đây thành danh sách những gì bạn đã làm ra.</p></section>`}`;
  return { title: 'Bằng chứng', html };
}

export function settingsView(): View {
  const b = exportBundle();
  const size = new Blob([JSON.stringify(b)]).size;
  const html = `<section class="week-head"><div><h1>Cài đặt</h1><p class="muted">Dữ liệu chỉ nằm trong trình duyệt này (IndexedDB). Không có máy chủ, không có tài khoản.</p></div></section>
  <section class="card">
    <h2>Sao lưu và khôi phục</h2>
    <p class="muted small">${b.tracks.length} việc học · ${b.logs.length} buổi · khoảng ${(size / 1024).toFixed(0)} KB. Nên tải bản sao lưu định kỳ; xoá dữ liệu trình duyệt sẽ xoá luôn dữ liệu app.</p>
    <div class="row gap wrap"><button class="btn primary" data-act="export">Tải bản sao lưu (JSON)</button><label class="btn file-btn">Khôi phục từ file<input type="file" accept="application/json,.json" data-act="import" hidden></label></div>
    <p class="small muted">Khôi phục sẽ thay toàn bộ dữ liệu hiện tại bằng dữ liệu trong file.</p>
  </section>
  ${state.tracks.some((t) => t.archived) ? `<section class="card">
    <h2>Đã lưu trữ</h2>
    <ul class="past">${state.tracks.filter((t) => t.archived).map((t) => `<li class="row between">${colorDot(t)}<a href="#/t/${t.id}" class="grow">${esc(t.name)}</a><button class="btn small" data-act="archive" data-id="${t.id}">Hiện lại</button></li>`).join('')}</ul>
  </section>` : ''}
  <section class="card">
    <h2>Ghi nhanh</h2>
    <p class="muted small">Nút Ghi nhanh ở góc màn hình, hoặc phím <b>G</b> (khi không đang gõ trong ô), mở tờ ghi một chạm. App nhớ việc học, loại và thời gian bạn dùng lần trước, nên lần sau chỉ cần bấm lưu.</p>
  </section>
  <section class="card">
    <h2>Ngày bận</h2>
    <label class="field"><span>Số ngày bận được bảo vệ mỗi tháng, cho mỗi việc học</span><div class="row gap"><input type="number" min="0" max="10" value="${state.settings.busyPerMonth}" class="num" data-act="busy-limit"><span class="muted">ngày</span></div></label>
    <p class="small muted">Ngày bận không tính là lỡ. Giới hạn nhỏ giúp nó vẫn là ngoại lệ chứ không thành thói quen. Ngày nghỉ cố định trong tuần không bị giới hạn.</p>
  </section>
  <section class="card">
    <h2>Dữ liệu mẫu</h2>
    <p class="muted small">Ba việc học mẫu (DevOps, dựng video, đọc sách) với lịch sử khoảng 6 tuần, được đánh dấu là mẫu và xoá được riêng.</p>
    <div class="row gap wrap">${hasDemo() ? '<button class="btn" data-act="remove-demo">Xoá dữ liệu mẫu</button>' : '<button class="btn" data-act="load-demo">Thêm dữ liệu mẫu</button>'}</div>
  </section>
  <section class="card">
    <h2>Điểm số được tính thế nào</h2>
    <ul class="explain">
      <li><b>7 ngày qua</b>: số ngày có ghi trong 7 ngày gần nhất. Ngày nghỉ, ngày bận và ngày tạm dừng được tách riêng, không tính là lỡ.</li>
      <li><b>Mục tiêu tuần</b>: số ngày cần học trong tuần thứ Hai đến Chủ nhật. Tuần có ngày bận hoặc tạm dừng thì mục tiêu giảm theo số ngày còn lại.</li>
      <li><b>Tuần đạt liên tiếp</b>: thay cho chuỗi ngày liên tục. Lỡ một ngày không làm mất chuỗi nếu tuần vẫn đạt mục tiêu.</li>
      <li><b>Điểm nhịp (0-100)</b>: trung bình trượt theo hàm mũ, giống cách Loop Habit Tracker tính. Học đều thì tăng dần, nghỉ một ngày chỉ giảm chút ít, quay lại vài buổi là hồi lại.</li>
      <li><b>Không lỡ hai lần</b>: lỡ một ngày thì app nhắc làm bước nhỏ hôm nay. Lỡ từ hai ngày, app gợi ý bắt đầu lại bằng bước nhỏ nhất, không bắt bù.</li>
    </ul>
  </section>
  <section class="card danger-zone">
    <h2>Xoá toàn bộ</h2>
    <p class="muted small">Xoá mọi việc học, buổi học và nhận xét trong trình duyệt này. Nên tải bản sao lưu trước.</p>
    <button class="btn ghost danger" data-act="wipe">Xoá toàn bộ dữ liệu</button>
  </section>`;
  return { title: 'Cài đặt', html };
}
