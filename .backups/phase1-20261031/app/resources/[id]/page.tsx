'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import ResourcePrice from '../../components/ResourcePrice';
import BookingDateTimeField from '../../components/BookingDateTimeField';
import { emptyBookingTime, localBookingDateTime } from '../../lib/booking-time';
import BookingEstimatePanel from '../../components/BookingEstimatePanel';
import { BookingEstimate, bookingWindow, formatINR } from '../../lib/pricing';
import ResourceImage from '../../components/ResourceImage';
import { apiErrorMessage, requestJson } from '../../lib/api';

type Resource = { id: number; hourlyPricePaise: number; imageUrl?: string | null; title: string; description: string; category: string; location: string; capacity: number; availability: string; accessRules: string; ownerName: string; eligibility: string[] };
export default function ResourceDetails({ params }: { params: Promise<{ id: string }> }) {
 const [estimate, setEstimate] = useState<BookingEstimate | null>(null);
 const [quoteRevision, setQuoteRevision] = useState(0);
 const [resource, setResource] = useState<Resource | null>(null);
 const [form, setForm] = useState({ start: { ...emptyBookingTime }, end: { ...emptyBookingTime }, purpose: '' });
 const [message, setMessage] = useState('');
 const [error, setError] = useState('');
 const [saving, setSaving] = useState(false);
 const [role, setRole] = useState('');
 const [timezone, setTimezone] = useState('your device timezone');
 useEffect(() => {
  let active = true;
  setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  params.then(({ id }) => requestJson<{ resource: Resource; error?: string }>('/resources/' + encodeURIComponent(id))).then(({ response, data }) => { if (!response.ok || !data?.resource) throw new Error(data?.error || 'Resource not found.'); if (active) setResource(data.resource); }).catch(reason => { if (active) setError(apiErrorMessage(reason, 'Unable to load resource.')); });
  const token = localStorage.getItem('resourcebridge_token');
  if (token) requestJson<{ user: { role: string } }>('/auth/me', { headers: { Authorization: 'Bearer ' + token } }).then(({ response, data }) => { if (active && response.ok && data) setRole(data.user.role); }).catch(() => {});
  return () => { active = false; };
 }, [params]);
 const startsAt = localBookingDateTime(form.start), endsAt = localBookingDateTime(form.end);
 const times = bookingWindow(startsAt, endsAt);
 const hasEstimate = Boolean(estimate && times && estimate.startsAt === times.startsAt && estimate.endsAt === times.endsAt);
 const submit = async (event: FormEvent) => {
  event.preventDefault(); setMessage(''); setError('');
  const token = localStorage.getItem('resourcebridge_token');
  if (!token) return setError('Please log in as a student before requesting a booking.');
  if (!resource || saving) return;
  if (!startsAt || !endsAt) return setError('Choose both dates, hours, minutes and AM/PM.');
  const start = new Date(startsAt), end = new Date(endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start <= new Date() || end <= start) return setError('Choose a future start time and an end time after it.');
  if (!hasEstimate) return setError('Please review a valid booking estimate before submitting.');
  setSaving(true);
  try {
   const { response, data } = await requestJson<{ error?: string; status?: string; explanation?: string; estimate?: BookingEstimate; code?: string; hourlyPricePaise?: number }>('/resources/' + resource.id + '/bookings', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + token }, body:JSON.stringify({ purpose: form.purpose, expectedHourlyPricePaise: estimate.hourlyPricePaise, startsAt:start.toISOString(), endsAt:end.toISOString() }) });
   if (!response.ok) { if (data?.code === 'PRICE_CHANGED') { setEstimate(null); setQuoteRevision(value => value + 1); if (Number.isSafeInteger(data.hourlyPricePaise)) setResource(current => current ? { ...current, hourlyPricePaise: data.hourlyPricePaise } : current); } throw new Error(data?.error || 'Unable to submit booking request.'); }
   setMessage(`${data?.explanation || 'Booking request submitted for owner review.'}${data?.estimate ? ` Estimated cost: ${data.estimate.hourlyPricePaise === 0 ? 'Free' : formatINR(data.estimate.estimatedTotalPaise)}.` : ''} No payment collected through ResourceBridge.`);
   setForm({ start: { ...emptyBookingTime }, end: { ...emptyBookingTime }, purpose:'' });
  } catch (reason) { setError(apiErrorMessage(reason, 'Unable to submit booking request.')); } finally { setSaving(false); }
 };
 if (!resource) return <main className="mx-auto max-w-7xl px-6 py-12"><Link href="/resources" className="text-sm font-semibold text-primary">← Back to resources</Link>{error ? <p role="alert" className="card mt-6 text-rose-700">{error}</p> : <div role="status" className="mt-6 animate-pulse rounded-3xl bg-slate-200 p-20"><span className="sr-only">Loading resource</span></div>}</main>;
 const additionalRequirements = resource.eligibility.some(item => item.toLowerCase() !== 'active student account');
 const disabled = saving || !hasEstimate || resource.availability !== 'available' || additionalRequirements || Boolean(role && role !== 'student');
 return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><Link href="/resources" className="text-sm font-semibold text-primary">← Back to resources</Link><div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]"><article className="resource-card"><ResourceImage title={resource.title} imageUrl={resource.imageUrl} large /><div className="p-5 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><p className="eyebrow text-primary">{resource.category}</p><span className={resource.availability === 'available' ? 'rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800' : 'rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700'}>{resource.availability}</span></div><h1 className="mt-3 text-4xl font-bold">{resource.title}</h1><div className="mt-4"><ResourcePrice paise={resource.hourlyPricePaise} /></div><p className="mt-5 leading-8 text-slate-600">{resource.description}</p><dl className="mt-6 grid gap-5 border-y border-slate-100 py-6 sm:grid-cols-3">{[['Location',resource.location],['Shared by',resource.ownerName],['Capacity',String(resource.capacity)]].map(([label,value]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-2 font-semibold">{value}</dd></div>)}</dl><h2 className="mt-7 text-xl font-bold">Before you book</h2><p className="mt-3 text-sm font-semibold text-slate-600">Eligibility requirements</p>{resource.eligibility.length ? <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-600">{resource.eligibility.map(item => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-slate-600">No additional requirements listed.</p>}<h3 className="mt-5 text-sm font-semibold">Access rules</h3><p className="mt-2 text-sm leading-7 text-slate-600">{resource.accessRules || 'No additional access rules listed.'}</p></div></article><section className="card lg:sticky lg:top-6"><p className="eyebrow text-primary">Plan your next project</p><h2 className="mt-3 text-2xl font-bold">Request a booking</h2><p className="mt-3 text-sm leading-6 text-slate-500">Choose your time window. The owner reviews your request; overlapping approved bookings may place you on the waitlist.</p>{!role && <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-primary">Log in as a student to book →</Link>}{additionalRequirements && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">This resource has additional eligibility requirements. The current booking rules do not permit requests until those requirements can be verified.</p>}{role && role !== 'student' && <p className="mt-4 text-sm text-amber-800">Booking requests are available to student accounts.</p>}<form onSubmit={submit} className="mt-6 space-y-4"><p className="text-xs leading-5 text-slate-500">All dates and times use your device timezone: <span className="font-semibold">{timezone}</span>. For overnight bookings, choose the following date as the end date.</p><BookingDateTimeField label="Start" value={form.start} disabled={saving} onChange={start => setForm(current => ({ ...current, start }))} /><BookingDateTimeField label="End" value={form.end} disabled={saving} onChange={end => setForm(current => ({ ...current, end }))} /><BookingEstimatePanel resourceId={resource.id} hourlyPricePaise={resource.hourlyPricePaise} startsAt={startsAt} endsAt={endsAt} onEstimate={setEstimate} refreshKey={quoteRevision} /><label className="block text-sm font-semibold">What will you use it for?<textarea className="input mt-2" rows={4} value={form.purpose} onChange={e=>setForm({...form, purpose:e.target.value})} required minLength={5} maxLength={1000} placeholder="Tell the owner about your project" /></label><button className="btn-primary w-full" type="submit" disabled={disabled}>{saving ? 'Submitting…' : resource.availability !== 'available' ? 'Currently unavailable' : 'Send booking request'}</button></form>{error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message} <Link href="/bookings" className="font-semibold underline">View my bookings</Link></p>}</section></div></main>;
}