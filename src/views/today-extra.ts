// Small blocks on the Today page: the study session strip and the backup reminder.
import { backupDue, daysSince, BACKUP_SNOOZE_KEY, LAST_BACKUP_KEY } from '../core/backup.js';
import { formatClock, viewAt } from '../core/timer.js';
import { icoTimer } from '../icons.js';
import { getSession, getTimerPrefs } from '../session.js';
import { getTrack, state } from '../state.js';
import { esc } from '../ui.js';

function ls(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function lastBackup(): string | null { return ls(LAST_BACKUP_KEY); }

export function markBackedUp(): void {
  try { localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString()); localStorage.removeItem(BACKUP_SNOOZE_KEY); } catch { /* ignore */ }
}

export function snoozeBackup(days = 7): void {
  try { localStorage.setItem(BACKUP_SNOOZE_KEY, new Date(Date.now() + days * 86_400_000).toISOString()); } catch { /* ignore */ }
}

export function backupBanner(): string {
  const realLogs = state.logs.filter((l) => !l.demo).length;
  const last = lastBackup();
  if (!backupDue({ lastBackup: last, snoozeUntil: ls(BACKUP_SNOOZE_KEY), realLogs, now: Date.now() })) return '';
  const d = daysSince(last, Date.now());
  const msg = d === null ? 'Bạn chưa tải bản sao lưu nào.' : `Lần sao lưu gần nhất cách đây ${d} ngày.`;
  return `<div class="banner backup-banner"><span><b>${msg}</b> Dữ liệu chỉ nằm trong trình duyệt này; một file sao lưu giúp bạn không mất tiến độ khi đổi máy hoặc xoá dữ liệu trình duyệt.</span>
    <span class="row gap"><button class="btn small primary" data-act="export">Tải bản sao lưu</button><button class="btn small ghost" data-act="snooze-backup">Nhắc lại sau</button></span></div>`;
}

export function sessionStrip(): string {
  const s = getSession();
  if (s) {
    const t = getTrack(s.trackId);
    const v = viewAt(s, Date.now());
    const label = s.status === 'stopped' ? 'Buổi học đã dừng, chờ bạn lưu' : s.status === 'paused' ? 'Buổi học đang tạm dừng' : 'Đang trong buổi học';
    return `<a class="session-strip live" href="#/timer" style="--c:${esc(t?.color ?? 'var(--accent)')}" data-status="${s.status}">
      <span class="ss-pulse" aria-hidden="true"></span>
      <span class="ss-copy"><span class="eyebrow">${label}</span><b>${esc(t?.name ?? '')}</b></span>
      <span class="ss-time">${formatClock(v.displayMs)}</span>
    </a>`;
  }
  const p = getTimerPrefs();
  const modeText = p.mode === 'pomodoro' ? `Pomodoro ${p.pomo.focus}/${p.pomo.brk}` : p.mode === 'countdown' ? `Đếm ngược ${p.targetMin} phút` : 'Bấm giờ tự do';
  return `<a class="session-strip" href="#/timer">
    <span class="ss-icon" aria-hidden="true">${icoTimer}</span>
    <span class="ss-copy"><span class="eyebrow">Đồng hồ buổi học</span><b>Bắt đầu một buổi học có bấm giờ</b></span>
    <span class="ss-mode">${modeText}</span>
  </a>`;
}
