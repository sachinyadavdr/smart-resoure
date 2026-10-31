'use client';

import { BookingTimeSelection, localBookingDateTime } from '../lib/booking-time';

export default function BookingDateTimeField({ label, value, onChange, disabled }: {
  label: 'Start' | 'End'; value: BookingTimeSelection;
  onChange: (value: BookingTimeSelection) => void; disabled: boolean;
}) {
  const id = `booking-${label.toLowerCase()}`;
  const complete = Object.values(value).every(Boolean);
  const invalid = complete && !localBookingDateTime(value);
  const update = (key: keyof BookingTimeSelection, selected: string) => onChange({ ...value, [key]: selected });
  return <div className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
    <label className="block text-sm font-semibold" htmlFor={`${id}-date`}>{label} date</label>
    <input id={`${id}-date`} className="input block min-w-0 w-full" type="date" value={value.date} onChange={event => update('date', event.target.value)} required disabled={disabled} aria-invalid={Boolean(invalid)} aria-describedby={invalid ? `${id}-error` : undefined} />
    <fieldset disabled={disabled} aria-describedby={`${id}-example${invalid ? ` ${id}-error` : ''}`}>
      <legend className="text-sm font-semibold">{label} time (AM/PM)</legend>
      <div className="mt-2 grid min-w-0 grid-cols-3 gap-2">
        <label className="min-w-0 text-xs font-medium text-slate-600">Hour<select className="input mt-1 w-full min-w-0 px-2" aria-label={`${label} hour`} required value={value.hour} onChange={event => update('hour', event.target.value)}><option value="" disabled>Hour</option>{Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map(hour => <option key={hour} value={hour}>{hour}</option>)}</select></label>
        <label className="min-w-0 text-xs font-medium text-slate-600">Minute<select className="input mt-1 w-full min-w-0 px-2" aria-label={`${label} minute`} required value={value.minute} onChange={event => update('minute', event.target.value)}><option value="" disabled>Min</option>{Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0')).map(minute => <option key={minute} value={minute}>{minute}</option>)}</select></label>
        <label className="min-w-0 text-xs font-medium text-slate-600">AM/PM<select className="input mt-1 w-full min-w-0 px-2" aria-label={`${label} AM/PM`} required value={value.period} onChange={event => update('period', event.target.value)}><option value="" disabled>Select</option><option value="AM">AM</option><option value="PM">PM</option></select></label>
      </div>
      <p id={`${id}-example`} className="mt-2 text-xs text-slate-500">Example: {label === 'Start' ? '10:00 AM' : '02:00 PM'}. 12:00 AM is midnight; 12:00 PM is noon.</p>
    </fieldset>
    {invalid && <p id={`${id}-error`} role="alert" className="text-sm text-rose-700">Choose a valid date and a time that exists in your local timezone.</p>}
  </div>;
}
