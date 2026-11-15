// Inline SVG icons used in the chrome. They inherit currentColor.

const svg = (body: string, size = 24) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icoToday = svg('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3.5v3M16 3.5v3M4 10h16"/><circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"/>');
export const icoWeek = svg('<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M8 3v3M16 3v3M3.5 9.5h17"/><path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01"/>');
export const icoEvidence = svg('<path d="M8 4.5h5.5L18 9v10.5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"/><path d="M13.5 4.5V9H18"/><path d="M9 13.5h6M9 17h4"/>');
export const icoSettings = svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.75 13.15 5.3c.86.2 1.66.58 2.35 1.1l2.55-.7 1.15 2-1.85 1.85c.2.7.3 1.44.3 2.2s-.1 1.5-.3 2.2l1.85 1.85-1.15 2-2.55-.7a6.9 6.9 0 0 1-2.35 1.1L12 21.25l-1.15-2.55a6.9 6.9 0 0 1-2.35-1.1l-2.55.7-1.15-2 1.85-1.85a6.9 6.9 0 0 1-.3-2.2c0-.76.1-1.5.3-2.2L4.8 7.7l1.15-2 2.55.7a6.9 6.9 0 0 1 2.35-1.1L12 2.75z"/>');
export const icoCheck = svg('<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.3 2.3 4.7-5"/>');
export const icoPlus = svg('<path d="M12 6v12M6 12h12"/>', 22);

export const logoMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#1f574d"/><rect x="13" y="30" width="6" height="16" rx="3" fill="#f6f3ec"/><rect x="23" y="22" width="6" height="24" rx="3" fill="#f6f3ec"/><rect x="33" y="34" width="6" height="12" rx="3" fill="#e9b47c"/><rect x="43" y="18" width="6" height="28" rx="3" fill="#f6f3ec"/></svg>`;

export const emptyMark = `<div class="empty-mark" aria-hidden="true"><span class="eq"><i></i><i></i><i></i><i></i></span></div>`;
