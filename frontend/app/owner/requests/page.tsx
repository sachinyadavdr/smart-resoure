'use client';
import { BookingPrice } from '../../components/ResourcePrice';

import { useCallback, useEffect, useState } from 'react';
import { apiErrorMessage, requestJson } from '../../lib/api';

type Booking = { id: number; quotedHourlyPricePaise?: number | null; estimatedTotalPaise?: number | null; resourceTitle: string; status: string; startsAt: string; endsAt: string; purpose: string; studentName: string; studentEmail: string; location: string; decisionReason?: string };
const statusStyles: Record<string, string> = { pending: 'bg-amber-50 text-amber-800', approved: 'bg-emerald-50 text-emerald-800', rejected: 'bg-rose-50 text-rose-800', waitlisted: 'bg-violet-50 text-violet-800' };

export default function OwnerRequests() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const token = localStorage.getItem('resourcebridge_token');
      const { response, data } = await requestJson<{ bookings: Booking[]; error?: string }>('/owner/bookings', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok || !data) throw new Error(data?.error || 'Unable to load incoming requests.');
      setBookings(data.bookings);
    } catch (reason) { setError(apiErrorMessage(reason, 'Unable to load incoming requests.')); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (id: number, status: 'approved' | 'rejected') => {
    const reason = (reasons[id] || '').trim();
    if (reason.length < 3) { setMessage('Add a short review reason before deciding this request.'); return; }
    if (submitting !== null) return;
    setSubmitting(id); setMessage(''); setError('');
    try {
      const token = localStorage.getItem('resourcebridge_token');
      const { response, data } = await requestJson<{ status?: string; reason?: string; error?: string }>(`/bookings/${id}/decision`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status, reason }) });
      if (!response.ok) throw new Error(data?.error || `Unable to ${status} this request.`);
      await load();
      setMessage(`Request ${status}. The student was notified and the audit history was updated.`);
      window.dispatchEvent(new Event('resourcebridge:refresh'));
    } catch (reasonError) { setError(apiErrorMessage(reasonError, `Unable to ${status} this request.`)); } finally { setSubmitting(null); }
  };

  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12"><div><p className="font-semibold text-primary">Owner workspace</p><h1 className="mt-2 text-4xl font-bold tracking-tight">Incoming requests</h1><p className="mt-3 max-w-2xl text-slate-600">Review requests for resources you own. Every decision requires a reason and is recorded for the student and audit history.</p></div>{error && <p role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{error}</p>}{message && <p role="status" className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-primary">{message}</p>}{loading ? <div className="mt-8 grid gap-4"><div className="h-48 animate-pulse rounded-2xl bg-slate-200" /><div className="h-48 animate-pulse rounded-2xl bg-slate-200" /></div> : <div className="mt-8 grid gap-5">{bookings.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center"><p className="font-semibold text-slate-700">No incoming requests.</p><p className="mt-2 text-sm text-slate-500">New student booking requests for your resources will appear here.</p></div> : bookings.map((booking) => <article className="card" key={booking.id} aria-busy={submitting === booking.id}><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><h2 className="text-xl font-bold">{booking.resourceTitle}</h2><p className="mt-1 text-sm text-slate-500">Requested by {booking.studentName} ({booking.studentEmail})</p><p className="mt-1 text-sm text-slate-500">{new Date(booking.startsAt).toLocaleString()} – {new Date(booking.endsAt).toLocaleString()}</p><p className="mt-1 text-sm text-slate-500">{booking.location}</p></div><span className={`h-fit rounded-full px-3 py-1 text-sm font-bold capitalize ${statusStyles[booking.status] || 'bg-slate-100 text-slate-700'}`}>{booking.status}</span></div><p className="mt-4 text-slate-700">{booking.purpose}</p><BookingPrice hourlyPricePaise={booking.quotedHourlyPricePaise} estimatedTotalPaise={booking.estimatedTotalPaise} />{booking.decisionReason && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Decision reason: {booking.decisionReason}</p>}{booking.status === 'pending' && <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><label className="text-sm font-semibold text-slate-700" htmlFor={`reason-${booking.id}`}>Decision reason</label><textarea id={`reason-${booking.id}`} className="input mt-2 min-h-20 bg-white" value={reasons[booking.id] || ''} onChange={(event) => setReasons((current) => ({ ...current, [booking.id]: event.target.value }))} placeholder="Explain the approval or rejection." minLength={3} maxLength={1000} required /><div className="mt-3 flex flex-wrap gap-3"><button className="btn-primary" disabled={submitting !== null} onClick={() => decide(booking.id, 'approved')}>{submitting === booking.id ? 'Saving…' : 'Approve'}</button><button className="btn border border-red-200 text-red-700" disabled={submitting !== null} onClick={() => decide(booking.id, 'rejected')}>{submitting === booking.id ? 'Saving…' : 'Reject'}</button></div></div>}</article>)}</div>}</main>;
}
