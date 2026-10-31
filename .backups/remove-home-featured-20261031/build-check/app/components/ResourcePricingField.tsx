'use client';
import { useId } from 'react';

export default function ResourcePricingField({ mode, amount, onMode, onAmount }: {
  mode: 'free' | 'paid'; amount: string; onMode: (mode: 'free' | 'paid') => void; onAmount: (amount: string) => void;
}) {
  const id = useId();
  return <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 sm:col-span-2" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`} className="text-base font-bold">Pricing</h3><p className="mt-1 text-sm text-slate-500">Choose how your community accesses this resource.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">{([{ value:'free', title:'Free', detail:'Share at no rental cost' },{ value:'paid', title:'Paid', detail:'Set an hourly rate in INR' }] as const).map(item => <label key={item.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${mode === item.value ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}><input className="mt-1 accent-blue-600" type="radio" name={`${id}-mode`} value={item.value} checked={mode === item.value} onChange={() => onMode(item.value)} /><span><span className="block text-sm font-bold">{item.title}</span><span className="mt-1 block text-xs text-slate-500">{item.detail}</span></span></label>)}</div>
    {mode === 'paid' ? <div className="mt-4 max-w-sm"><label htmlFor={`${id}-rate`} className="text-sm font-semibold">Hourly price (INR)</label><div className="relative mt-2"><span aria-hidden="true" className="absolute left-3 top-2.5 font-semibold text-slate-500">₹</span><input id={`${id}-rate`} className="input pl-8 pr-20" type="text" inputMode="decimal" value={amount} onChange={event => onAmount(event.target.value)} required pattern="[0-9]+([.][0-9]{1,2})?" maxLength={18} placeholder="e.g. 150.50" aria-describedby={`${id}-help`} /><span className="absolute right-3 top-3 text-sm text-slate-500">/ hour</span></div><p id={`${id}-help`} className="mt-2 text-xs leading-5 text-slate-500">Enter a nonnegative amount with up to two decimal places. A zero rate is displayed as Free.</p></div> : <p className="mt-4 text-sm font-semibold text-emerald-800">₹0 per hour. No rental charge is estimated.</p>}
    <p className="mt-4 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">Prices are used for booking estimates. ResourceBridge does not collect payments.</p>
  </section>;
}
