import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseRoadmapInput } from '../src/core/roadmap-parse.js';
import { lessonsToRoadmapText, parseTopicImport, topicImportPreview, trackFromImport } from '../src/core/topic-import.js';

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
  assert.deepEqual(r.topics[0].sprint, {
    title: 'Nền tảng cluster',
    deliverable: 'Một cluster lab chạy được Deployment mẫu',
    start: undefined,
    weeks: 3,
    milestones: ['Đọc xong phần tổng quan', 'Chạy được Deployment'],
  });
  const prev = topicImportPreview(r.topics);
  assert.deepEqual(prev, {
    topicCount: 2,
    lessonCount: 5,
    lines: ['Kubernetes căn bản — 3 bài học, 1 phần', 'GitOps với Argo CD — 2 bài học'],
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
  assert.match(importError(''), /Chưa có nội dung/);
  assert.match(importError('{'), /JSON không hợp lệ/);
  assert.match(importError('[]'), /đang trống/);
  assert.match(importError('[1, 2]'), /bài học thứ 1 phải là chuỗi/);
  assert.match(importError(JSON.stringify({ title: '' })), /thiếu "title"/);
  assert.match(importError(JSON.stringify({ title: 'A', weeklyTarget: 0 })), /weeklyTarget/);
  assert.match(importError(JSON.stringify({ title: 'A', lessons: [{ title: '' }] })), /bài học thứ 1/);
  assert.match(importError(JSON.stringify({ title: 'A', lessons: [{ title: 'B' }, 42] })), /bài học thứ 2/);
  assert.match(importError(JSON.stringify({ title: 'A', phases: [{ title: 'P1' }] })), /phần "P1"/);
  assert.match(importError(JSON.stringify({ title: 'A', lessons: [{ title: 'B', url: 'javascript:alert(1)' }] })), /http:\/\/ hoặc https:\/\//);
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

test('parses optional sprint fields from an object or top-level aliases', () => {
  const obj = parseTopicImport(JSON.stringify({
    title: 'Lab',
    sprint: { title: 'Tuần đầu', deliverable: 'Repo khởi tạo', start: '2026-11-24', weeks: 2, milestones: [{ text: 'Init repo' }, 'README'] },
  }));
  assert.equal(obj.ok, true);
  if (obj.ok) {
    assert.deepEqual(obj.topics[0].sprint, {
      title: 'Tuần đầu', deliverable: 'Repo khởi tạo', start: '2026-11-24', weeks: 2, milestones: ['Init repo', 'README'],
    });
  }
  const flat = parseTopicImport(JSON.stringify({
    title: 'Lab',
    sprintTitle: 'Sprint tay',
    deliverable: 'Một PR',
    weeks: 4,
    milestones: 'Mốc A\nMốc B',
  }));
  assert.equal(flat.ok, true);
  if (flat.ok) {
    assert.equal(flat.topics[0].sprint?.title, 'Sprint tay');
    assert.equal(flat.topics[0].sprint?.weeks, 4);
    assert.deepEqual(flat.topics[0].sprint?.milestones, ['Mốc A', 'Mốc B']);
  }
  assert.match(importError(JSON.stringify({ title: 'Lab', weeks: 5 })), /weeks phải là 2, 3 hoặc 4/);
  assert.match(importError(JSON.stringify({ title: 'Lab', start: '24-11-2026' })), /YYYY-MM-DD/);
});

test('lessonsToRoadmapText is understood by the existing roadmap parser', () => {
  const r = parseTopicImport(JSON.stringify({
    title: 'K8s',
    lessons: [
      { title: 'Tổng quan', url: 'https://example.com/overview' },
      { title: 'Pod', url: 'https://example.com/pod', phase: 'Workload', estimate: { unit: 'min', value: 45 } },
      { title: 'Lab', estimate: { unit: 'session', value: 1 } },
    ],
  }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const parsed = parseRoadmapInput(lessonsToRoadmapText(r.topics[0].lessons));
  assert.equal(parsed.items.length, 3);
  assert.equal(parsed.items[0].link, 'https://example.com/overview');
  assert.equal(parsed.items[1].phase, 'Workload');
  assert.deepEqual(parsed.items[1].estimate, { unit: 'min', value: 45 });
  assert.deepEqual(parsed.items[2].estimate, { unit: 'session', value: 1 });
  assert.equal(lessonsToRoadmapText([]), '');
});

test('lesson-only imports: strings, links, lesson objects, wrappers without a topic name', () => {
  const strings = parseTopicImport(JSON.stringify(['Bài 1: Tổng quan', 'Bài 2: Cài đặt', 'https://example.com/bai-hoc/quy-khan-cap']));
  assert.equal(strings.ok, true);
  if (strings.ok) {
    assert.equal(strings.topics.length, 1);
    assert.equal(strings.topics[0].title, '', 'name left for the form');
    assert.deepEqual(strings.topics[0].lessons.map((l) => l.title), ['Bài 1: Tổng quan', 'Bài 2: Cài đặt', 'Quy khan cap']);
    assert.equal(strings.topics[0].lessons[2].url, 'https://example.com/bai-hoc/quy-khan-cap');
    assert.equal(strings.topics[0].weeklyTarget, 4);
    assert.equal(strings.topics[0].sprint, undefined);
  }
  const objs = parseTopicImport(JSON.stringify([{ title: 'Bài 1', url: 'https://example.com/1', minutes: 20 }, { name: 'Bài 2', link: 'https://example.com/2', section: 'Phần B' }, { href: 'https://example.com/ba' }]));
  assert.equal(objs.ok, true);
  if (objs.ok) {
    const l = objs.topics[0].lessons;
    assert.deepEqual(l[0].estimate, { unit: 'min', value: 20 });
    assert.equal(l[1].title, 'Bài 2');
    assert.equal(l[1].phase, 'Phần B');
    assert.equal(l[2].title, 'Ba');
  }
  const wrapped = parseTopicImport(JSON.stringify({ lessons: ['A', 'B'] }));
  assert.equal(wrapped.ok && wrapped.topics[0].lessons.length, 2);
  const single = parseTopicImport(JSON.stringify({ title: 'Bài 1', url: 'https://example.com/1' }));
  assert.equal(single.ok && single.topics[0].lessons[0].title, 'Bài 1');
  assert.match(importError(JSON.stringify({ title: '' })), /thiếu "title"/);
});

test('nested phases: [{ title, lessons }] become lessons with a phase', () => {
  const r = parseTopicImport(JSON.stringify({ title: 'Go', phases: [{ title: 'Nhập môn', lessons: ['Cài Go', { title: 'Hello', minutes: 15 }] }, { name: 'Web', lessons: ['net/http'] }] }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.topics[0].lessons.map((l) => [l.title, l.phase]), [['Cài Go', 'Nhập môn'], ['Hello', 'Nhập môn'], ['net/http', 'Web']]);
  assert.deepEqual(topicImportPreview(r.topics).lines, ['Go — 3 bài học, 2 phần']);
});

test('plain text: markdown list with headings, numbered list, bare links', () => {
  const r = parseTopicImport('# Phần 1: Nền tảng\n- Bài 1 (20m)\n- Bài 2 https://example.com/b2\n\n# Phần 2\n1. Bài 3\nhttps://example.com/bai-hoc/tong-ket-khoa\n');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.format, 'text');
  const l = r.topics[0].lessons;
  assert.deepEqual(l.map((x) => x.title), ['Bài 1', 'Bài 2', 'Bài 3', 'Tong ket khoa']);
  assert.equal(l[0].phase, 'Phần 1: Nền tảng');
  assert.deepEqual(l[0].estimate, { unit: 'min', value: 20 });
  assert.equal(l[1].url, 'https://example.com/b2');
  assert.equal(l[3].url, 'https://example.com/bai-hoc/tong-ket-khoa');
  assert.equal(l[3].phase, 'Phần 2');
  const mixed = parseTopicImport('Bài 1: Tổng quan\nBài 2: Cài đặt https://example.com/bai-2\nhttps://example.com/bai-hoc/bai-tap-dau-tien\nBài 4: Tổng kết (30m)');
  assert.equal(mixed.ok, true);
  if (mixed.ok) {
    assert.deepEqual(mixed.topics[0].lessons.map((x) => x.title), ['Bài 1: Tổng quan', 'Bài 2: Cài đặt', 'Bai tap dau tien', 'Bài 4: Tổng kết']);
    assert.equal(mixed.topics[0].lessons[1].url, 'https://example.com/bai-2');
    assert.equal(mixed.topics[0].lessons.every((x) => !x.phase), true);
  }
  const outline = parseTopicImport('Phần A\n- Bài 1\n- Bài 2\nPhần B\n- Bài 3');
  assert.equal(outline.ok && outline.topics[0].lessons[2].phase, 'Phần B');
  const csv = parseTopicImport('title,url\nBài 1,https://example.com/1\nBài 2,');
  assert.equal(csv.ok && csv.topics[0].lessons.length, 2);
  const links = parseTopicImport('https://a.example/x/bai-mot\nhttps://a.example/x/bai-hai');
  assert.equal(links.ok && links.topics[0].lessons.length, 2);
});

test('backward compatible: the tuhoctaichinh file and the minimal sample', () => {
  // Same shape as the tuhoctaichinh export: { topics: [{ title, description, tinyAction, weeklyTarget, lessons: [{ title, url, phase, estimate: { unit, value } }] }] }
  const lessons = Array.from({ length: 311 }, (_, i) => ({ title: `Bài ${i + 1}`, url: `https://example.com/bai-hoc/${i + 1}`, phase: `Chặng ${(i % 27) + 1}: Tên chặng`, estimate: { unit: 'min', value: 6 } }));
  const big = parseTopicImport(JSON.stringify({ topics: [{ title: 'Tài chính cá nhân', description: 'Mô tả', tinyAction: 'đọc 1 bài', weeklyTarget: 4, lessons }] }));
  assert.equal(big.ok, true);
  if (big.ok) {
    assert.equal(big.format, 'json');
    assert.equal(big.topics[0].title, 'Tài chính cá nhân');
    assert.equal(big.topics[0].lessons.length, 311);
    assert.equal(new Set(big.topics[0].lessons.map((l) => l.phase)).size, 27);
    assert.deepEqual(big.topics[0].lessons[0].estimate, { unit: 'min', value: 6 });
  }
  // Optional real export (not in the repo): TOPIC_IMPORT_FIXTURE=/path/to/file.json npm test
  const real = process.env.TOPIC_IMPORT_FIXTURE ?? '';
  if (existsSync(real)) {
    const r = parseTopicImport(readFileSync(real, 'utf8'));
    assert.ok(r.ok && r.topics[0].lessons.length > 0);
  }
  const min = parseTopicImport(readFileSync('docs/topic-import.minimal.json', 'utf8'));
  assert.equal(min.ok, true);
  if (min.ok) assert.ok(min.topics[0].lessons.length >= 3);
});
