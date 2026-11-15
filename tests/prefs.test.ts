import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_DURATION_CHIPS,
  DEFAULT_PREFS,
  clampMinutes,
  defaultMinutes,
  durationChips,
  loadPrefs,
  mergePrefs,
  parsePrefs,
  savePrefs,
  type StorageLike,
} from '../src/core/prefs.js';

describe('clampMinutes', () => {
  it('rounds and caps at 0-1440', () => {
    assert.equal(clampMinutes(10.4), 10);
    assert.equal(clampMinutes(-3), 0);
    assert.equal(clampMinutes(2000), 1440);
    assert.equal(clampMinutes(Number.NaN), 0);
  });
});

describe('parsePrefs', () => {
  it('returns defaults for empty or invalid input', () => {
    assert.deepEqual(parsePrefs(null), DEFAULT_PREFS);
    assert.deepEqual(parsePrefs(undefined), DEFAULT_PREFS);
    assert.deepEqual(parsePrefs('not-json'), DEFAULT_PREFS);
    assert.deepEqual(parsePrefs('[]'), DEFAULT_PREFS);
  });

  it('reads a valid payload and ignores unknown kinds', () => {
    const got = parsePrefs(JSON.stringify({
      trackId: 'demo-devops',
      kind: 'full',
      minutes: { tiny: 15, full: 45 },
    }));
    assert.deepEqual(got, { trackId: 'demo-devops', kind: 'full', minutes: { tiny: 15, full: 45 } });
    assert.equal(parsePrefs(JSON.stringify({ kind: 'nope', trackId: 9 })).kind, 'tiny');
    assert.equal(parsePrefs(JSON.stringify({ kind: 'tiny', minutes: { tiny: -5, full: 9999 } })).minutes.full, 1440);
    assert.equal(parsePrefs(JSON.stringify({ kind: 'tiny', minutes: { tiny: -5, full: 9999 } })).minutes.tiny, 0);
  });
});

describe('mergePrefs and defaultMinutes', () => {
  it('updates the minutes slot for the resulting kind', () => {
    const a = mergePrefs(DEFAULT_PREFS, { trackId: 't1', kind: 'full', minutes: 45 });
    assert.deepEqual(a, { trackId: 't1', kind: 'full', minutes: { tiny: 10, full: 45 } });
    assert.equal(defaultMinutes(a, 'full'), 45);
    assert.equal(defaultMinutes(a, 'tiny'), 10);
    const b = mergePrefs(a, { kind: 'tiny', minutes: 15 });
    assert.equal(b.minutes.tiny, 15);
    assert.equal(b.minutes.full, 45);
  });

  it('keeps the current kind when only minutes are patched', () => {
    const prev = mergePrefs(DEFAULT_PREFS, { kind: 'full', minutes: 30 });
    const next = mergePrefs(prev, { minutes: 90 });
    assert.equal(next.kind, 'full');
    assert.equal(next.minutes.full, 90);
  });
});

describe('durationChips', () => {
  it('returns the base set when the selection is already in it', () => {
    assert.deepEqual(durationChips(10), BASE_DURATION_CHIPS);
    assert.deepEqual(durationChips(0), BASE_DURATION_CHIPS);
  });

  it('inserts a remembered value in sorted order', () => {
    assert.deepEqual(durationChips(30), [0, 10, 25, 30, 45, 60]);
    assert.deepEqual(durationChips(90), [0, 10, 25, 45, 60, 90]);
  });
});

describe('loadPrefs and savePrefs', () => {
  it('round-trips through a storage stand-in', () => {
    const store = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => { store.set(k, v); },
    };
    assert.deepEqual(loadPrefs(storage), DEFAULT_PREFS);
    const saved = savePrefs(mergePrefs(DEFAULT_PREFS, { trackId: 'abc', kind: 'full', minutes: 25 }), storage);
    assert.deepEqual(loadPrefs(storage), saved);
  });

  it('tolerates a missing storage', () => {
    assert.deepEqual(loadPrefs(null), DEFAULT_PREFS);
    assert.equal(savePrefs(DEFAULT_PREFS, null).kind, 'tiny');
  });
});
