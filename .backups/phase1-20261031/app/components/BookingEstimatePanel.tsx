'use client';
import { useEffect, useState } from 'react';
import { apiErrorMessage, requestJson } from '../lib/api';
import { BookingEstimate, bookingWindow, formatINR } from '../lib/pricing';
import ResourcePrice from './ResourcePrice';

export default function BookingEstimatePanel({ resourceId, hourlyPricePaise, startsAt, endsAt, onEstimate, refreshKey }: {
  resourceId: number; hourlyPricePaise: number; startsAt: string; endsAt: string;
  onEstimate: (estimate: BookingEstimate | null) => void; refreshKey: number;
}) {
  const [state, setState] = useState<{ loading: boolean; error: string; quote: BookingEstimate | null }>({ loading: false, error: '', quote: null });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const times = bookingWindow(startsAt, endsAt);
    onEstimate(null);
    setState({ loading: Boolean(times), error: '', quote: null });
    if (!times) return () => controller.abort();
    const timer = window.setTimeout(() => {
      requestJson<{ estimate?: BookingEstimate; error?: string }>(`/resources/${resourceId}/estimate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(times), signal: controller.signal })
        .then(({ response, data }) => {
          if (controller.signal.aborted) return;
          if (!response.ok || !data?.estimate) throw new Error(data?.error || 'Unable to calculate an estimate.');
          setState({ loading: false, error: '', quote: data.estimate });
          onEstimate(data.estimate);
        }).catch(reason => { if (!controller.signal.aborted) setState({ loading: false, error: apiErrorMessage(reason, 'Unable to calculate an estimate.'), quote: null }); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [resourceId, hourlyPricePaise, startsAt, endsAt, onEstimate, refreshKey, retry]);
  const invalidWindow = startsAt && endsAt && !bookingWindow(startsAt, endsAt);
  return <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4" aria-label="Estimated booking cost" aria-live="polite" aria-busy={state.loading}>
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold text-slate-600">Hourly rental rate</span><ResourcePrice paise={state.quote?.hourlyPricePaise ?? hourlyPricePaise} /></div>
    {state.loading ? <p className="mt-4 text-sm text-blue-800">Calculating your estimate…</p> : state.error ? <div><p role="alert" className="mt-4 text-sm text-rose-800">{state.error}</p><button type="button" className="mt-2 text-sm font-semibold text-primary underline" onClick={() => setRetry(value => value + 1)}>Retry estimate</button></div> : state.quote ? <div className="mt-4 border-t border-blue-100 pt-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-sm font-semibold text-slate-600">Estimated total</span><strong className="text-2xl text-slate-900">{state.quote.hourlyPricePaise === 0 ? 'Free' : formatINR(state.quote.estimatedTotalPaise)}</strong></div><p className="mt-2 text-xs text-slate-500">{new Intl.NumberFormat('en-IN', { maximumFractionDigits: 6 }).format(state.quote.durationHours)} hours × {formatINR(state.quote.hourlyPricePaise)}/hour. Fractional hours are prorated; the total is rounded to the nearest paise.</p></div> : <p className="mt-4 text-sm text-slate-600">{invalidWindow ? 'End time must be after start time.' : 'Select a start and end time to see the estimated total.'}</p>}
    <p className="mt-3 text-xs leading-5 text-slate-500">Estimate only. No payment is collected through ResourceBridge. Availability and eligibility are checked when you submit.</p>
  </section>;
}
