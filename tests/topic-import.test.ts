import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTopicImport, topicImportPreview, trackFromImport } from '../src/core/topic-import.js';

const sample = readFileSync('docs/topic-import.sample.json', 'utf8');

test('parses the documented sample file', () => {
  const r = parseTopicImport(sample);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.topics.length, 2);
  assert.equal(r.topics[0].title, 'Kubernetes căn bản');
  assert.equal(r.topics[0].description.length > 0, true);
  assert.equal(r.topics[0].lessons.length, 3);
  assert.equal(r.topics[0].lessons[0].url, 'https://kubernetes.io/docs/concepts/overview/');
  assert.equal(r.topics[0].lessons[1].phase, 'Pod và workload');
  assert.deepEqual(r.topics[0].lessons[1].estimate, { unit: 'min', value: 45 });
  assert.equal(r.topics[1].lessons[1].estimate?.unit, 'session');
  const prev = topicImportPreview(r.topics);
  assert.deepEqual(prev, {
    topicCount: 2,
    lessonCount: 5,
    lines: ['Kubernetes căn bản — 3 bài học', 'GitOps với Argo CD — 2 bài học'],
  });
});

test('accepts a single topic, a topics wrapper, and name/why/link aliases', () => {
  const one = parseTopicImport(JSON.stringify({
    name: 'Đọc sách',
    why: 'Hiểu hệ thống phân tán',
    lessons: [{ title: 'Chương 1', link: 'https://example.com/ch1' }],
  }));
  assert.equal(one.ok, true);
  if (one.ok) {
    assert.equal(one.topics[0].title, 'Đọc sách');
    assert.equal(one.topics[0].description, 'Hiểu hệ thống phân tán');
    assert.equal(one.topics[0].lessons[0].url, 'https://example.com/ch1');
  }
  const wrapped = parseTopicImport(JSON.stringify({ topics: [{ title: 'A', lessons: [] }, { title: 'B' }] }));
  assert.equal(wrapped.ok, true);
  if (wrapped.ok) assert.deepEqual(wrapped.topics.map((t) => t.title), ['A', 'B']);
});

function importError(text: string): string {
  const r = parseTopicImport(text);
  if (r.ok) throw new Error(`expected an error, got ${r.topics.length} topic(s)`);
  return r.error;
}

test('returns clear Vietnamese errors for invalid input', () => {
  assert.match(importError(''), /Chưa có nội dung JSON/);
  assert.match(importError('{'), /JSON không hợp lệ/);
  assert.match(importError('[]'), /đang trống/);
  assert.match(importError('123'), /object topic/);
  assert.match(importError(JSON.stringify({ title: '' })), /thiếu "title"/);
  assert.match(importError(JSON.stringify({ title: 'A', weeklyTarget: 0 })), /weeklyTarget/);
  assert.match(importError(JSON.stringify({ title: 'A', lessons: [{ title: '' }] })), /bài học thứ 1/);
  assert.match(importError(JSON.stringify({ title: 'A', lessons: [{ title: 'B', url: 'javascript:alert(1)' }] })), /http:\/\/ hoặc https:\/\//);
  assert.match(importError(JSON.stringify([{ title: 'Bài 1', url: 'https://example.com/1' }])), /trông giống một bài học/);
  assert.match(
    importError(JSON.stringify({ app: 'nhip', version: 2, tracks: [], sprints: [], roadmap: [], logs: [], marks: [], reviews: [], settings: {} })),
    /sao lưu/,
  );
});

test('trackFromImport fills required Track fields and keeps optional copy', () => {
  const r = parseTopicImport(JSON.stringify({
    title: 'Lab',
    description: 'Lý do',
    tinyAction: 'mở docs 10 phút',
    plan: 'Sau khi ăn tối, mở laptop',
    color: '#0e9f8f',
    weeklyTarget: 3,
    restDays: [0],
    lessons: [{ title: 'Bài 1' }],
  }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const t = trackFromImport(r.topics[0], { id: 't1', color: '#2f5bea', createdAt: '2026-11-24' });
  assert.equal(t.id, 't1');
  assert.equal(t.name, 'Lab');
  assert.equal(t.color, '#0e9f8f');
  assert.equal(t.why, 'Lý do');
  assert.equal(t.tinyAction, 'mở docs 10 phút');
  assert.equal(t.weeklyTarget, 3);
  assert.deepEqual(t.restDays, [0]);
  assert.equal(t.archived, false);
  assert.equal(trackFromImport({ ...r.topics[0], tinyAction: '', color: undefined }, { id: 't2', color: '#2f5bea', createdAt: '2026-11-24' }).tinyAction, 'học 10 phút');
});
