import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNoteHtml, noteBlock } from '../src/core/notes.js';

test('formatNoteHtml escapes HTML and keeps paragraphs, blank lines and lists', () => {
  assert.equal(formatNoteHtml(''), '');
  assert.equal(formatNoteHtml('   '), '');
  const html = formatNoteHtml('Đã làm xong phần 1.\n\n- Công thức: E = mc^2\n- Lệnh: kubectl get pods\n\nNhớ hỏi lại về <script>alert(1)</script> & "quotes".\n\n1. Bước một\n2. Bước hai');
  assert.match(html, /<p>Đã làm xong phần 1\.<\/p>/);
  assert.match(html, /<div class="note-gap"><\/div>/);
  assert.match(html, /<ul><li>Công thức: E = mc\^2<\/li><li>Lệnh: kubectl get pods<\/li><\/ul>/);
  assert.match(html, /<ol><li>Bước một<\/li><li>Bước hai<\/li><\/ol>/);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&amp;'));
  assert.ok(html.includes('&quot;quotes&quot;'));
  assert.ok(!html.includes('<script>'));
  assert.equal(formatNoteHtml('- <img src=x onerror=alert(1)>'), '<ul><li>&lt;img src=x onerror=alert(1)&gt;</li></ul>');
});

test('noteBlock wraps non-empty notes and stays empty when there is no text', () => {
  assert.equal(noteBlock(''), '');
  assert.equal(noteBlock(undefined), '');
  const block = noteBlock('Một dòng');
  assert.match(block, /data-clip/);
  assert.match(block, /<p>Một dòng<\/p>/);
  assert.ok(!block.includes('<script>'));
});

test('CRLF and trailing newlines do not leak empty paragraphs', () => {
  const html = formatNoteHtml('A\r\n\r\n- b\r\n');
  assert.equal(html, '<p>A</p><div class="note-gap"></div><ul><li>b</li></ul>');
});
