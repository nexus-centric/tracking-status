import './style.css';
import { today } from './core/dates.js';
import { momentum, todayState } from './core/rhythm.js';
import { applyImport, ctxFor, deleteLog, deleteSprint, deleteTrack, getTrack, init, loadDemo, newId, onChange, previewImport, removeDemo, saveLog, saveSettings, saveTrack, setMark, state, wipe, exportBundle } from './state.js';
import { icoEvidence, icoPlus, icoSettings, icoTimer, icoToday, icoWeek, logoMark } from './icons.js';
import { handleTimerAction, paintTimer, timerDockHtml, timerView } from './views/timer.js';
import { onSessionChange, onTick, onAnnounce, getSession } from './session.js';
import { markBackedUp, snoozeBackup } from './views/today-extra.js';
import { fmtDay } from './core/dates.js';
import { clientCenter, countUp, playEnter, queueCelebration, takeCelebration } from './motion.js';
import { $, copyText, download, esc, openModal, toast } from './ui.js';
import { loggableTracks, openFinishSprint, openLogDialog, openPauseDialog, openQuickLog, resumeTrack } from './views/forms.js';
import { evidenceView, settingsView, weekView } from './views/other.js';
import { todayView } from './views/today.js';
import { addMilestone, removeMilestone, sprintEditor, toggleMilestone, trackEditor, trackView, type View } from './views/track.js';
import { buildWeekSummary } from './core/summary.js';
import { weekStart } from './core/dates.js';

const app = document.getElementById('app')!;

const NAV: [string, string, string][] = [
  ['#/', 'Hôm nay', icoToday],
  ['#/timer', 'Đồng hồ', icoTimer],
  ['#/week', 'Tuần', icoWeek],
  ['#/evidence', 'Thành quả', icoEvidence],
  ['#/settings', 'Cài đặt', icoSettings],
];

function route(): { view: View; key: string } {
  const raw = location.hash.slice(1) || '/';
  const [path, qs] = raw.split('?');
  const params = new URLSearchParams(qs ?? '');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 't' && parts[1]) {
    const t = getTrack(parts[1]);
    if (parts[2] === 'edit') return { view: trackEditor(parts[1]), key: '#/' };
    if (parts[2] === 'sprint' && t) return { view: sprintEditor(t, parts[3]), key: '#/' };
    return { view: trackView(parts[1], params), key: '#/' };
  }
  if (parts[0] === 'new') return { view: trackEditor(), key: '#/' };
  if (parts[0] === 'timer') return { view: timerView(params), key: '#/timer' };
  if (parts[0] === 'week') return { view: weekView(params), key: '#/week' };
  if (parts[0] === 'evidence') return { view: evidenceView(params), key: '#/evidence' };
  if (parts[0] === 'settings') return { view: settingsView(), key: '#/settings' };
  return { view: { title: 'Hôm nay', html: todayView() }, key: '#/' };
}

function hashTrackId(): string | undefined {
  const m = /^#\/t\/([^/?]+)/.exec(location.hash);
  return m?.[1];
}

function onEditorPage(): boolean {
  return /^#\/(new|t\/[^/]+\/(edit|sprint))/.test(location.hash);
}

function navHtml(key: string): string {
  return NAV.map(([h, l, icon]) => `<a href="${h}" class="${h === key ? 'on' : ''}" ${h === key ? 'aria-current="page"' : ''}>${icon}<span>${l}</span></a>`).join('');
}

function updateFab(): void {
  const fab = app.querySelector<HTMLButtonElement>('.fab');
  if (!fab) return;
  const show = loggableTracks().length > 0 && !onEditorPage();
  fab.hidden = !show;
}

function ensureShell(key: string): HTMLElement {
  if (!app.querySelector('.app-shell')) {
    app.innerHTML = `<div class="app-shell">
      <header class="top">
        <a class="brand" href="#/"><span class="logo">${logoMark}</span><span class="brand-text"><b>Tiến độ học</b><small>tracking-status</small></span></a>
        <nav class="nav" aria-label="Chính"></nav>
      </header>
      <main class="main"></main>
      ${timerDockHtml()}
      <button type="button" class="fab" data-act="quick-log" hidden>
        <span class="fab-icon">${icoPlus}</span>
        <span class="fab-label">Ghi nhanh</span>
      </button>
    </div>`;
  }
  const nav = app.querySelector('.nav')!;
  nav.innerHTML = navHtml(key);
  updateFab();
  paintTimer(app);
  return app.querySelector('main')!;
}

function celebrateAfterRender(): void {
  const ev = takeCelebration();
  if (!ev) return;
  const card = app.querySelector<HTMLElement>(`[data-track="${ev.trackId}"]`);
  if (!card) return;
  card.classList.add('just-logged');
  const todayDot = card.querySelector<HTMLElement>('.dot[data-today]');
  if (todayDot) todayDot.classList.add('just-done');
  const lastOn = [...card.querySelectorAll<HTMLElement>('.seg.on')].at(-1);
  if (lastOn) lastOn.classList.add('just-on');
  const num = card.querySelector<HTMLElement>('[data-count]');
  if (num) {
    const to = Number(num.dataset.count);
    if (Number.isFinite(to)) countUp(num, to, ev.fromScore ?? to);
  }
  window.setTimeout(() => card.classList.remove('just-logged'), 1200);
}

let lastHash = '';
function render(): void {
  const { view, key } = route();
  const pageChange = location.hash !== lastHash;
  const scroll = pageChange ? 0 : window.scrollY;
  const main = ensureShell(key);
  main.innerHTML = view.html;
  document.title = view.title === 'Hôm nay' ? 'Tiến độ học' : `${view.title} · Tiến độ học`;
  view.mount?.(app);
  if (pageChange) playEnter(main);
  celebrateAfterRender();
  window.scrollTo(0, scroll);
  lastHash = location.hash;
}

async function quickTiny(id: string, origin?: { x: number; y: number }): Promise<void> {
  const t = getTrack(id);
  if (!t) return;
  const entry = { id: newId(), trackId: id, day: today(), kind: 'tiny' as const, minutes: 0, note: t.tinyAction, blocker: '', evidence: [], createdAt: new Date().toISOString() };
  const before = todayState(ctxFor(t));
  queueCelebration({ trackId: id, fromScore: momentum(ctxFor(t)), origin, color: t.color });
  await saveLog(entry);
  const msg = before === 'recover' ? 'Đã ghi. Chuỗi ngày học của bạn vẫn liền mạch.' : before === 'restart' ? 'Đã ghi. Chuỗi ngày học bắt đầu lại từ hôm nay.' : 'Đã ghi bước nhỏ của hôm nay.';
  toast(msg, { label: 'Hoàn tác', run: () => void deleteLog(entry.id) });
}

app.addEventListener('click', async (e) => {
  const tm = (e.target as HTMLElement).closest<HTMLElement>('[data-tm]');
  if (tm && !(tm instanceof HTMLInputElement)) { await handleTimerAction(tm); return; }
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el || el instanceof HTMLInputElement) return;
  const id = el.dataset.id ?? '';
  const t = id ? getTrack(id) : undefined;
  switch (el.dataset.act) {
    case 'tiny': return quickTiny(id, clientCenter(el));
    case 'quick-log': return openQuickLog(hashTrackId());
    case 'log': return openLogDialog(id, { kind: 'full' });
    case 'edit-log': { const l = state.logs.find((x) => x.id === id); if (l) openLogDialog(l.trackId, { logId: id }); return; }
    case 'del-log': {
      const l = await deleteLog(id);
      if (l) toast('Đã xoá buổi học.', { label: 'Hoàn tác', run: () => void saveLog(l) });
      return;
    }
    case 'busy': {
      const ok = await setMark(id, today(), 'busy');
      toast(ok ? 'Đã đánh dấu hôm nay là ngày bận. Chuỗi ngày học không bị đứt.' : 'Bạn đã dùng hết số ngày bận của tháng này.', ok ? { label: 'Hoàn tác', run: () => void setMark(id, today(), null) } : undefined);
      return;
    }
    case 'unbusy': await setMark(id, today(), null); return;
    case 'pause': if (t) openPauseDialog(t); return;
    case 'resume': if (t) await resumeTrack(t); return;
    case 'resume-on': if (t) await resumeTrack(t, el.dataset.day); return;
    case 'finish-sprint': return openFinishSprint(id);
    case 'ms-del': return removeMilestone(el.dataset.sprint!, el.dataset.ms!);
    case 'img': {
      const src = el.dataset.src ?? '';
      if (src.startsWith('data:image/')) openModal(`<div class="img-view"><img src="${esc(src)}" alt="Ảnh thành quả"><button class="btn" data-close>Đóng</button></div>`, 'wide');
      return;
    }
    case 'load-demo': await loadDemo(); toast('Đã thêm dữ liệu mẫu.'); location.hash = '#/'; return;
    case 'remove-demo': await removeDemo(); toast('Đã xoá dữ liệu mẫu.'); return;
    case 'archive': if (t) { await saveTrack({ ...t, archived: !t.archived }); toast(t.archived ? 'Việc học đã hiện lại.' : 'Đã lưu trữ việc học. Dữ liệu vẫn còn nguyên và có trong bản sao lưu.'); location.hash = '#/'; } return;
    case 'del-track':
      if (t && confirm(`Xoá "${t.name}" cùng toàn bộ buổi học và đợt học? Thao tác này không hoàn tác được.`)) { await deleteTrack(t.id); toast('Đã xoá việc học.'); location.hash = '#/'; }
      return;
    case 'del-sprint': {
      const s = state.sprints.find((x) => x.id === id);
      if (s && confirm(`Xoá đợt học "${s.title}"? Các buổi học đã ghi vẫn được giữ nguyên.`)) { await deleteSprint(id); location.hash = `#/t/${s.trackId}`; }
      return;
    }
    case 'export': {
      const d = today();
      download(`tracking-status-backup-${d}.json`, JSON.stringify(exportBundle(), null, 2));
      markBackedUp();
      toast('Đã tải bản sao lưu. Hãy cất file ở nơi an toàn, ví dụ Google Drive.');
      if (location.hash === '' || location.hash === '#/' || location.hash.startsWith('#/settings')) render();
      return;
    }
    case 'snooze-backup': {
      snoozeBackup(7);
      render();
      toast('Sẽ nhắc lại sau 7 ngày.');
      return;
    }
    case 'copy-summary': {
      const w = new URLSearchParams(location.hash.split('?')[1] ?? '').get('w');
      const monday = weekStart(w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? w : today());
      const review = state.reviews.find((r) => r.weekStart === monday);
      const text = $('.summary', app)?.textContent ?? buildWeekSummary({ weekStart: monday, today: today(), tracks: state.tracks, sprints: state.sprints, logs: state.logs, marks: state.marks, review }).text;
      toast((await copyText(text)) ? 'Đã sao chép bản tóm tắt.' : 'Chưa sao chép được, bạn hãy chọn đoạn văn và sao chép thủ công.');
      return;
    }
    case 'wipe':
      if (confirm('Xoá toàn bộ dữ liệu trong trình duyệt này? Thao tác này không hoàn tác được.')) { await wipe(); toast('Đã xoá toàn bộ dữ liệu.'); location.hash = '#/'; }
      return;
  }
});

app.addEventListener('change', async (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.act === 'ms') await toggleMilestone(el.dataset.sprint!, el.dataset.ms!, el.checked);
  else if (el.dataset.act === 'busy-limit') await saveSettings({ ...state.settings, busyPerMonth: Math.max(0, Math.min(10, Math.round(Number(el.value) || 0))) });
  else if (el.dataset.act === 'import' && el.files?.[0]) {
    const text = await el.files[0].text();
    el.value = '';
    try {
      openImportPreview(text);
    } catch (x) {
      toast((x as Error).message);
    }
  }
});

app.addEventListener('submit', async (e) => {
  const form = e.target as HTMLFormElement;
  if (form.classList.contains('ms-add')) {
    e.preventDefault();
    const input = form.elements.namedItem('ms') as HTMLInputElement;
    await addMilestone(form.dataset.sprint!, input.value);
  }
});

window.addEventListener('hashchange', render);

// Timer: re-render pages that show the session when it starts/pauses/stops; tick only repaints text.
onSessionChange(() => {
  if (onEditorPage()) return;
  if (location.hash.startsWith('#/timer') || location.hash === '' || location.hash === '#/') render();
  else paintTimer(app);
});
onTick(() => {
  paintTimer(app);
  const strip = app.querySelector<HTMLElement>('.session-strip.live .ss-time');
  const s = getSession();
  if (strip && s) strip.textContent = app.querySelector('.timer-dock .td-time')?.textContent ?? '';
});
onAnnounce((s) => {
  if (document.visibilityState !== 'visible') return;
  if (s.mode === 'countdown') toast('Đã đủ thời gian bạn đặt ra. Bấm "Dừng và lưu" khi sẵn sàng.');
});

// Pause decorative animations while the tab is hidden.
document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('is-hidden', document.visibilityState !== 'visible'));

function openImportPreview(text: string): void {
  const p = previewImport(text);
  const row = (label: string, file: number, cur: number, add: number) => `<tr><td>${label}</td><td>${file}</td><td>${cur}</td><td>+${add}</td></tr>`;
  const dlg = openModal(`<form method="dialog" class="import-form">
    <header class="modal-head"><h2>Khôi phục từ bản sao lưu</h2><button type="button" class="link-btn" data-close>Đóng</button></header>
    <p class="muted small">File tạo lúc ${p.bundle.exportedAt ? esc(fmtDay(p.bundle.exportedAt.slice(0, 10), true)) : 'không rõ'} · định dạng ${p.bundle.version}${p.dropped ? ` · bỏ qua ${p.dropped} mục không hợp lệ` : ''}</p>
    <table class="wk-table import-table"><thead><tr><th></th><th>Trong file</th><th>Hiện có</th><th>Gộp sẽ thêm</th></tr></thead><tbody>
      ${row('Việc học', p.file.tracks, p.current.tracks, p.merge.tracks)}
      ${row('Đợt học', p.file.sprints, p.current.sprints, p.merge.sprints)}
      ${row('Buổi học', p.file.logs, p.current.logs, p.merge.logs)}
      ${row('Ngày nghỉ, ngày bận', p.file.marks, p.current.marks, p.merge.marks)}
      ${row('Nhận xét tuần', p.file.reviews, p.current.reviews, p.merge.reviews)}
    </tbody></table>
    <fieldset class="choice"><legend>Cách khôi phục</legend>
      <label class="toggle"><input type="radio" name="mode" value="merge" checked><span><b>Gộp vào dữ liệu hiện tại.</b> Chỉ thêm những mục chưa có, không xoá gì.</span></label>
      <label class="toggle"><input type="radio" name="mode" value="replace"><span><b>Thay toàn bộ.</b> Dữ liệu hiện tại trong trình duyệt này sẽ bị thay bằng nội dung file.</span></label>
    </fieldset>
    <label class="toggle confirm-replace" hidden><input type="checkbox" name="sure"><span>Tôi hiểu dữ liệu hiện tại sẽ bị thay và không hoàn tác được. Nên tải một bản sao lưu trước.</span></label>
    <p class="err small" role="alert"></p>
    <footer class="modal-foot"><button type="button" class="btn ghost" data-close>Huỷ</button><button type="submit" class="btn primary">Khôi phục</button></footer>
  </form>`);
  const form = dlg.querySelector('form')!;
  const mode = () => (form.querySelector<HTMLInputElement>('[name="mode"]:checked')?.value ?? 'merge') as 'merge' | 'replace';
  form.addEventListener('change', () => { form.querySelector<HTMLElement>('.confirm-replace')!.hidden = mode() !== 'replace'; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (mode() === 'replace' && !(form.elements.namedItem('sure') as HTMLInputElement).checked) {
      form.querySelector('.err')!.textContent = 'Hãy đánh dấu xác nhận trước khi thay toàn bộ dữ liệu.';
      return;
    }
    const r = await applyImport(p.bundle, mode());
    dlg.close();
    toast(mode() === 'replace' ? `Đã khôi phục ${r.tracks} việc học và ${r.logs} buổi học.` : `Đã gộp xong, thêm ${r.addedLogs} buổi học.`);
  });
}
onChange(() => {
  // Do not wipe a form the user is typing into; editors re-render on navigation.
  if (onEditorPage()) return;
  if (location.hash.startsWith('#/week') && document.activeElement?.closest('.review-form')) return;
  render();
});

window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key !== 'g' && e.key !== 'G' && e.key !== 'l' && e.key !== 'L' && e.key !== 't' && e.key !== 'T') return;
  const target = e.target as HTMLElement | null;
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (document.querySelector('dialog.modal[open]')) return;
  if (e.key === 't' || e.key === 'T') { e.preventDefault(); location.hash = '#/timer'; return; }
  if (!loggableTracks(hashTrackId()).length) return;
  e.preventDefault();
  openQuickLog(hashTrackId());
});

// Re-render at midnight so "today" stays correct for a tab left open.
let shownDay = today();
setInterval(() => { if (today() !== shownDay) { shownDay = today(); render(); } }, 60_000);

init()
  .then(render)
  .catch((err) => {
    app.innerHTML = `<main class="main"><section class="card"><h1>Chưa mở được dữ liệu</h1><p>${esc((err as Error)?.message ?? err)}</p><p class="muted">Trình duyệt có thể đang chặn IndexedDB, ví dụ khi bạn dùng chế độ riêng tư.</p></section></main>`;
  });

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}));
}

