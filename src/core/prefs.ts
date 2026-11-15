// Last-used values for the quick-log sheet and the full log dialog.
// Stored in localStorage (not in the IndexedDB export) so backups stay compatible.

import type { LogKind } from './types.js';

export const PREFS_KEY = 'nhip:log-prefs';

export interface LogPrefs {
  trackId: string;
  kind: LogKind;
  minutes: { tiny: number; full: number };
}

export const DEFAULT_PREFS: LogPrefs = {
  trackId: '',
  kind: 'tiny',
  minutes: { tiny: 10, full: 30 },
};

export const BASE_DURATION_CHIPS = [0, 10, 25, 45, 60];

export function clampMinutes(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1440, Math.round(n)));
}

export function parsePrefs(raw: string | null | undefined): LogPrefs {
  if (!raw) return { ...DEFAULT_PREFS, minutes: { ...DEFAULT_PREFS.minutes } };
  try {
    const v = JSON.parse(raw) as Partial<LogPrefs> & { minutes?: { tiny?: unknown; full?: unknown } };
    const kind: LogKind = v.kind === 'full' ? 'full' : 'tiny';
    const minutesIn: { tiny?: unknown; full?: unknown } = v.minutes && typeof v.minutes === 'object' ? v.minutes : {};
    return {
      trackId: typeof v.trackId === 'string' ? v.trackId : '',
      kind,
      minutes: {
        tiny: clampMinutes(typeof minutesIn.tiny === 'number' ? minutesIn.tiny : DEFAULT_PREFS.minutes.tiny),
        full: clampMinutes(typeof minutesIn.full === 'number' ? minutesIn.full : DEFAULT_PREFS.minutes.full),
      },
    };
  } catch {
    return { ...DEFAULT_PREFS, minutes: { ...DEFAULT_PREFS.minutes } };
  }
}

export function defaultMinutes(prefs: LogPrefs, kind: LogKind): number {
  return prefs.minutes[kind];
}

/** Returns duration chips, inserting a remembered value that is not already in the base set. */
export function durationChips(selected: number): number[] {
  const n = clampMinutes(selected);
  if (BASE_DURATION_CHIPS.includes(n)) return [...BASE_DURATION_CHIPS];
  return [...BASE_DURATION_CHIPS, n].sort((a, b) => a - b);
}

export function mergePrefs(
  prev: LogPrefs,
  patch: { trackId?: string; kind?: LogKind; minutes?: number },
): LogPrefs {
  const next: LogPrefs = { trackId: prev.trackId, kind: prev.kind, minutes: { ...prev.minutes } };
  if (patch.trackId !== undefined) next.trackId = patch.trackId;
  if (patch.kind) next.kind = patch.kind;
  if (patch.minutes !== undefined) next.minutes[next.kind] = clampMinutes(patch.minutes);
  return next;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadPrefs(storage?: StorageLike | null): LogPrefs {
  try {
    return parsePrefs(storage?.getItem(PREFS_KEY) ?? null);
  } catch {
    return parsePrefs(null);
  }
}

export function savePrefs(prefs: LogPrefs, storage?: StorageLike | null): LogPrefs {
  if (storage) {
    try {
      storage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Quota or private-mode restrictions; in-memory prefs still work for this session.
    }
  }
  return prefs;
}
