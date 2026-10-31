'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ResourcePrice from '../components/ResourcePrice';
import ResourceImage from '../components/ResourceImage';
import AIMatcher from '../components/AIMatcher';
import { apiErrorMessage, requestJson } from '../lib/api';

type Resource = { id: number; hourlyPricePaise: number; imageUrl?: string | null; title: string; description: string; category: string; location: string; availability: string; ownerName: string; eligibility: string[] };

export default function Resources() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  useEffect(() => { requestJson<{ resources: Resource[] }>('/resources').then(({ response, data }) => { if (response.ok && data) setCategories([...new Set(data.resources.map(item => item.category))].sort()); }).catch(() => {}); }, []);
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (availability) params.set('availability', availability);
      if (category) params.set('category', category);
      requestJson<{ resources: Resource[] }>(`/resources?${params.toString()}`, { signal: controller.signal })
        .then(({ response, data }) => { if (controller.signal.aborted) return; if (!response.ok || !data) throw new Error('Unable to load resources.'); setResources(data.resources); })
        .catch((reason) => { if (!controller.signal.aborted) { setError(apiErrorMessage(reason, 'Unable to load resources.')); setResources([]); } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search, availability, category]);

  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12"><div className="page-heading mb-8"><p className="font-semibold text-primary">Resource directory</p><h1 className="mt-2 text-4xl font-bold tracking-tight">Discover shared resources</h1><p className="mt-3 max-w-2xl text-slate-600">Search verified listings with transparent availability and eligibility rules.</p></div><AIMatcher /><section aria-label="Resource filters" className="card mt-8"><div className="grid gap-4 md:grid-cols-[1fr_180px_180px]"><label className="text-sm font-semibold">Search<input className="input mt-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try projector, studio or lab" /></label><label className="text-sm font-semibold">Category<select className="input mt-1" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(item => <option key={item} value={item}>{item}</option>)}</select></label><label className="text-sm font-semibold">Availability<select className="input mt-1" value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="">All statuses</option><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="maintenance">Maintenance</option></select></label></div></section><p className="mt-6 text-sm text-slate-500" role="status">{loading ? "Searching the catalog…" : `${resources.length} resource${resources.length === 1 ? "" : "s"} found`}</p>{error && <p role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{error}</p>}{loading ? <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><div className="h-48 animate-pulse rounded-2xl bg-slate-200" /><div className="h-48 animate-pulse rounded-2xl bg-slate-200" /></div> : <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{resources.map((resource) => <article className="resource-card" key={resource.id}><Link href={`/resources/${resource.id}`} tabIndex={-1} aria-hidden="true"><ResourceImage title={resource.title} imageUrl={resource.imageUrl} /></Link><div className="flex flex-1 flex-col p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-primary">{resource.category}</p><h2 className="mt-1 text-xl font-bold"><Link href={`/resources/${resource.id}`} className="hover:text-primary">{resource.title}</Link></h2></div><span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${resource.availability === 'available' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{resource.availability}</span></div><div className="mt-4"><ResourcePrice paise={resource.hourlyPricePaise} /></div><p className="mt-4 line-clamp-3 text-slate-600">{resource.description}</p><div className="mt-5 flex flex-wrap justify-between gap-2 border-t pt-4 text-sm text-slate-500"><span>{resource.location}</span><span>Shared by {resource.ownerName}</span></div><Link className="btn resource-details-link mt-5" href={`/resources/${resource.id}`}>View details <span aria-hidden="true">↗</span><span className="sr-only"> for {resource.title}</span></Link></div></article>)}</div>}{!loading && !error && resources.length === 0 && <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-10 text-center"><p className="font-semibold text-slate-700">No resources match these filters.</p><button className="mt-3 text-sm font-bold text-primary hover:underline" onClick={() => { setSearch(''); setCategory(''); setAvailability(''); }}>Clear filters</button></div>}</main>;
}
