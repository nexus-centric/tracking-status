// Weekly review, evidence log and settings.
import { addDays, fmtDay, today, weekStart } from '../core/dates.js';
import { fmtMinutes } from '../core/format.js';
import { buildWeekSummary } from '../core/summary.js';
import type { WeekReview } from '../core/types.js';
import { exportBundle, hasDemo, saveReview, state } from '../state.js';
import { esc } from '../ui.js';
import { backupDue, daysSince } from '../core/backup.js';
import { BUNDLE_VERSION } from '../core/bundle.js';
import { lastBackup } from './today-extra.js';
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
  const stateText: Record<string, string> = { met: 'đạt mục tiêu', missed: 'chưa đạt', 'in-progress': 'đang diễn ra', paused: 'tạm dừng', future: '' };
  const html = `<section class="week-head">
    <div><p class="eyebrow">Nhìn lại tuần</p><h1>${label}</h1><p class="muted">${weekRangeText(monday)} · ${s.activeDays} ngày có học · tổng cộng ${fmtMinutes(s.totalMinutes)}</p></div>
    <div class="row gap"><a class="btn ghost small" href="#/week?w=${addDays(monday, -7)}">Tuần trước</a>${monday < cur ? `<a class="btn ghost small" href="#/week?w=${addDays(monday, 7)}">Tuần sau</a>` : ''}</div>
  </section>
  <section class="card">
    <table class="wk-table"><thead><tr><th>Việc học</th><th>Số ngày</th><th>Thời gian</th><th>Mốc hoàn thành</th></tr></thead><tbody>
    ${s.tracks.map((t) => `<tr><td>${colorDot(t.track)}<a href="#/t/${t.track.id}">${esc(t.track.name)}</a></td><td>${t.paused && !t.week.done ? '<span class="muted">tạm dừng</span>' : `${t.week.done}/${t.week.target} <span class="small muted">${stateText[t.week.state]}</span>`}</td><td>${fmtMinutes(t.minutes)}</td><td>${t.milestones.length}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Tuần này chưa có việc học nào.</td></tr>'}
    </tbody></table>
  </section>
  <section class="week-grid">
    <form class="card review-form">
      <h2>Tự nhận xét tuần</h2>
      <label class="field"><span>Tuần này bạn làm được gì</span><textarea name="wins" rows="3" placeholder="Kể cả những việc nhỏ">${esc(review.wins)}</textarea></label>
      <label class="field"><span>Bạn đang vướng ở đâu</span><textarea name="blockers" rows="3" placeholder="Điều gì làm chậm bạn, cần hỏi ai">${esc(review.blockers)}</textarea></label>
      <label class="field"><span>Tuần sau bạn sẽ làm gì</span><textarea name="next" rows="3" placeholder="Một hai việc cụ thể, đủ nhỏ để chắc chắn làm được">${esc(review.next)}</textarea></label>
      <p class="small muted saved-note">Nội dung được tự lưu trong lúc bạn gõ.</p>
    </form>
    <div class="card summary-card">
      <div class="row between wrap"><h2>Bản tóm tắt để xin góp ý</h2><button class="btn primary small" data-act="copy-summary">Sao chép</button></div>
      <p class="small muted">Dán vào cuộc trò chuyện với trợ lý hoặc người hướng dẫn để nhận góp ý.</p>
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
  const html = `<section class="week-head"><div><p class="eyebrow">Những gì bạn đã làm ra</p><h1>Thành quả</h1><p class="muted">${items.length} mục từ các buổi học: link commit, ghi chú và ảnh chụp.</p></div></section>
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
      ? `<button class="thumb big" data-act="img" data-src="${esc(e.value)}"><img src="${esc(e.value)}" alt="${esc(e.label || 'ảnh thành quả')}"></button>`
      : e.kind === 'link'
        ? `<a href="${esc(e.value)}" target="_blank" rel="noopener noreferrer" class="ev-link">${esc(e.label || e.value)}</a><span class="small muted url">${esc(e.value)}</span>`
        : `<p>${esc(e.value)}</p>`;
    return `<article class="card ev-card k-${e.kind}">${head}${body}${l.note ? `<p class="small muted">${esc(l.note)}</p>` : ''}</article>`;
  }).join('')}</div></section>`).join('') : `<section class="card"><p class="muted">Chưa có thành quả nào. Khi ghi buổi học, bạn có thể thêm link commit, ghi chú kết quả hoặc ảnh chụp màn hình; chúng sẽ hiện ở đây thành danh sách những gì bạn đã làm ra.</p></section>`}`;
  return { title: 'Thành quả', html };
}

export function settingsView(): View {
  const b = exportBundle();
  const size = new Blob([JSON.stringify(b)]).size;
  const real = b.logs.filter((l) => !l.demo).length;
  const last = lastBackup();
  const days = daysSince(last, Date.now());
  const lastText = days === null ? 'Bạn chưa tải bản sao lưu nào từ trình duyệt này.' : days === 0 ? 'Lần sao lưu gần nhất: hôm nay.' : `Lần sao lưu gần nhất cách đây ${days} ngày.`;
  const due = backupDue({ lastBackup: last, snoozeUntil: null, realLogs: real, now: Date.now() });
  const html = `<section class="week-head"><div><p class="eyebrow">Cài đặt</p><h1>Dữ liệu và tuỳ chọn</h1><p class="muted">Mọi dữ liệu chỉ nằm trong trình duyệt này (IndexedDB). Không có máy chủ và không cần tài khoản.</p></div></section>
  <section class="card backup-card${due ? ' due' : ''}">
    <h2>Sao lưu và khôi phục</h2>
    <p class="backup-last ${due ? 'warn-text' : 'muted'}">${lastText}${due ? ' Bạn nên tải một bản mới.' : ''}</p>
    <p class="muted small">Hiện có ${b.tracks.length} việc học, ${b.logs.length} buổi học, khoảng ${(size / 1024).toFixed(0)} KB. Xoá dữ liệu trình duyệt sẽ xoá luôn dữ liệu của app, nên hãy giữ một bản sao lưu ở nơi khác, ví dụ Google Drive.</p>
    <div class="row gap wrap"><button class="btn primary" data-act="export">Tải bản sao lưu (JSON)</button><label class="btn file-btn">Khôi phục từ file<input type="file" accept="application/json,.json" data-act="import" hidden></label></div>
    <p class="small muted">Khi khôi phục, app cho bạn xem trước số lượng và chọn gộp vào dữ liệu hiện có hoặc thay toàn bộ. File sao lưu theo định dạng phiên bản ${BUNDLE_VERSION}.</p>
    <p class="small muted persist-line" data-persist>Đang kiểm tra chế độ lưu trữ của trình duyệt...</p>
  </section>
  ${state.tracks.some((t) => t.archived) ? `<section class="card">
    <h2>Việc học đã lưu trữ</h2>
    <ul class="past">${state.tracks.filter((t) => t.archived).map((t) => `<li class="row between">${colorDot(t)}<a href="#/t/${t.id}" class="grow">${esc(t.name)}</a><button class="btn small" data-act="archive" data-id="${t.id}">Hiện lại</button></li>`).join('')}</ul>
  </section>` : ''}
  <section class="card">
    <h2>Phím tắt</h2>
    <p class="muted small">Nút Ghi nhanh ở góc màn hình, hoặc phím <kbd>G</kbd>, mở khung ghi một chạm. Phím <kbd>T</kbd> mở đồng hồ buổi học. Phím tắt không hoạt động khi bạn đang gõ trong một ô nhập liệu.</p>
  </section>
  <section class="card">
    <h2>Ngày bận</h2>
    <label class="field"><span>Số ngày bận được giữ chuỗi mỗi tháng, cho mỗi việc học</span><div class="row gap"><input type="number" min="0" max="10" value="${state.settings.busyPerMonth}" class="num" data-act="busy-limit"><span class="muted">ngày</span></div></label>
    <p class="small muted">Ngày bận không làm đứt chuỗi ngày học. Giới hạn nhỏ giúp nó vẫn là ngoại lệ chứ không thành thói quen. Ngày nghỉ cố định trong tuần thì không bị giới hạn.</p>
  </section>
  <section class="card">
    <h2>Dữ liệu mẫu</h2>
    <p class="muted small">Ba việc học mẫu (DevOps, dựng video, đọc sách) với lịch sử khoảng 6 tuần. Dữ liệu mẫu được đánh dấu riêng và có thể xoá mà không ảnh hưởng dữ liệu thật.</p>
    <div class="row gap wrap">${hasDemo() ? '<button class="btn" data-act="remove-demo">Xoá dữ liệu mẫu</button>' : '<button class="btn" data-act="load-demo">Thêm dữ liệu mẫu</button>'}</div>
  </section>
  <section class="card">
    <h2>Các con số được tính thế nào</h2>
    <ul class="explain">
      <li><b>Số ngày học trong 7 ngày qua</b>: ngày nghỉ, ngày bận và ngày tạm dừng được tách riêng, không bị tính là bỏ lỡ.</li>
      <li><b>Mục tiêu tuần</b>: số ngày cần học từ thứ Hai đến Chủ nhật. Tuần có ngày bận hoặc tạm dừng thì mục tiêu giảm theo số ngày còn lại.</li>
      <li><b>Số tuần liên tiếp đạt mục tiêu</b>: thay cho chuỗi ngày liên tục. Lỡ một ngày vẫn không sao nếu tuần đó đạt mục tiêu.</li>
      <li><b>Độ đều đặn (0-100)</b>: trung bình trượt theo hàm mũ, giống cách Loop Habit Tracker tính. Học đều thì điểm tăng dần, nghỉ một ngày chỉ giảm chút ít, quay lại vài buổi là hồi phục.</li>
      <li><b>Không bỏ lỡ hai ngày liền</b>: lỡ một ngày thì app nhắc bạn làm một bước nhỏ hôm nay. Lỡ từ hai ngày trở lên, app gợi ý bắt đầu lại bằng bước nhỏ nhất, không bắt học bù.</li>
      <li><b>Đồng hồ buổi học</b>: Pomodoro chỉ tính thời gian tập trung; đếm ngược và bấm giờ tự do tính toàn bộ thời gian chạy, trừ lúc tạm dừng.</li>
    </ul>
  </section>
  <section class="card danger-zone">
    <h2>Xoá toàn bộ dữ liệu</h2>
    <p class="muted small">Xoá mọi việc học, buổi học và nhận xét trong trình duyệt này. Hãy tải bản sao lưu trước.</p>
    <button class="btn ghost danger" data-act="wipe">Xoá toàn bộ dữ liệu</button>
  </section>`;
  return {
    title: 'Cài đặt',
    html,
    mount(root) {
      const line = root.querySelector<HTMLElement>('[data-persist]');
      if (!line) return;
      const st = navigator.storage;
      if (!st?.persisted) { line.textContent = 'Trình duyệt này không cho biết chế độ lưu trữ.'; return; }
      void st.persisted().then((p) => {
        if (p) { line.textContent = 'Trình duyệt đã đồng ý giữ dữ liệu lâu dài cho app này.'; return; }
        line.innerHTML = 'Dữ liệu đang ở chế độ lưu trữ thông thường; trình duyệt có thể xoá khi máy thiếu dung lượng. <button class="link-btn" type="button" data-persist-ask>Xin giữ lâu dài</button>';
        line.querySelector('[data-persist-ask]')?.addEventListener('click', async () => {
          const ok = await st.persist?.().catch(() => false);
          line.textContent = ok ? 'Trình duyệt đã đồng ý giữ dữ liệu lâu dài cho app này.' : 'Trình duyệt chưa đồng ý. Chrome và Safari tự quyết dựa trên mức bạn dùng trang; hãy tải bản sao lưu định kỳ.';
        });
      });
    },
  };
}
