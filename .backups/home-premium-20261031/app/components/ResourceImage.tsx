'use client';
import Image from 'next/image';
import { useState } from 'react';
import { resourceImageUrl } from '../lib/api';

export default function ResourceImage({ title, imageUrl, large = false }: { title: string; imageUrl?: string | null; large?: boolean }) {
  const [failed, setFailed] = useState('');
  const kind = /computer/i.test(title) ? 'computer-lab' : /projector/i.test(title) ? 'projector' : /camera/i.test(title) ? 'camera' : /meeting|conference/i.test(title) ? 'meeting-room' : /workshop|maker/i.test(title) ? 'workshop' : /science|laboratory|lab/i.test(title) ? 'science-lab' : 'resource';
  const fallback = `/resources/${kind}.svg`;
  const uploaded = resourceImageUrl(imageUrl);
  const src = uploaded && failed !== uploaded ? uploaded : fallback;
  const [fallbackFailed, setFallbackFailed] = useState('');
  return <figure className={`resource-image ${large ? 'resource-image-large' : ''}`}>{src !== fallbackFailed && <Image src={src} alt={src === fallback ? `${title} — illustration of resource type` : `${title} — owner-uploaded resource photo`} fill sizes={large ? '(max-width: 768px) 100vw, 70vw' : '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'} loading={large ? 'eager' : 'lazy'} unoptimized onError={() => { if (src === fallback) setFallbackFailed(src); else setFailed(src); }} className="object-cover" />}<figcaption>{src === fallback ? 'Resource illustration' : 'Photo provided by the resource owner'}</figcaption></figure>;
}
