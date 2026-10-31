'use client';

import Image from 'next/image';
import { ChangeEvent, DragEvent, useEffect, useId, useRef, useState } from 'react';
import { resourceImageUrl } from '../lib/api';

export type PhotoSelection = { file: File | null; remove: boolean };
export default function ResourcePhotoField({ title, currentImage, value, onChange, onValidating, disabled }: {
  title: string; currentImage?: string | null; value: PhotoSelection;
  onChange: (value: PhotoSelection) => void; onValidating: (value: boolean) => void; disabled: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [checking, setChecking] = useState(false);
  const [failedImage, setFailedImage] = useState('');
  useEffect(() => {
    if (!value.file) { setPreview(''); return; }
    const url = URL.createObjectURL(value.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value.file]);
  useEffect(() => () => { sequence.current++; onValidating(false); }, [onValidating]);
  const choose = async (files: FileList | File[] | null) => {
    const request = ++sequence.current;
    setChecking(false); onValidating(false);
    if (disabled || !files?.length) return;
    if (files.length !== 1) { setError('Choose one resource photo at a time.'); return; }
    const file = files[0];
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPG, JPEG, PNG or WebP image.'); return; }
    if (!file.size || file.size > 5 * 1024 * 1024) { setError('Choose an image no larger than 5 MB.'); return; }
    setChecking(true); onValidating(true);
    try {
      const bitmap = await createImageBitmap(file);
      const tooLarge = bitmap.width * bitmap.height > 32_000_000;
      bitmap.close();
      if (tooLarge) throw new Error('Choose an image no larger than 32 megapixels.');
    } catch (reason) { if (request === sequence.current) setError(reason instanceof Error && reason.message.includes('32 megapixels') ? reason.message : 'This image could not be opened. Choose a valid JPG, PNG or WebP photo.'); return; }
    finally { if (request === sequence.current) { setChecking(false); onValidating(false); } }
    if (request !== sequence.current) return;
    setError(''); setFailedImage(''); onChange({ file, remove: false });
  };
  const selected = preview || (!value.remove ? resourceImageUrl(currentImage) : '');
  const image = selected !== failedImage ? selected : '';
  const remove = () => { sequence.current++; setChecking(false); onValidating(false); onChange({ file: null, remove: Boolean(currentImage) }); setError(''); if (input.current) input.current.value = ''; };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); void choose(event.dataTransfer.files); };

  return <section className="sm:col-span-2" aria-labelledby={`${id}-label`}>
    <h3 id={`${id}-label`} className="text-sm font-semibold">Resource photo</h3>
    <p id={`${id}-help`} className="mt-1 text-sm text-slate-500">Give your resource a great first impression. JPG, JPEG, PNG or WebP, up to 5 MB.</p>
    <div onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} className={`mt-3 rounded-2xl border-2 border-dashed p-4 transition sm:p-5 ${dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50/70'} ${disabled ? 'opacity-60' : ''}`}>
      {image ? <div className="flex flex-col gap-5 sm:flex-row sm:items-center"><div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-100 sm:w-56 sm:shrink-0"><Image src={image} alt={`Resource photo preview for ${title.trim() || 'your resource'}`} fill sizes="(max-width: 640px) 100vw, 224px" unoptimized className="object-cover" onError={() => { setFailedImage(selected); setError('The current image is unavailable. You can replace or remove it.'); }} /></div><div className="min-w-0"><p className="break-all text-sm font-semibold text-slate-800">{value.file?.name || 'Current resource photo'}</p><p className="mt-1 text-xs text-slate-500">{value.file ? `${(value.file.size / 1024 / 1024).toFixed(2)} MB · Ready to upload when you save` : 'This photo is saved with your resource.'}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" className="btn border border-slate-300 bg-white" disabled={disabled} onClick={() => input.current?.click()}>Replace image</button><button type="button" className="btn text-rose-700 hover:bg-rose-50" disabled={disabled} onClick={remove}>Remove image</button></div></div></div> : <div className="py-5 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-blue-100 bg-white text-blue-600" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 4-6 5 7" /></svg></div><p className="mt-3 text-sm font-semibold text-slate-700">Drag and drop your photo here</p><p className="mt-1 text-xs text-slate-500">or choose an image from your device</p><button type="button" className="btn mt-4 border border-slate-300 bg-white text-primary hover:bg-blue-50" disabled={disabled} onClick={() => input.current?.click()}>Choose image</button>{selected && <button type="button" className="btn mt-4 text-rose-700" disabled={disabled} onClick={remove}>Remove image</button>}</div>}
      <input ref={input} id={`${id}-input`} type="file" className="sr-only" aria-label="Resource photo" aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`} accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={disabled} onChange={(event: ChangeEvent<HTMLInputElement>) => { void choose(event.target.files); event.target.value = ''; }} />
    </div>
    {value.remove && <p role="status" className="mt-2 text-sm text-slate-600">The photo will be removed when you save. <button type="button" className="font-semibold text-primary underline" disabled={disabled} onClick={() => { onChange({ file: null, remove: false }); setFailedImage(''); }}>Undo removal</button></p>}
    {error && <p id={`${id}-error`} role="alert" className="mt-2 text-sm font-medium text-rose-700">{error}</p>}
    {checking && <p role="status" className="mt-2 text-sm text-primary">Checking your image…</p>}
  </section>;
}
