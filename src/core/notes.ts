// Formatting of user-written session notes. HTML is escaped; list markers become lists; blank lines are kept.

export const NOTE_MAX = 2000;
export const SESSION_NOTE_MAX = 8000;

export function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const UL = /^\s*[-*+]\s+(.*)$/;
const OL = /^\s*\d+[.)]\s+(.*)$/;

/**
 * Turns plain text into safe HTML that keeps the author's line breaks.
 * Consecutive lines starting with `- `, `* `, `+ ` or `1. `/`1)` become a list; other lines are paragraphs;
 * a blank line is a visible gap. Nothing is interpreted as HTML.
 */
export function formatNoteHtml(text: string): string {
  const raw = String(text ?? '').replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '');
  if (!raw.trim()) return '';
  const out: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    out.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  for (const line of raw.split('\n')) {
    const ul = line.match(UL);
    const ol = line.match(OL);
    if (ul) {
      if (list?.tag !== 'ul') { flush(); list = { tag: 'ul', items: [] }; }
      list.items.push(escapeHtml(ul[1]));
    } else if (ol) {
      if (list?.tag !== 'ol') { flush(); list = { tag: 'ol', items: [] }; }
      list.items.push(escapeHtml(ol[1]));
    } else if (line === '') {
      flush();
      out.push('<div class="note-gap"></div>');
    } else {
      flush();
      out.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  flush();
  return out.join('');
}

/** A clipped, safe note block. Empty text yields an empty string. */
export function noteBlock(text: string | undefined, cls = ''): string {
  const html = formatNoteHtml(text ?? '');
  if (!html) return '';
  return `<div class="note-clip${cls ? ` ${cls}` : ''}" data-clip><div class="note-body">${html}</div></div>`;
}
