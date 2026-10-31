'use client';
import { FormEvent, useState } from 'react';
import ResourcePrice from './ResourcePrice';
import Link from 'next/link';
import { apiErrorMessage, requestJson } from '../lib/api';
type Recommendation = { id: number; hourlyPricePaise?: number; title: string; category: string; location: string; availability: string; matchReason: string };
type MatchResponse = { recommendations: Recommendation[]; source: string; error?: string };
export default function AIMatcher() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Recommendation[]>([]);
  const [state, setState] = useState({ loading: false, error: '', source: '', loginRequired: false });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (state.loading) return;
    const token = localStorage.getItem('resourcebridge_token');
    setItems([]);
    if (!token) return setState({ loading: false, error: 'Log in with a student account to use AI resource matching.', source: '', loginRequired: true });
    setState({ loading: true, error: '', source: '', loginRequired: false });
    try {
      const { response, data } = await requestJson<MatchResponse>('/ai/resource-match', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ query }),
      });
      if (response.status === 401) return setState({ loading: false, error: 'Your session is invalid or has expired. Please sign in again to use the AI resource finder.', source: '', loginRequired: true });
      if (response.status === 403) return setState({ loading: false, error: 'AI resource matching is available to student accounts. Owner and admin accounts can still browse resources using the search and filters below.', source: '', loginRequired: true });
      if (!response.ok || !data) return setState({ loading: false, error: data?.error || 'Unable to match resources.', source: '', loginRequired: false });
      setItems(data.recommendations);
      setState({ loading: false, error: '', source: data.source, loginRequired: false });
    } catch (reason) {
      setState({ loading: false, error: apiErrorMessage(reason, 'Unable to reach the resource finder. Please try again.'), source: '', loginRequired: false });
    }
  };
  return <section className="card mb-8 border-blue-100 bg-blue-50/60"><p className="text-sm font-semibold uppercase tracking-wide text-primary">AI resource finder</p><h2 className="mt-2 text-2xl font-bold">Describe what you need</h2><p className="mt-2 text-slate-600">For student accounts. Recommendations use verified available records only. AI never approves access.</p><form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:flex-row"><input aria-label="Describe the resource you need" className="input bg-white" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. a projector for a presentation near the Innovation Lab" minLength={3} required /><button className="btn-primary whitespace-nowrap" type="submit" disabled={state.loading}>{state.loading ? 'Finding…' : 'Find resources'}</button></form>{state.error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}{state.loginRequired && <> <Link href="/login" className="font-semibold underline">Log in with a student account</Link></>}</p>}{state.source && <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Source: {state.source === 'gemini' ? 'Gemini + verified catalog' : 'Deterministic fallback'}</p>}{!state.loading && state.source && !items.length && <p className="mt-3 text-slate-600">No eligible matches found. Try different category, location, or usage terms.</p>}{items.length > 0 && <div className="mt-4 grid gap-3 md:grid-cols-2">{items.map((item) => <article className="rounded-xl border bg-white p-4" key={item.id}><h3 className="font-bold"><Link className="hover:text-primary" href={`/resources/${item.id}`}>{item.title}</Link></h3><p className="mt-1 text-sm text-slate-500">{item.category} · {item.location} · {item.availability}</p><div className="mt-3"><ResourcePrice paise={item.hourlyPricePaise} /></div><p className="mt-2 text-sm text-slate-600">{item.matchReason}</p></article>)}</div>}</section>; }
