export type BookingEstimate = { currency: 'INR'; hourlyPricePaise: number; startsAt: string; endsAt: string; durationMs: number; durationHours: number; estimatedTotalPaise: number; estimateOnly: true };

export function rupeesToPaise(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  const paise = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  return paise <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(paise) : null;
}
export function paiseToInput(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) return '';
  const paise = BigInt(value);
  return `${paise / BigInt(100)}.${String(paise % BigInt(100)).padStart(2, '0')}`;
}
export function formatINR(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) return 'Price unavailable';
  const [whole, fraction] = paiseToInput(value).split('.');
  return `₹${new Intl.NumberFormat('en-IN').format(BigInt(whole))}${fraction === '00' ? '' : `.${fraction}`}`;
}
export function bookingWindow(startsAt: string, endsAt: string) {
  const start = new Date(startsAt), end = new Date(endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return null;
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}
