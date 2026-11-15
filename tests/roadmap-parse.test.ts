import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvItems, parseJsonItems, parseOutline, parseRoadmapInput, readCsv, splitEstimate, splitLink, MAX_ITEMS } from '../src/core/roadmap-parse.js';

test('estimates: minutes, hours, sessions; ambiguous numbers stay in the title', () => {
  assert.deepEqual(splitEstimate('Bài 1 (45m)'), { text: 'Bài 1', estimate: { unit: 'min', value: 45 } });
  assert.deepEqual(splitEstimate('Bài 1 (45 phút)').estimate, { unit: 'min', value: 45 });
  assert.deepEqual(splitEstimate('Lab (1h30)').estimate, { unit: 'min', value: 90 });
  assert.deepEqual(splitEstimate('Lab (1h 30m)').estimate, { unit: 'min', value: 90 });
  assert.deepEqual(splitEstimate('Lab (1,5 giờ)').estimate, { unit: 'min', value: 90 });
  assert.deepEqual(splitEstimate('Lab (2h)').estimate, { unit: 'min', value: 120 });
  assert.deepEqual(splitEstimate('Dự án [2]').estimate, { unit: 'session', value: 2 });
  assert.deepEqual(splitEstimate('Dự án [1.5 buổi]').estimate, { unit: 'session', value: 1.5 });
  assert.deepEqual(splitEstimate('Dự án (3 buổi)').estimate, { unit: 'session', value: 3 });
  assert.deepEqual(splitEstimate('Chương (3)'), { text: 'Chương (3)' }, 'bare number in parentheses is ambiguous');
  assert.deepEqual(splitEstimate('Giới thiệu (phần mở đầu)'), { text: 'Giới thiệu (phần mở đầu)' });
  assert.deepEqual(splitEstimate('(45m)'), { text: '(45m)' }, 'an estimate alone is not an item');
});

test('links: markdown, angle brackets, trailing bare URL', () => {
  assert.deepEqual(splitLink('[Argo CD docs](https://argo-cd.readthedocs.io/) phần 1'), { text: 'Argo CD docs phần 1', link: 'https://argo-cd.readthedocs.io/' });
  assert.deepEqual(splitLink('Bài 2 <https://example.com/2>'), { text: 'Bài 2', link: 'https://example.com/2' });
  assert.deepEqual(splitLink('Bài 3 - https://example.com/3'), { text: 'Bài 3', link: 'https://example.com/3' });
  assert.deepEqual(splitLink('https://example.com'), { text: 'https://example.com' }, 'a bare URL alone stays as title');
});

test('markdown outline with headings, bullets, numbering, checkboxes and estimates', () => {
  const r = parseOutline(`# Phần 1: Nhập môn
- Bài 1: Giới thiệu (20m)
- [x] Bài 2: Cài đặt (45m)
1. Bài 3: Lệnh cơ bản [2]

## Phần 2
* Bài 4 https://example.com/4
`);
  assert.equal(r.items.length, 4);
  assert.deepEqual(r.phases, ['Phần 1: Nhập môn', 'Phần 2']);
  assert.deepEqual(r.items[0], { title: 'Bài 1: Giới thiệu', phase: 'Phần 1: Nhập môn', estimate: { unit: 'min', value: 20 }, link: undefined, done: undefined });
  assert.equal(r.items[1].done, true);
  assert.deepEqual(r.items[2].estimate, { unit: 'session', value: 2 });
  assert.equal(r.items[3].link, 'https://example.com/4');
  assert.equal(r.items[3].phase, 'Phần 2');
});

test('nested bullets become groups; their children carry "Phase · Group"', () => {
  const r = parseOutline(`# Kubernetes
- Module 1: Workloads
  - Pod (30m)
  - Deployment
- Module 2
\t- Service
- Ôn tập`);
  assert.deepEqual(r.items.map((i) => [i.title, i.phase]), [
    ['Pod', 'Kubernetes · Module 1: Workloads'],
    ['Deployment', 'Kubernetes · Module 1: Workloads'],
    ['Service', 'Kubernetes · Module 2'],
    ['Ôn tập', 'Kubernetes'],
  ]);
});

test('plain lines: each line is an item when there are no list markers; otherwise unindented lines are phases', () => {
  const plain = parseOutline('Chương 1\nChương 2\r\n\nChương 3');
  assert.deepEqual(plain.items.map((i) => i.title), ['Chương 1', 'Chương 2', 'Chương 3']);
  assert.equal(plain.phases.length, 0);
  const mixed = parseOutline('Section 1: Basics\n- Lesson 1\n- Lesson 2\nSection 2: Advanced:\n- Lesson 3');
  assert.deepEqual(mixed.phases, ['Section 1: Basics', 'Section 2: Advanced']);
  assert.equal(mixed.items.length, 3);
});

test('limits: horizontal rules and empty bullets are skipped, long lists are truncated', () => {
  const r = parseOutline('- a\n---\n- \n-  [ ]  \n- b');
  assert.deepEqual(r.items.map((i) => i.title), ['a', 'b']);
  const many = parseOutline(Array.from({ length: MAX_ITEMS + 5 }, (_, i) => `- Bài ${i + 1}`).join('\n'));
  assert.equal(many.items.length, MAX_ITEMS);
  assert.equal(many.truncated, true);
  assert.equal(many.warnings.length, 1);
});

test('JSON: array or {items}, strings, minutes/sessions, invalid links dropped', () => {
  const r = parseJsonItems(JSON.stringify({ items: [{ title: 'A', phase: 'P1', minutes: 30, link: 'https://x.example' }, 'B', { name: 'C', sessions: 2, done: true }, { title: '' }, { title: 'D', link: 'javascript:alert(1)' }] }));
  assert.equal(r.items.length, 4);
  assert.equal(r.skipped, 1);
  assert.deepEqual(r.items[0], { title: 'A', phase: 'P1', estimate: { unit: 'min', value: 30 }, link: 'https://x.example', done: undefined });
  assert.deepEqual(r.items[2].estimate, { unit: 'session', value: 2 });
  assert.equal(r.items[2].done, true);
  assert.equal(r.items[3].link, undefined);
  assert.throws(() => parseJsonItems('{"x":1}'), /items/);
  assert.throws(() => parseRoadmapInput('[{"title": "A",]'), /JSON/);
});

test('CSV: header row, quotes, semicolons, Vietnamese headers', () => {
  assert.deepEqual(readCsv('a,"b, c","say ""hi"""\n1,2,3'), [['a', 'b, c', 'say "hi"'], ['1', '2', '3']]);
  const r = parseRoadmapInput('title,phase,minutes,link\n"Bài 1, phần mở đầu",P1,30,\nBài 2,P1,,https://e.example/2\n');
  assert.equal(r.format, 'csv');
  assert.deepEqual(r.items.map((i) => [i.title, i.phase, i.estimate?.value, i.link]), [['Bài 1, phần mở đầu', 'P1', 30, undefined], ['Bài 2', 'P1', undefined, 'https://e.example/2']]);
  const vi = parseCsvItems('tên;phần;buổi\nChương 1;Sách;2\n');
  assert.deepEqual(vi.items[0], { title: 'Chương 1', phase: 'Sách', estimate: { unit: 'session', value: 2 }, link: undefined, done: undefined });
  assert.throws(() => parseCsvItems('x,y\n1,2'), /title/);
});

test('format detection', () => {
  assert.equal(parseRoadmapInput('[]').format, 'json');
  assert.equal(parseRoadmapInput('title,phase\nA,B').format, 'csv');
  assert.equal(parseRoadmapInput('Bài 1, Bài 2').format, 'text', 'a comma in a normal line is not CSV');
  assert.equal(parseRoadmapInput('   ').items.length, 0);
});
