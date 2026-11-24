// Parse a topic (or a list of topics) plus lesson lists from JSON. This is only for the "add topic"
// flow; it is not the Settings backup import and not the per-track syllabus paste.
import { looksLikeCsv, parseRoadmapInput, type ParseOutcome } from './roadmap-parse.js';
import type { Day, Estimate, Track } from './types.js';

export const MAX_TOPICS = 50;
export const MAX_LESSONS = 500;
export const TOPIC_TITLE_MAX = 120;
export const LESSON_TITLE_MAX = 300;

export interface ImportedLesson {
  title: string;
  url?: string;
  phase?: string;
  estimate?: Estimate;
}

export interface ImportedSprintPrefill {
  title: string;
  deliverable: string;
  start?: string;
  weeks?: number;
  milestones: string[];
}

export interface ImportedTopic {
  title: string;
  description: string;
  tinyAction: string;
  plan: string;
  color?: string;
  weeklyTarget: number;
  restDays: number[];
  lessons: ImportedLesson[];
  sprint?: ImportedSprintPrefill;
}

export type TopicImportResult =
  | { ok: true; topics: ImportedTopic[]; format: 'json' | 'text' }
  | { ok: false; error: string };

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function looksLikeBackup(v: unknown): boolean {
  return isRecord(v) && v.app === 'nhip' && Array.isArray(v.tracks);
}

function parseEstimate(raw: unknown, where: string): { ok: true; value?: Estimate } | { ok: false; error: string } {
  if (raw == null || raw === '') return { ok: true };
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0 || raw > 24 * 60) {
      return { ok: false, error: `${where}: estimate tính bằng phút phải là số từ 1 đến 1440.` };
    }
    return { ok: true, value: { unit: 'min', value: Math.round(raw) } };
  }
  if (!isRecord(raw)) return { ok: false, error: `${where}: estimate phải là số phút hoặc { "unit": "min"|"session", "value": số }.` };
  const unit = raw.unit;
  const value = raw.value;
  if ((unit !== 'min' && unit !== 'session') || typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return { ok: false, error: `${where}: estimate.unit phải là "min" hoặc "session", estimate.value phải là số dương.` };
  }
  if (unit === 'min' && value > 24 * 60) return { ok: false, error: `${where}: estimate phút không được lớn hơn 1440.` };
  if (unit === 'session' && value > 100) return { ok: false, error: `${where}: estimate buổi không được lớn hơn 100.` };
  return { ok: true, value: { unit, value: unit === 'min' ? Math.round(value) : Math.round(value * 10) / 10 } };
}

/** A readable title from a lesson URL: the last path segment with dashes turned into spaces, else the host. */
export function titleFromUrl(u: string): string {
  try {
    const url = new URL(u);
    const seg = url.pathname.split('/').filter(Boolean).pop() ?? '';
    let t = decodeURIComponent(seg).replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_+]+/g, ' ').trim();
    if (!t) t = url.hostname.replace(/^www\./, '');
    return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, LESSON_TITLE_MAX);
  } catch {
    return u.slice(0, LESSON_TITLE_MAX);
  }
}

const firstStr = (o: Record<string, unknown>, keys: string[]): string => {
  for (const k of keys) { const v = str(o[k]); if (v && v.trim()) return v.trim(); }
  return '';
};

/**
 * A lesson is a string ("Bài 1", or just a URL) or an object. Only a title or a URL is needed; aliases:
 * title|name|text|label, url|link|href, phase|section|module|chapter, estimate|minutes|duration|sessions.
 */
function parseLesson(raw: unknown, where: string, phase?: string): { ok: true; lesson: ImportedLesson } | { ok: false; error: string } {
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return { ok: false, error: `${where} đang trống.` };
    if (isHttpUrl(t)) return { ok: true, lesson: { title: titleFromUrl(t), url: t, phase } };
    return { ok: true, lesson: { title: t.slice(0, LESSON_TITLE_MAX), phase } };
  }
  if (!isRecord(raw)) return { ok: false, error: `${where} phải là chuỗi (tên bài hoặc link) hoặc object, ví dụ { "title": "Bài 1", "url": "https://..." }.` };
  const urlRaw = firstStr(raw, ['url', 'link', 'href']);
  if (urlRaw && !isHttpUrl(urlRaw)) {
    return { ok: false, error: `${where}: url phải bắt đầu bằng http:// hoặc https://.` };
  }
  let title = firstStr(raw, ['title', 'name', 'text', 'label']);
  if (!title && urlRaw) title = titleFromUrl(urlRaw);
  if (!title) return { ok: false, error: `${where} thiếu "title" (hoặc "url").` };
  if (title.length > LESSON_TITLE_MAX) return { ok: false, error: `${where}: title dài hơn ${LESSON_TITLE_MAX} ký tự.` };
  const ph = firstStr(raw, ['phase', 'section', 'module', 'chapter']) || phase || undefined;
  let estRaw: unknown = raw.estimate;
  if (estRaw == null && raw.minutes != null) estRaw = raw.minutes;
  if (estRaw == null && raw.duration != null) estRaw = raw.duration;
  if (estRaw == null && typeof raw.sessions === 'number') estRaw = { unit: 'session', value: raw.sessions };
  const est = parseEstimate(estRaw, where);
  if (!est.ok) return est;
  return { ok: true, lesson: { title: title.slice(0, LESSON_TITLE_MAX), url: urlRaw || undefined, phase: ph, estimate: est.value } };
}

/** Lessons from a flat list, or from phases: [{ "title": "Phần 1", "lessons": [...] }]. */
function parseLessonList(raw: Record<string, unknown>, where: string): { ok: true; value: ImportedLesson[] } | { ok: false; error: string } {
  const out: ImportedLesson[] = [];
  const flat = raw.lessons ?? raw.items;
  if (flat != null && !Array.isArray(flat)) return { ok: false, error: `${where}: "lessons" phải là một mảng.` };
  const phases = raw.phases ?? raw.sections ?? raw.modules;
  if (phases != null && !Array.isArray(phases)) return { ok: false, error: `${where}: "phases" phải là một mảng, mỗi phần có "title" và "lessons".` };
  if (Array.isArray(phases)) {
    for (let p = 0; p < phases.length; p++) {
      const ph = phases[p];
      if (!isRecord(ph)) return { ok: false, error: `${where}, phần thứ ${p + 1} phải là object { "title": "...", "lessons": [...] }.` };
      const name = firstStr(ph, ['title', 'name', 'phase']) || `Phần ${p + 1}`;
      const list = ph.lessons ?? ph.items;
      if (!Array.isArray(list)) return { ok: false, error: `${where}, phần "${name}": "lessons" phải là một mảng.` };
      for (let i = 0; i < list.length; i++) {
        const l = parseLesson(list[i], `${where}, phần "${name}", bài thứ ${i + 1}`, name.slice(0, 200));
        if (!l.ok) return l;
        out.push(l.lesson);
      }
    }
  }
  if (Array.isArray(flat)) {
    for (let i = 0; i < flat.length; i++) {
      const l = parseLesson(flat[i], `${where}, bài học thứ ${i + 1}`);
      if (!l.ok) return l;
      out.push(l.lesson);
    }
  }
  if (out.length > MAX_LESSONS) return { ok: false, error: `${where}: mỗi topic tối đa ${MAX_LESSONS} bài học.` };
  return { ok: true, value: out };
}

function parseRestDays(raw: unknown, where: string): { ok: true; value: number[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: `${where}: restDays phải là mảng số 0-6 (0 là Chủ nhật).` };
  const out: number[] = [];
  for (const n of raw) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 6) {
      return { ok: false, error: `${where}: restDays chỉ gồm số nguyên từ 0 đến 6 (0 là Chủ nhật).` };
    }
    if (!out.includes(n)) out.push(n);
  }
  return { ok: true, value: out };
}


const DAY = /^\d{4}-\d{2}-\d{2}$/;

function parseMilestones(raw: unknown, where: string): { ok: true; value: string[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: [] };
  if (typeof raw === 'string') {
    return { ok: true, value: raw.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 12) };
  }
  if (!Array.isArray(raw)) return { ok: false, error: `${where}: milestones phải là mảng, mỗi phần tử là chuỗi hoặc { "text": "..." }.` };
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const text = typeof item === 'string' ? item.trim() : isRecord(item) ? (str(item.text) ?? str(item.title) ?? '').trim() : '';
    if (!text) return { ok: false, error: `${where}, milestone thứ ${i + 1} thiếu nội dung.` };
    out.push(text.slice(0, 300));
  }
  return { ok: true, value: out.slice(0, 12) };
}

function parseSprintPrefill(raw: Record<string, unknown>, where: string): { ok: true; value?: ImportedSprintPrefill } | { ok: false; error: string } {
  const extra = isRecord(raw.sprint) ? raw.sprint : {};
  const title = (str(extra.title) ?? str(raw.sprintTitle) ?? (typeof raw.sprint === 'string' ? raw.sprint : '') ?? '').trim().slice(0, 200);
  const deliverable = (str(extra.deliverable) ?? str(raw.deliverable) ?? '').trim().slice(0, 500);
  const startRaw = (str(extra.start) ?? str(extra.startDate) ?? str(raw.start) ?? str(raw.startDate) ?? '').trim();
  const weeksRaw = extra.weeks ?? raw.weeks;
  const msRaw = extra.milestones ?? raw.milestones;
  if (!title && !deliverable && !startRaw && weeksRaw == null && msRaw == null) return { ok: true };
  if (startRaw && !DAY.test(startRaw)) return { ok: false, error: `${where}: start phải có dạng YYYY-MM-DD.` };
  let weeks: number | undefined;
  if (weeksRaw != null) {
    if (weeksRaw !== 2 && weeksRaw !== 3 && weeksRaw !== 4) {
      return { ok: false, error: `${where}: weeks phải là 2, 3 hoặc 4.` };
    }
    weeks = weeksRaw;
  }
  const ms = parseMilestones(msRaw, where);
  if (!ms.ok) return ms;
  return { ok: true, value: { title, deliverable, start: startRaw || undefined, weeks, milestones: ms.value } };
}

function parseTopic(raw: unknown, where: string): { ok: true; topic: ImportedTopic } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: `${where} phải là một object topic, ví dụ { "title": "...", "lessons": [...] }.` };
  const title = (str(raw.title) ?? str(raw.name) ?? '').trim();
  if (title.length > TOPIC_TITLE_MAX) return { ok: false, error: `${where}: title dài hơn ${TOPIC_TITLE_MAX} ký tự.` };
  const weeklyRaw = raw.weeklyTarget;
  let weeklyTarget = 4;
  if (weeklyRaw != null) {
    if (typeof weeklyRaw !== 'number' || !Number.isInteger(weeklyRaw) || weeklyRaw < 1 || weeklyRaw > 7) {
      return { ok: false, error: `${where}: weeklyTarget phải là số nguyên từ 1 đến 7.` };
    }
    weeklyTarget = weeklyRaw;
  }
  const rest = parseRestDays(raw.restDays, where);
  if (!rest.ok) return rest;
  if (weeklyTarget > 7 - rest.value.length) {
    return { ok: false, error: `${where}: với ${rest.value.length} ngày nghỉ, weeklyTarget tối đa là ${7 - rest.value.length}.` };
  }
  const colorRaw = (str(raw.color) ?? '').trim();
  if (colorRaw && !HEX.test(colorRaw)) return { ok: false, error: `${where}: color phải là mã hex, ví dụ #2f5bea.` };
  const parsedLessons = parseLessonList(raw, where);
  if (!parsedLessons.ok) return parsedLessons;
  const lessons = parsedLessons.value;
  // The name is optional when there are lessons: the form asks for it before saving.
  if (!title && !lessons.length) return { ok: false, error: `${where} thiếu "title" (hoặc "name") và chưa có bài học nào.` };
  const sprint = parseSprintPrefill(raw, where);
  if (!sprint.ok) return sprint;
  return {
    ok: true,
    topic: {
      title: title.slice(0, TOPIC_TITLE_MAX),
      description: (str(raw.description) ?? str(raw.why) ?? '').trim(),
      tinyAction: (str(raw.tinyAction) ?? '').trim(),
      plan: (str(raw.plan) ?? '').trim(),
      color: colorRaw || undefined,
      weeklyTarget,
      restDays: rest.value,
      lessons,
      sprint: sprint.value,
    },
  };
}

const TOPIC_KEYS = ['lessons', 'items', 'phases', 'sections', 'modules', 'weeklyTarget', 'tinyAction', 'restDays', 'sprint', 'description', 'why'];
const isTopicLike = (v: unknown) => isRecord(v) && TOPIC_KEYS.some((k) => k in v);

function unwrap(data: unknown): { ok: true; list: unknown[] } | { ok: false; error: string } {
  if (Array.isArray(data)) {
    // A plain list (strings, or objects that are not topics) is the lesson list of one unnamed topic.
    if (data.length && !data.some(isTopicLike)) return { ok: true, list: [{ lessons: data }] };
    return { ok: true, list: data };
  }
  if (!isRecord(data)) {
    return { ok: false, error: 'JSON phải là một object topic, một mảng các topic, hoặc { "topics": [ ... ] }.' };
  }
  if (looksLikeBackup(data)) {
    return { ok: false, error: 'Đây là file sao lưu của app, không phải danh sách topic. Hãy khôi phục file này ở mục Cài đặt.' };
  }
  if (Array.isArray(data.topics)) return { ok: true, list: data.topics };
  if (isRecord(data.topic)) return { ok: true, list: [data.topic] };
  // A single topic object (with or without lessons). An empty title still counts, so parseTopic can explain.
  // A single { title, url } without topic fields is one lesson.
  if (!isTopicLike(data) && typeof (data.url ?? data.link ?? data.href) === 'string') return { ok: true, list: [{ lessons: [data] }] };
  if ('title' in data || 'name' in data || isTopicLike(data)) {
    return { ok: true, list: [data] };
  }
  return { ok: false, error: 'JSON phải là một object topic, một mảng các topic, hoặc { "topics": [ ... ] }. Mỗi topic cần có "title".' };
}

/** Parse and validate topic-import JSON. Never throws. */
export function parseTopicImport(text: string): TopicImportResult {
  const raw = text.trim();
  if (!raw) return { ok: false, error: 'Chưa có nội dung. Hãy dán danh sách bài học (JSON, mỗi dòng một bài, hoặc danh sách link) hoặc chọn file.' };
  if (!/^[[{]/.test(raw)) return parseLessonText(raw);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'JSON không hợp lệ. Kiểm tra lại dấu ngoặc, dấu phẩy và dấu ngoặc kép.' };
  }
  const wrapped = unwrap(data);
  if (!wrapped.ok) return wrapped;
  if (!wrapped.list.length) return { ok: false, error: 'Danh sách topic đang trống.' };
  if (wrapped.list.length > MAX_TOPICS) return { ok: false, error: `Mỗi lần import tối đa ${MAX_TOPICS} topic.` };
  const topics: ImportedTopic[] = [];
  for (let i = 0; i < wrapped.list.length; i++) {
    const where = wrapped.list.length === 1 ? 'Topic' : `Topic thứ ${i + 1}`;
    const t = parseTopic(wrapped.list[i], where);
    if (!t.ok) return t;
    topics.push(t.topic);
  }
  return { ok: true, topics, format: 'json' };
}

/**
 * Plain text: a Markdown or numbered list, one lesson per line, headings as phases, CSV, or bare links.
 * A line that is only a URL becomes a lesson named after the URL (the roadmap parser would read it as a heading).
 */
export function parseLessonText(text: string): TopicImportResult {
  if (looksLikeCsv(text)) return fromOutline(text);
  const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+/;
  const raw = text.split(/\r?\n/);
  // A plain list (no bullets anywhere) is one lesson per line; only "#" lines are phase names then.
  const plain = !raw.some((l) => BULLET.test(l) && !isHttpUrl(l.replace(BULLET, '').trim()));
  const lines = raw.map((l) => {
    const t = l.trim().replace(BULLET, '');
    if (isHttpUrl(t)) return `- ${titleFromUrl(t)} ${t}`;
    if (!t || t.startsWith('#') || BULLET.test(l)) return l;
    // A plain line that carries a link is a lesson, not a heading.
    return plain || /https?:\/\//.test(t) ? `- ${t}` : l;
  });
  return fromOutline(lines.join('\n'));
}

function fromOutline(text: string): TopicImportResult {
  let r: ParseOutcome;
  try {
    r = parseRoadmapInput(text);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!r.items.length) return { ok: false, error: 'Chưa nhận ra bài học nào. Mỗi dòng một bài, có thể kèm link; dòng bắt đầu bằng # là tên phần.' };
  if (r.items.length > MAX_LESSONS) return { ok: false, error: `Mỗi topic tối đa ${MAX_LESSONS} bài học.` };
  const lessons: ImportedLesson[] = r.items.map((i) => ({ title: i.title.slice(0, LESSON_TITLE_MAX), url: i.link, phase: i.phase, estimate: i.estimate }));
  return { ok: true, format: 'text', topics: [{ title: '', description: '', tinyAction: '', plan: '', weeklyTarget: 4, restDays: [], lessons }] };
}

export function topicImportPreview(topics: ImportedTopic[]): { topicCount: number; lessonCount: number; lines: string[] } {
  const lessonCount = topics.reduce((n, t) => n + t.lessons.length, 0);
  const lines = topics.map((t) => {
    const n = t.lessons.length;
    const phases = new Set(t.lessons.map((l) => l.phase).filter(Boolean)).size;
    const name = t.title || 'Topic chưa đặt tên';
    return n ? `${name} — ${n} bài học${phases ? `, ${phases} phần` : ''}` : `${name} — chưa có bài học`;
  });
  return { topicCount: topics.length, lessonCount, lines };
}

export function trackFromImport(topic: ImportedTopic, opts: { id: string; color: string; createdAt: Day }): Track {
  return {
    id: opts.id,
    name: topic.title,
    color: topic.color ?? opts.color,
    why: topic.description,
    tinyAction: topic.tinyAction || 'học 10 phút',
    plan: topic.plan,
    weeklyTarget: topic.weeklyTarget,
    restDays: topic.restDays,
    nextStep: '',
    pauses: [],
    archived: false,
    createdAt: opts.createdAt,
  };
}

export function lessonsToParseOutcome(lessons: ImportedLesson[]): ParseOutcome {
  const phases = [...new Set(lessons.map((l) => l.phase).filter((x): x is string => !!x))];
  return {
    format: 'json',
    items: lessons.map((l) => ({ title: l.title, phase: l.phase, estimate: l.estimate, link: l.url })),
    phases,
    skipped: 0,
    truncated: false,
    warnings: [],
  };
}

/** JSON the existing new-topic roadmap box already understands (parseRoadmapInput). */
export function lessonsToRoadmapText(lessons: ImportedLesson[]): string {
  if (!lessons.length) return '';
  return JSON.stringify(lessons.map((l) => {
    const o: Record<string, unknown> = { title: l.title };
    if (l.url) o.link = l.url;
    if (l.phase) o.phase = l.phase;
    if (l.estimate?.unit === 'min') o.minutes = l.estimate.value;
    else if (l.estimate?.unit === 'session') o.sessions = l.estimate.value;
    return o;
  }), null, 2);
}
