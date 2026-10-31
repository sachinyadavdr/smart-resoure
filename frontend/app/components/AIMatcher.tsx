'use client';
import { FormEvent, useState } from 'react';
import ResourcePrice from './ResourcePrice';
import ResourceImage from './ResourceImage';
import styles from './AIMatcher.module.css';
import Link from 'next/link';
import { apiErrorMessage, requestJson } from '../lib/api';
import { withRecommendationImages } from '../lib/recommendation-images';
type Recommendation = { id: number; imageUrl?: string | null; description?: string; hourlyPricePaise?: number; title: string; category: string; location: string; availability: string; matchReason: string };
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
    if (!token) return setState({ loading: false, error: 'Log in to use AI resource matching.', source: '', loginRequired: true });
    setState({ loading: true, error: '', source: '', loginRequired: false });
    try {
      const { response, data } = await requestJson<MatchResponse>('/ai/resource-match', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ query }),
      });
      if (response.status === 401) return setState({ loading: false, error: 'Your session is invalid or has expired. Please sign in again to use the AI resource finder.', source: '', loginRequired: true });
      if (response.status === 403) return setState({ loading: false, error: 'Your account is not authorized to use the AI resource finder. Sign in with a Student, Owner or Admin account.', source: '', loginRequired: true });
      if (!response.ok || !data) return setState({ loading: false, error: data?.error || 'Unable to match resources.', source: '', loginRequired: false });
      let recommendations = data.recommendations;
      if (recommendations.some(item => item.imageUrl === undefined)) {
        try {
          const catalog = await requestJson<{ resources: { id: number; imageUrl?: string | null }[] }>('/resources', { cache: 'no-store' });
          if (catalog.response.ok && catalog.data) recommendations = withRecommendationImages(recommendations, catalog.data.resources);
        } catch { /* Matching still succeeds; ResourceImage supplies its existing fallback. */ }
      }
      setItems(recommendations);
      setState({ loading: false, error: '', source: data.source, loginRequired: false });
    } catch (reason) {
      setState({ loading: false, error: apiErrorMessage(reason, 'Unable to reach the resource finder. Please try again.'), source: '', loginRequired: false });
    }
  };
  return <section className="card mb-8 border-blue-100 bg-blue-50/60"><p className="text-sm font-semibold uppercase tracking-wide text-primary">AI resource finder</p><h2 className="mt-2 text-2xl font-bold">Describe what you need</h2><p className="mt-2 text-slate-600">Discover relevant resources using AI-powered recommendations based on available verified listings.</p><form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:flex-row"><input aria-label="Describe the resource you need" className="input bg-white" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. a projector for a presentation near the Innovation Lab" minLength={3} required /><button className="btn-primary whitespace-nowrap" type="submit" disabled={state.loading}>{state.loading ? 'Finding…' : 'Find resources'}</button></form>{state.error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}{state.loginRequired && <> <Link href="/login" className="font-semibold underline">Log in</Link></>}</p>}{state.source && <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Source: {state.source === 'gemini' ? 'Gemini + verified catalog' : 'Deterministic fallback'}</p>}{!state.loading && state.source && !items.length && <p className="mt-3 text-slate-600">No eligible matches found. Try different category, location, or usage terms.</p>}{items.length > 0 && <div className={styles.results}>{items.map(item => <article className={styles.card} key={item.id}>
    <Link className={styles.photo} href={`/resources/${item.id}`} tabIndex={-1} aria-hidden="true"><ResourceImage title={item.title} imageUrl={item.imageUrl} /></Link>
    <div className={styles.body}>
      <div className={styles.meta}><span>{item.category}</span><span className={styles.availability+' '+(item.availability === 'available' ? styles.available : '')}>{item.availability}</span></div>
      <h3 className={styles.title}><Link href={`/resources/${item.id}`}>{item.title}</Link></h3>
      <p className={styles.location}>{item.location}</p>
      {item.description && <p className={styles.description}>{item.description}</p>}
      <details className={styles.reason}><summary>Why it matches</summary><p>{item.matchReason}</p></details>
      <div className={styles.bottom}><ResourcePrice paise={item.hourlyPricePaise} /><Link className={styles.details} href={`/resources/${item.id}`}>View details<span className="sr-only"> for {item.title}</span></Link></div>
    </div>
  </article>)}</div>}</section>;
}
