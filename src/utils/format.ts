export function formatVND(value: number): string {
  return `${(Number(value) || 0).toLocaleString('vi-VN')}đ`;
}

export function formatShortPrice(value: number): string {
  const n = Number(value) || 0;
  if (n >= 1000 && n % 1000 === 0) return `${n / 1000}K`;
  return formatVND(n);
}

export function calcDiscountPercent(originalPrice: number, livePrice: number): number {
  const o = Number(originalPrice) || 0;
  const l = Number(livePrice) || 0;
  if (o <= l || o <= 0) return 0;
  return Math.round(((o - l) / o) * 100);
}

export function formatMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(safe / 60)).padStart(2, '0');
  const ss = String(safe % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = (hex || '#5B4FE8').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return { r: 91, g: 79, b: 232 };
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function lightenHex(hex: string, amount = 34): string {
  const { r, g, b } = hexToRgb(hex);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  return (
    '#' +
    [clamp(r + amount), clamp(g + amount), clamp(b + amount)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

export function getContrastTextColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.68 ? '#18181b' : '#ffffff';
}
