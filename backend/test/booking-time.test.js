import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { emptyBookingTime, localBookingDateTime } from '../../frontend/app/lib/booking-time.ts';
import { bookingWindow } from '../../frontend/app/lib/pricing.ts';
import { bookingEstimate } from '../src/pricing.js';

const selection = (hour, minute, period, date = '2035-06-20') => ({ date, hour, minute, period });

test('AM/PM selection starts empty and converts morning, afternoon, noon and midnight correctly', () => {
  assert.equal(localBookingDateTime(emptyBookingTime), '');
  for (const [hour, period, expected] of [['10', 'AM', '10'], ['02', 'PM', '14'], ['12', 'PM', '12'], ['12', 'AM', '00']]) {
    assert.equal(localBookingDateTime(selection(hour, '00', period)), `2035-06-20T${expected}:00`);
  }
  for (const value of [selection('', '00', 'AM'), selection('10', '', 'AM'), selection('10', '00', ''), selection('13', '00', 'AM'), selection('10', '60', 'PM'), selection('10', '00', 'AM', '2035-02-30')]) assert.equal(localBookingDateTime(value), '');
});

test('fractional and overnight windows retain exact duration and server-calculated cost', () => {
  for (const [start, end, hours] of [
    [selection('10', '00', 'AM'), selection('02', '00', 'PM'), 4],
    [selection('11', '45', 'AM'), selection('12', '15', 'PM'), 0.5],
    [selection('11', '45', 'PM'), selection('12', '15', 'AM', '2035-06-21'), 0.5],
    [selection('12', '00', 'AM'), selection('12', '00', 'PM'), 12],
  ]) {
    const window = bookingWindow(localBookingDateTime(start), localBookingDateTime(end));
    assert.ok(window);
    const estimate = bookingEstimate(13000, window.startsAt, window.endsAt);
    assert.equal(estimate.durationHours, hours);
    assert.equal(estimate.estimatedTotalPaise, 13000 * hours);
  }
  assert.equal(bookingWindow(localBookingDateTime(selection('10', '00', 'AM')), localBookingDateTime(selection('10', '00', 'AM'))), null);
  assert.equal(bookingWindow(localBookingDateTime(selection('02', '00', 'PM')), localBookingDateTime(selection('10', '00', 'AM'))), null);
});

test('local selections convert to UTC only after timezone interpretation, including DST', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { localBookingDateTime } from '../frontend/app/lib/booking-time.ts';
    import { bookingWindow } from '../frontend/app/lib/pricing.ts';
    const pick = (hour, minute, period, date='2035-06-20') => localBookingDateTime({date,hour,minute,period});
    const window = bookingWindow(pick('10','00','AM'),pick('02','00','PM'));
    assert.equal(window.startsAt, process.env.EXPECTED_START);
    assert.equal(new Date(window.startsAt).getHours(), 10);
    if (process.env.TZ === 'America/New_York') {
      assert.equal(pick('02','30','AM','2035-03-11'), '');
      const crossing = bookingWindow(pick('01','30','AM','2035-03-11'),pick('03','30','AM','2035-03-11'));
      assert.equal(new Date(crossing.endsAt)-new Date(crossing.startsAt),3600000);
    }
  `;
  for (const [TZ, EXPECTED_START] of [['Asia/Kolkata', '2035-06-20T04:30:00.000Z'], ['America/New_York', '2035-06-20T14:00:00.000Z'], ['UTC', '2035-06-20T10:00:00.000Z']]) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ, EXPECTED_START }, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
});
