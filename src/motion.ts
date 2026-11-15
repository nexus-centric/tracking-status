// Motion helpers. Every animation is a no-op when the user prefers reduced motion.

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Animates an element's text from `from` to `to` (integers). */
export function countUp(el: HTMLElement, to: number, from = 0, duration = 520): void {
  const end = Math.round(to);
  if (prefersReducedMotion() || from === end) {
    el.textContent = String(end);
    return;
  }
  const start = Math.round(from);
  const t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / duration);
    el.textContent = String(Math.round(start + (end - start) * easeOut(p)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Short burst of dots from a point, in the given CSS color. */
export function burst(x: number, y: number, color: string): void {
  if (prefersReducedMotion()) return;
  const el = document.createElement('div');
  el.className = 'burst';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  const n = 11;
  el.innerHTML = Array.from({ length: n }, (_, i) => {
    const a = (360 / n) * i + (i % 2 === 0 ? 8 : -6);
    const d = 36 + (i % 3) * 10;
    return `<i style="--a:${a}deg;--d:${d}px;--c:${color};--delay:${i * 8}ms"></i>`;
  }).join('');
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 800);
}

export function playEnter(main: HTMLElement): void {
  main.classList.remove('page-enter');
  if (prefersReducedMotion()) return;
  // Force a reflow so the animation restarts when navigating between pages.
  void main.offsetWidth;
  main.classList.add('page-enter');
}

export function clientCenter(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export interface LogCelebration {
  trackId: string;
  fromScore?: number;
  origin?: { x: number; y: number };
  color?: string;
}

let pending: LogCelebration | undefined;

export function queueCelebration(c: LogCelebration): void {
  pending = c;
  if (c.origin && c.color) burst(c.origin.x, c.origin.y, c.color);
}

export function takeCelebration(): LogCelebration | undefined {
  const v = pending;
  pending = undefined;
  return v;
}
