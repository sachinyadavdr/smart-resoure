export type BookingTimeSelection = { date: string; hour: string; minute: string; period: string };
export const emptyBookingTime: BookingTimeSelection = { date: '', hour: '', minute: '', period: '' };

// A local wall-clock value, without an offset. bookingWindow converts this to
// the API's UTC ISO instant using the browser's timezone, as before.
export function localBookingDateTime(selection: BookingTimeSelection): string {
  const { date, hour, minute, period } = selection;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(0[1-9]|1[0-2])$/.test(hour) || !/^[0-5]\d$/.test(minute) || !['AM', 'PM'].includes(period)) return '';
  const hours = Number(hour) % 12 + (period === 'PM' ? 12 : 0);
  const value = `${date}T${String(hours).padStart(2, '0')}:${minute}`;
  const parsed = new Date(value);
  const [year, month, day] = date.split('-').map(Number);
  // Reject invalid dates and nonexistent local times during a DST clock jump.
  if (!Number.isFinite(parsed.getTime()) || parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day || parsed.getHours() !== hours || parsed.getMinutes() !== Number(minute)) return '';
  return value;
}
