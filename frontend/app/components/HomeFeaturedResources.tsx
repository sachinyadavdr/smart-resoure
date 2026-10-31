'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { requestJson } from '../lib/api';
import { formatINR } from '../lib/pricing';
import ResourceImage from './ResourceImage';
import BrandGlyph from './BrandGlyph';
import styles from './HomeLanding.module.css';

type Resource = { id: number; title: string; category: string; location: string; availability: string; hourlyPricePaise: number; imageUrl?: string | null };

export default function HomeFeaturedResources() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(false); setResources([]);
    // The public endpoint owns discovery visibility, including demo exclusions.
    requestJson<{ resources: Resource[] }>('/resources', { signal: controller.signal, cache: 'no-store' })
      .then(({ response, data }) => {
        if (controller.signal.aborted) return;
        if (!response.ok || !Array.isArray(data?.resources)) throw new Error('Unable to load resources.');
        setResources(data.resources.slice(0, 3));
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  if (loading) return <div className={styles.resourceGrid} role="status" aria-label="Loading resource previews" aria-busy="true">{[0, 1, 2].map(index => <div key={index} className={styles.skeleton} aria-hidden="true"><div /><span /><span /></div>)}</div>;
  if (error) return <div className={styles.resourceState} role="alert"><BrandGlyph kind="search" /><div><h3>The catalog is taking a moment.</h3><p>We couldn’t load resource previews. Try again or open the resource directory.</p></div><button type="button" className={styles.textLink} onClick={() => setAttempt(value => value + 1)}>Try again <BrandGlyph kind="arrow" /></button></div>;
  if (!resources.length) return <div className={styles.resourceState} role="status"><BrandGlyph kind="space" /><div><h3>Room for the next possibility.</h3><p>No public resources are listed right now. Check back as owners share their spaces and equipment.</p></div></div>;
  return <div className={styles.resourceGrid}>{resources.map(resource => <Link href={`/resources/${resource.id}`} key={resource.id} className={styles.resourceCard}>
    <div className={styles.resourcePhoto}><ResourceImage title={resource.title} imageUrl={resource.imageUrl} /></div>
    <div className={styles.resourceBody}>
      <div className={styles.cardMeta}><span>{resource.category}</span><span className={resource.availability === 'available' ? styles.available : styles.otherStatus}>{resource.availability}</span></div>
      <div className={styles.cardTitle}><h3>{resource.title}</h3><BrandGlyph kind="arrow" /></div>
      <p className={styles.location}>{resource.location}</p>
      <div className={styles.cardBottom}><strong>{resource.hourlyPricePaise === 0 ? 'Free' : Number.isSafeInteger(resource.hourlyPricePaise) && resource.hourlyPricePaise > 0 ? <>{formatINR(resource.hourlyPricePaise)}<span> / hour</span></> : 'Price unavailable'}</strong><span>View resource</span></div>
    </div>
  </Link>)}</div>;
}
