// Turns pasted text (a syllabus, a course outline, Markdown notes), JSON or CSV into roadmap item drafts.
// Pure functions; the UI shows the result as a preview before anything is saved.
import type { Estimate } from './types.js';

export interface DraftItem {
  title: string;
  phase?: string;
  estimate?: Estimate;
  link?: string;
  done?: boolean;
}

export type SourceFormat = 'text' | 'json' | 'csv';

export interface ParseOutcome {
  format: SourceFormat;
  items: DraftItem[];
  phases: string[];
  skipped: number; // lines or records that could not become an item
  truncated: boolean; // more than MAX_ITEMS were found
  warnings: string[];
}

export const MAX_ITEMS = 500;
const TITLE_MAX = 300;

const BULLET = /^(?:[-*+•–]|\d{1,3}[.)]|[a-zA-Z][.)])\s+/;
const CHECKBOX = /^\[( |x|X)\](?:\s+|$)/;
const HEADING = /^#{1,6}\s+(.*)$/;

/** Parses a trailing "(45m)", "(1h30)", "(1.5 giờ)", "[2]", "[2 buổi]" estimate. Returns the rest of the text. */
export function splitEstimate(text: string): { text: string; estimate?: Estimate } {
  const m = /\s*(?:\(([^()]*)\)|\[([^\[\]]*)\])\s*$/.exec(text);
  if (!m) return { text };
  const inner = (m[1] ?? m[2] ?? '').trim().toLowerCase();
  const est = parseEstimate(inner, m[2] !== undefined);
  if (!est) return { text };
  const rest = text.slice(0, m.index).trim();
  return rest ? { text: rest, estimate: est } : { text };
}

function parseEstimate(s: string, bracket: boolean): Estimate | undefined {
  if (!s) return undefined;
  const num = (x: string) => Number(x.replace(',', '.'));
  const ses = /^(\d+(?:[.,]\d+)?)\s*(buổi|buoi|sessions?|ses)?$/.exec(s);
  if (ses && (ses[2] || bracket)) {
    const v = num(ses[1]);
    return v > 0 && v <= 100 ? { unit: 'session', value: round1(v) } : undefined;
  }
  const hm = /^(?:(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hours?|giờ|gio|tiếng)\s*)?(?:(\d+)\s*(m|min|mins|minutes?|phút|phut|p|')?)?$/.exec(s);
  if (!hm || (!hm[1] && !hm[2])) return undefined;
  if (!hm[1] && !hm[3]) return undefined; // a bare "(3)" is ambiguous; keep it as part of the title
  const mins = Math.round(num(hm[1] ?? '0') * 60 + Number(hm[2] ?? 0));
  return mins > 0 && mins <= 24 * 60 ? { unit: 'min', value: mins } : undefined;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Pulls a Markdown link "[title](url)", "<url>" or a trailing bare URL out of a line. */
export function splitLink(text: string): { text: string; link?: string } {
  const md = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/.exec(text);
  if (md) {
    const t = (text.slice(0, md.index) + md[1] + text.slice(md.index + md[0].length)).trim();
    return { text: t, link: md[2] };
  }
  const angle = /\s*<(https?:\/\/[^\s>]+)>\s*/.exec(text);
  if (angle) return { text: (text.slice(0, angle.index) + ' ' + text.slice(angle.index + angle[0].length)).trim(), link: angle[1] };
  const bare = /(?:\s+[-–:|]\s*|\s+)?(https?:\/\/\S+)\s*$/.exec(text);
  if (bare && bare.index > 0) return { text: text.slice(0, bare.index).trim(), link: bare[1] };
  return { text };
}

const clean = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);

interface Line { indent: number; kind: 'heading' | 'bullet' | 'plain'; text: string; done?: boolean }

function lex(text: string): Line[] {
  const out: Line[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!raw.trim()) continue;
    const expanded = raw.replace(/\t/g, '    ');
    const indent = expanded.length - expanded.trimStart().length;
    let t = expanded.trim();
    const h = HEADING.exec(t);
    if (h) { out.push({ indent, kind: 'heading', text: h[1].replace(/#+\s*$/, '') }); continue; }
    if (/^([-*_])\1{2,}$/.test(t)) continue; // horizontal rule
    const b = BULLET.exec(t);
    let kind: Line['kind'] = 'plain';
    if (b) { t = t.slice(b[0].length); kind = 'bullet'; }
    let done: boolean | undefined;
    const c = CHECKBOX.exec(t);
    if (c) { done = c[1] !== ' '; t = t.slice(c[0].length); kind = 'bullet'; }
    out.push({ indent, kind, text: t, done });
  }
  return out;
}

/**
 * Plain text and Markdown. Rules (shown to the user next to the preview):
 * - "# Heading" starts a phase.
 * - When the text has list items ("-", "*", "1.", "a)"), an unindented line without a marker is also a phase.
 *   Without any list items, every line is an item.
 * - A list item with indented sub-items becomes a group: its sub-items get the phase "Phase · Group".
 * - Trailing "(45m)", "(1h30)", "[2]" are estimates; "- [x]" marks an item done; links are kept.
 */
export function parseOutline(text: string): ParseOutcome {
  const lines = lex(text);
  const hasBullets = lines.some((l) => l.kind === 'bullet');
  const items: DraftItem[] = [];
  const phases: string[] = [];
  let skipped = 0;
  let phase: string | undefined;
  let truncated = false;
  const addPhase = (p: string | undefined) => { if (p && !phases.includes(p)) phases.push(p); };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const isPhase = l.kind === 'heading' || (hasBullets && l.kind === 'plain' && l.indent === 0);
    if (isPhase) {
      const p = clean(splitEstimate(splitLink(l.text.replace(/:\s*$/, '')).text).text);
      phase = p || phase;
      continue;
    }
    // A list item followed by deeper-indented items is a group, not an item.
    const next = lines[i + 1];
    if (l.kind === 'bullet' && next && next.kind !== 'heading' && next.indent > l.indent) {
      const group = clean(splitEstimate(splitLink(l.text.replace(/:\s*$/, '')).text).text);
      const groupPhase = group ? (phase ? `${phase} · ${group}` : group) : phase;
      let j = i + 1;
      for (; j < lines.length && lines[j].kind !== 'heading' && lines[j].indent > l.indent; j++) {
        if (!push(lines[j], groupPhase)) break;
      }
      i = j - 1;
      continue;
    }
    if (!push(l, phase)) break;
  }
  function push(l: Line, p: string | undefined): boolean {
    if (items.length >= MAX_ITEMS) { truncated = true; return false; }
    const { text: t1, link } = splitLink(l.text);
    const { text: t2, estimate } = splitEstimate(t1);
    const title = clean(t2);
    if (!title) { skipped++; return true; }
    addPhase(p);
    items.push({ title, phase: p, estimate, link, done: l.done || undefined });
    return true;
  }
  const warnings: string[] = [];
  if (truncated) warnings.push(`Chỉ lấy ${MAX_ITEMS} mục đầu tiên.`);
  return { format: 'text', items, phases, skipped, truncated, warnings };
}

function draftFromRecord(o: Record<string, unknown>): DraftItem | null {
  const pick = (...keys: string[]) => {
    for (const k of Object.keys(o)) if (keys.includes(k.trim().toLowerCase())) return o[k];
    return undefined;
  };
  const title = clean(String(pick('title', 'name', 'tên', 'ten', 'bài', 'bai', 'lesson', 'item') ?? ''));
  if (!title) return null;
  const phaseRaw = pick('phase', 'section', 'module', 'phần', 'phan', 'chương', 'chuong');
  const phase = typeof phaseRaw === 'string' || typeof phaseRaw === 'number' ? clean(String(phaseRaw)) || undefined : undefined;
  const n = (v: unknown) => {
    const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN;
    return Number.isFinite(x) && x > 0 ? x : undefined;
  };
  const mins = n(pick('minutes', 'min', 'phút', 'phut'));
  const ses = n(pick('sessions', 'session', 'buổi', 'buoi'));
  const estRaw = pick('estimate', 'ước lượng', 'uoc luong');
  let estimate: Estimate | undefined;
  if (mins && mins <= 1440) estimate = { unit: 'min', value: Math.round(mins) };
  else if (ses && ses <= 100) estimate = { unit: 'session', value: round1(ses) };
  else if (typeof estRaw === 'string') estimate = splitEstimate(`x (${estRaw})`).estimate;
  const linkRaw = pick('link', 'url', 'href');
  const link = typeof linkRaw === 'string' && /^https?:\/\//i.test(linkRaw.trim()) ? linkRaw.trim().slice(0, 2000) : undefined;
  const doneRaw = pick('done', 'xong', 'completed');
  const done = doneRaw === true || (typeof doneRaw === 'string' && /^(true|x|1|yes|có|xong)$/i.test(doneRaw.trim())) || doneRaw === 1;
  return { title, phase, estimate, link, done: done || undefined };
}

/** JSON: an array of items, or { items: [...] }. Each item: { title, phase?, minutes? | sessions?, link?, done? }. */
export function parseJsonItems(text: string): ParseOutcome {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('Nội dung trông như JSON nhưng không đọc được. Hãy kiểm tra dấu ngoặc và dấu phẩy.'); }
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : null;
  if (!list) throw new Error('JSON cần là một danh sách mục, hoặc một object có trường "items".');
  return fromRecords('json', list.map((v) => (typeof v === 'string' ? { title: v } : v)));
}

function fromRecords(format: SourceFormat, list: unknown[]): ParseOutcome {
  const items: DraftItem[] = [];
  let skipped = 0;
  let truncated = false;
  for (const v of list) {
    if (items.length >= MAX_ITEMS) { truncated = true; break; }
    const d = v && typeof v === 'object' ? draftFromRecord(v as Record<string, unknown>) : null;
    if (d) items.push(d); else skipped++;
  }
  const phases = [...new Set(items.map((i) => i.phase).filter((p): p is string => !!p))];
  return { format, items, phases, skipped, truncated, warnings: truncated ? [`Chỉ lấy ${MAX_ITEMS} mục đầu tiên.`] : [] };
}

/** Minimal RFC 4180 style CSV reader: commas or semicolons, quoted fields, doubled quotes. */
export function readCsv(text: string): string[][] {
  const src = text.replace(/\r\n?/g, '\n');
  const firstLine = src.split('\n', 1)[0];
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const CSV_TITLE = /^(title|name|tên|ten|bài|bai|lesson|item)$/i;

/** CSV with a header row; needs a "title" (or "tên") column. Optional: phase, minutes, sessions, link, done. */
export function parseCsvItems(text: string): ParseOutcome {
  const rows = readCsv(text);
  if (!rows.length) return fromRecords('csv', []);
  const head = rows[0].map((h) => h.trim());
  if (!head.some((h) => CSV_TITLE.test(h))) throw new Error('CSV cần dòng tiêu đề có cột "title" hoặc "tên".');
  return fromRecords('csv', rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()]))));
}

export function looksLikeCsv(text: string): boolean {
  const first = text.trim().split(/\r?\n/, 1)[0] ?? '';
  return /[,;\t]/.test(first) && first.split(/[,;\t]/).some((h) => CSV_TITLE.test(h.trim().replace(/^"|"$/g, '')));
}

/** Detects the format and parses. Throws a Vietnamese message for unreadable JSON or CSV. */
export function parseRoadmapInput(text: string): ParseOutcome {
  const t = text.trim();
  if (!t) return { format: 'text', items: [], phases: [], skipped: 0, truncated: false, warnings: [] };
  if (t.startsWith('[') || t.startsWith('{')) return parseJsonItems(t);
  if (looksLikeCsv(t)) return parseCsvItems(t);
  return parseOutline(t);
}
