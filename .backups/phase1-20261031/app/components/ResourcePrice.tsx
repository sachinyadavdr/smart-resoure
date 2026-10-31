import { formatINR } from '../lib/pricing';

export default function ResourcePrice({ paise }: { paise?: number | null }) {
  const valid = typeof paise === 'number' && Number.isSafeInteger(paise) && paise >= 0;
  return <span className={`inline-flex max-w-full rounded-lg px-3 py-1.5 text-sm font-bold ${paise === 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-blue-50 text-blue-800'}`}>{!valid ? 'Price unavailable' : paise === 0 ? 'Free' : `${formatINR(paise)}/hour`}</span>;
}
export function BookingPrice({ hourlyPricePaise, estimatedTotalPaise }: { hourlyPricePaise?: number | null; estimatedTotalPaise?: number | null }) {
  if (hourlyPricePaise == null || estimatedTotalPaise == null) return <p className="mt-3 text-xs text-slate-500">No price estimate recorded for this booking.</p>;
  return <p className="mt-3 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900"><strong>Estimated cost: {hourlyPricePaise === 0 ? 'Free' : formatINR(estimatedTotalPaise)}</strong><span className="mt-1 block text-xs text-slate-600">{hourlyPricePaise === 0 ? 'No rental cost.' : `At ${formatINR(hourlyPricePaise)}/hour when requested.`} No payment collected through ResourceBridge.</span></p>;
}
