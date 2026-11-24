// Parse a topic (or a list of topics) plus lesson lists from JSON. This is only for the "add topic"
// flow; it is not the Settings backup import and not the per-track syllabus paste.
import type { ParseOutcome } from './roadmap-parse.js';
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
  | { ok: true; topics: ImportedTopic[] }
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

function looksLikeLesson(v: Record<string, unknown>): boolean {
  const hasLessonList = Array.isArray(v.lessons) || Array.isArray(v.items);
  const hasUrl = typeof (v.url ?? v.link) === 'string' && String(v.url ?? v.link).trim() !== '';
  return !hasLessonList && hasUrl;
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

function parseLesson(raw: unknown, where: string): { ok: true; lesson: ImportedLesson } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: `${where} phải là một object, ví dụ { "title": "Bài 1", "url": "https://..." }.` };
  const title = (str(raw.title) ?? '').trim();
  if (!title) return { ok: false, error: `${where} thiếu "title".` };
  if (title.length > LESSON_TITLE_MAX) return { ok: false, error: `${where}: title dài hơn ${LESSON_TITLE_MAX} ký tự.` };
  const urlRaw = (str(raw.url) ?? str(raw.link) ?? '').trim();
  if (urlRaw && !isHttpUrl(urlRaw)) {
    return { ok: false, error: `${where}: url phải bắt đầu bằng http:// hoặc https://.` };
  }
  const phase = (str(raw.phase) ?? '').trim() || undefined;
  const est = parseEstimate(raw.estimate, where);
  if (!est.ok) return est;
  return { ok: true, lesson: { title: title.slice(0, LESSON_TITLE_MAX), url: urlRaw || undefined, phase, estimate: est.value } };
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
  if (!title) return { ok: false, error: `${where} thiếu "title" (hoặc "name").` };
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
  const lessonsRaw = raw.lessons ?? raw.items;
  if (lessonsRaw == null) {
    // A bare { title, url } in a list is almost certainly a lesson, not a topic.
    if (looksLikeLesson(raw)) {
      return {
        ok: false,
        error: `${where} trông giống một bài học (có url/link, không có lessons). Hãy bọc danh sách bài trong một topic: { "title": "...", "lessons": [ ... ] }.`,
      };
    }
  }
  if (lessonsRaw != null && !Array.isArray(lessonsRaw)) {
    return { ok: false, error: `${where}: "lessons" phải là một mảng.` };
  }
  const lessons: ImportedLesson[] = [];
  if (Array.isArray(lessonsRaw)) {
    if (lessonsRaw.length > MAX_LESSONS) {
      return { ok: false, error: `${where}: mỗi topic tối đa ${MAX_LESSONS} bài học.` };
    }
    for (let i = 0; i < lessonsRaw.length; i++) {
      const lesson = parseLesson(lessonsRaw[i], `${where}, bài học thứ ${i + 1}`);
      if (!lesson.ok) return lesson;
      lessons.push(lesson.lesson);
    }
  }
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

function unwrap(data: unknown): { ok: true; list: unknown[] } | { ok: false; error: string } {
  if (Array.isArray(data)) return { ok: true, list: data };
  if (!isRecord(data)) {
    return { ok: false, error: 'JSON phải là một object topic, một mảng các topic, hoặc { "topics": [ ... ] }.' };
  }
  if (looksLikeBackup(data)) {
    return { ok: false, error: 'Đây là file sao lưu của app, không phải danh sách topic. Hãy khôi phục file này ở mục Cài đặt.' };
  }
  if (Array.isArray(data.topics)) return { ok: true, list: data.topics };
  if (isRecord(data.topic)) return { ok: true, list: [data.topic] };
  // A single topic object (with or without lessons). An empty title still counts, so parseTopic can explain.
  if ('title' in data || 'name' in data || Array.isArray(data.lessons) || Array.isArray(data.items)) {
    return { ok: true, list: [data] };
  }
  return { ok: false, error: 'JSON phải là một object topic, một mảng các topic, hoặc { "topics": [ ... ] }. Mỗi topic cần có "title".' };
}

/** Parse and validate topic-import JSON. Never throws. */
export function parseTopicImport(text: string): TopicImportResult {
  const raw = text.trim();
  if (!raw) return { ok: false, error: 'Chưa có nội dung JSON. Hãy dán JSON hoặc chọn một file .json.' };
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
  return { ok: true, topics };
}

export function topicImportPreview(topics: ImportedTopic[]): { topicCount: number; lessonCount: number; lines: string[] } {
  const lessonCount = topics.reduce((n, t) => n + t.lessons.length, 0);
  const lines = topics.map((t) => {
    const n = t.lessons.length;
    return n ? `${t.title} — ${n} bài học` : `${t.title} — chưa có bài học`;
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
