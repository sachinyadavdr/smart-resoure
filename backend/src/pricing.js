export const MAX_PRICE_PAISE = Number.MAX_SAFE_INTEGER;
export class PricingError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

// No coercion: null, booleans, numeric strings and fractional paise are invalid.
export function resourcePricingInput(body, partial = false) {
  const hasRate = Object.hasOwn(body, 'hourlyPricePaise');
  const hasMode = Object.hasOwn(body, 'pricingType');
  if (!hasRate && !hasMode) return partial ? {} : { hourlyPricePaise: 0 };
  if (hasMode && !['free', 'paid'].includes(body.pricingType)) throw new PricingError('Choose Free or Paid pricing.');
  if (hasRate && (!Number.isSafeInteger(body.hourlyPricePaise) || body.hourlyPricePaise < 0)) throw new PricingError('Hourly price must be a nonnegative safe integer in paise.');
  if (body.pricingType === 'paid' && !hasRate) throw new PricingError('An hourly price is required for a paid resource.');
  return { hourlyPricePaise: body.pricingType === 'free' ? 0 : body.hourlyPricePaise };
}

export function bookingEstimate(hourlyPricePaise, startsAt, endsAt) {
  if (!Number.isSafeInteger(hourlyPricePaise) || hourlyPricePaise < 0) throw new PricingError('The resource has an invalid hourly price.');
  const durationMs = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) throw new PricingError('End time must be after a valid start time.');
  // Integer arithmetic avoids binary floating-point errors and rounds once,
  // half-up to the nearest paise after prorating the exact millisecond duration.
  const rounded = (BigInt(hourlyPricePaise) * BigInt(durationMs) + 1800000n) / 3600000n;
  if (rounded > BigInt(MAX_PRICE_PAISE)) throw new PricingError('The estimated cost is too large. Choose a shorter time window.');
  return { currency: 'INR', hourlyPricePaise, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), durationMs, durationHours: durationMs / 3600000, estimatedTotalPaise: Number(rounded), estimateOnly: true };
}
