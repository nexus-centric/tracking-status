// Backup reminder: all data lives in this browser only, so nudge the user to download a JSON copy.
// The timestamps live in localStorage (not in the backup itself).

export const LAST_BACKUP_KEY = 'nhip:last-backup';
export const BACKUP_SNOOZE_KEY = 'nhip:backup-snooze';
export const BACKUP_EVERY_DAYS = 14;
export const BACKUP_MIN_LOGS = 5;
const DAY = 86_400_000;

/** True when a reminder should be shown: enough real data and no backup (or snooze) in the last 14 days. */
export function backupDue(opts: { lastBackup: string | null; snoozeUntil: string | null; realLogs: number; now: number }): boolean {
  if (opts.realLogs < BACKUP_MIN_LOGS) return false;
  const snooze = opts.snoozeUntil ? Date.parse(opts.snoozeUntil) : NaN;
  if (Number.isFinite(snooze) && snooze > opts.now) return false;
  const last = opts.lastBackup ? Date.parse(opts.lastBackup) : NaN;
  if (!Number.isFinite(last)) return true;
  return opts.now - last >= BACKUP_EVERY_DAYS * DAY;
}

export function daysSince(iso: string | null, now: number): number | null {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / DAY)) : null;
}
