export function fmtMinutes(min: number): string {
  if (min <= 0) return '0 phút';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} phút`;
  return m ? `${h} giờ ${m} phút` : `${h} giờ`;
}
