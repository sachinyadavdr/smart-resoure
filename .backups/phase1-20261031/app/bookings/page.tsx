'use client';
import { BookingPrice } from '../components/ResourcePrice';

import { FormEvent, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
type Booking = { id: number; quotedHourlyPricePaise?: number | null; estimatedTotalPaise?: number | null; resourceTitle: string; status: string; startsAt: string; endsAt: string; purpose: string; decisionReason?: string; location: string };
type ActionState = { message: string; error: string };

export default function Bookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [state, setState] = useState({ loading: true, error: '' });
  const [actions, setActions] = useState<Record<number, ActionState>>({});
  const [report, setReport] = useState({ bookingId: 0, reportType: 'after', notes: '', image: null as File | null });
  const [incident, setIncident] = useState({ bookingId: 0, category: 'other', description: '' });
  const token = () => localStorage.getItem('resourcebridge_token') || '';

  const load = () => {
    fetch(`${API}/bookings`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to load bookings.'); return data; })
      .then((data) => { setBookings(data.bookings); setState({ loading: false, error: '' }); })
      .catch((error) => setState({ loading: false, error: error.message }));
  };

  useEffect(load, []);
  const setAction = (id: number, next: Partial<ActionState>) => setActions((old) => ({ ...old, [id]: { message: '', error: '', ...old[id], ...next } }));
  const lifecycle = async (id: number, action: 'check-in' | 'check-out', body: object) => {
    const response = await fetch(`${API}/bookings/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) return setAction(id, { error: data.error || 'Unable to update booking.' });
    setAction(id, { message: `${action === 'check-in' ? 'Checked in' : 'Checked out'} successfully.` }); load();
  };
  const cancel = async (id: number) => {
    const response = await fetch(`${API}/bookings/${id}/cancel`, { method: 'PATCH', headers: { Authorization: `Bearer ${token()}` } });
    const data = await response.json();
    if (!response.ok) return setAction(id, { error: data.error || 'Unable to cancel booking.' });
    setAction(id, { message: 'Booking cancelled.' }); load();
  };
  const submitReport = async (event: FormEvent) => {
    event.preventDefault(); const form = new FormData(); form.append('reportType', report.reportType); form.append('notes', report.notes); if (report.image) form.append('image', report.image);
    const response = await fetch(`${API}/bookings/${report.bookingId}/condition-reports`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: form }); const data = await response.json();
    if (!response.ok) return setAction(report.bookingId, { error: data.error || 'Unable to save condition report.' });
    setAction(report.bookingId, { message: 'Condition report saved.' }); setReport({ bookingId: 0, reportType: 'after', notes: '', image: null });
  };
  const submitIncident = async (event: FormEvent) => {
    event.preventDefault(); const response = await fetch(`${API}/bookings/${incident.bookingId}/incidents`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ category: incident.category, description: incident.description }) }); const data = await response.json();
    if (!response.ok) return setAction(incident.bookingId, { error: data.error || 'Unable to report incident.' });
    setAction(incident.bookingId, { message: 'Incident reported for review.' }); setIncident({ bookingId: 0, category: 'other', description: '' });
  };

  return <main className="mx-auto max-w-6xl px-6 py-12"><h1 className="text-4xl font-bold">My bookings</h1><p className="mt-3 text-slate-600">Track requests and complete the resource return lifecycle.</p>
    {state.loading && <p className="mt-8 text-slate-500">Loading bookings…</p>}{state.error && <p role="alert" className="mt-8 rounded-lg bg-red-50 p-4 text-red-700">{state.error}</p>}{!state.loading && !state.error && !bookings.length && <p className="mt-8 rounded-lg border border-dashed p-8 text-center text-slate-500">You have no booking requests yet.</p>}
    <div className="mt-8 grid gap-4">{bookings.map((booking) => <article className="card" key={booking.id}><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><h2 className="text-xl font-bold">{booking.resourceTitle}</h2><p className="mt-1 text-sm text-slate-500">{booking.location} · {new Date(booking.startsAt).toLocaleString()} – {new Date(booking.endsAt).toLocaleString()}</p></div><span className="h-fit rounded-full bg-slate-100 px-3 py-1 text-sm font-bold capitalize">{booking.status}</span></div><p className="mt-4 text-slate-700">{booking.purpose}</p><BookingPrice hourlyPricePaise={booking.quotedHourlyPricePaise} estimatedTotalPaise={booking.estimatedTotalPaise} />{booking.decisionReason && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Review note: {booking.decisionReason}</p>}{actions[booking.id]?.error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{actions[booking.id].error}</p>}{actions[booking.id]?.message && <p role="status" className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-primary">{actions[booking.id].message}</p>}
      {booking.status === 'approved' && <div className="mt-5 flex flex-wrap gap-3"><button className="btn-primary" onClick={() => lifecycle(booking.id, 'check-in', { condition: 'Condition recorded by student at check-in.' })}>Check in</button><button className="btn border border-slate-300" onClick={() => lifecycle(booking.id, 'check-out', { condition: 'Condition recorded by student at check-out.', returnNotes: '' })}>Check out</button><button className="btn border border-amber-300 text-amber-800" onClick={() => setReport({ bookingId: booking.id, reportType: 'after', notes: '', image: null })}>Condition report</button><button className="btn border border-red-200 text-red-700" onClick={() => setIncident({ bookingId: booking.id, category: 'other', description: '' })}>Report incident</button></div>}
      {['pending', 'approved', 'waitlisted'].includes(booking.status) && <button className="btn mt-4 border border-red-200 text-red-700" onClick={() => cancel(booking.id)}>Cancel request</button>}
      {report.bookingId === booking.id && <form onSubmit={submitReport} className="mt-5 grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-2"><label className="text-sm font-semibold">Report type<select className="input mt-1" value={report.reportType} onChange={(e) => setReport({ ...report, reportType: e.target.value })}><option value="before">Before use</option><option value="after">After use</option></select></label><label className="text-sm font-semibold">Optional image<input className="input mt-1" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setReport({ ...report, image: e.target.files?.[0] || null })} /></label><label className="text-sm font-semibold sm:col-span-2">Notes<textarea className="input mt-1" rows={3} value={report.notes} onChange={(e) => setReport({ ...report, notes: e.target.value })} required minLength={3} /></label><button className="btn-primary" type="submit">Save report</button></form>}
      {incident.bookingId === booking.id && <form onSubmit={submitIncident} className="mt-5 grid gap-3 rounded-lg bg-red-50 p-4 sm:grid-cols-2"><label className="text-sm font-semibold">Incident category<select className="input mt-1 bg-white" value={incident.category} onChange={(e) => setIncident({ ...incident, category: e.target.value })}><option value="damage">Damage</option><option value="delay">Delay</option><option value="missing_equipment">Missing equipment</option><option value="other">Other</option></select></label><label className="text-sm font-semibold sm:col-span-2">Description<textarea className="input mt-1 bg-white" rows={3} value={incident.description} onChange={(e) => setIncident({ ...incident, description: e.target.value })} placeholder="Describe what happened for human review." required minLength={3} /></label><button className="btn border border-red-300 text-red-700" type="submit">Submit incident</button></form>}
    </article>)}</div></main>;
}
