# ResourceBridge AI hourly pricing

Implemented in the existing workspace on 2026-10-31.

## Owner and student experience

- Add/Edit Resource includes a responsive Pricing section with Free/Paid radio controls and an INR hourly-rate input for Paid. Paid requires a nonnegative amount with at most two decimal places. Conversion to paise uses integer arithmetic; zero is canonically displayed as Free. Free always saves zero.
- Editing preserves the saved rate. Changing other fields or photos without supplying pricing through the API leaves the rate unchanged.
- Resource cards in owner management, the owner dashboard, the public directory, AI results and resource details show Free or ₹X/hour.
- The booking form uses its existing local start/end fields to request a server estimate. It shows the rate, fractional duration, estimated total, rounding policy and explicit no-payment text. Submission is blocked while a valid estimate is unavailable or dates are invalid. Errors include a working Retry estimate action.
- If a rate changes after the estimate was shown, submission is rejected with `PRICE_CHANGED`, the form refreshes its rate/estimate, and the student can review before submitting again. It never automatically submits the higher estimate.
- Booking history and owner request review display the original stored estimate and rate. Legacy bookings show “No price estimate recorded for this booking.” There is no payment processing, paid booking status, collection or payment-success simulation.

## API and arithmetic

- Resource JSON and multipart create/update APIs accept `hourlyPricePaise`, a nonnegative safe integer. `pricingType` optionally specifies `free` or `paid`; paid requires an explicit rate, free normalizes to zero. Omitting pricing on create defaults to zero; omitting it on PATCH preserves the existing rate. Existing API fields and upload behavior remain supported.
- Only the actual resource owner can change the rate. Unauthenticated, student and other-owner changes are rejected. Admin metadata oversight remains available, but an admin cannot change another owner's rate.
- Resource create/update/list/details, owner management, owner portfolio and AI catalog responses include `hourlyPricePaise`. Gemini receives verified database rates rather than generating prices; AI selection/eligibility behavior is otherwise retained.
- `POST /api/resources/:id/estimate` accepts ISO `startsAt` and `endsAt`, validates a future positive-duration window, and reads the hourly rate from SQLite. Like public listing details, this estimate endpoint is public. An estimate is not an eligibility/availability approval.
- Estimate responses contain `currency: INR`, `hourlyPricePaise`, normalized times, `durationMs`, `durationHours`, `estimatedTotalPaise` and `estimateOnly: true`.
- Calculation uses the exact elapsed milliseconds: `round_half_up(hourly_price_paise × duration_ms / 3,600,000)`. BigInt arithmetic rounds once to the nearest paise. There is no whole-hour rounding or minimum one-hour charge. Time-zone offsets and crossing midnight are supported. Invalid rates/windows and totals beyond JavaScript's safe integer range are rejected.
- Booking creation independently calculates the estimate from the stored rate. Browser-supplied totals, rate overrides and payment status are ignored. An optional `expectedHourlyPricePaise` checks freshness only; it is never the rate used in calculation. Legacy clients without this field remain supported.
- New booking requests store the rate and estimate at request time, including waitlisted requests. Later owner rate changes do not rewrite those estimates. Existing eligibility, availability, overlap, waitlist, booking-limit, decision and lifecycle checks are retained.

## Migration and database safety

Migration `006_hourly_resource_pricing.sql` adds:

| Table | Column | Default |
|---|---|---|
| resources | hourly_price_paise | 0 (Free) |
| booking_requests | quoted_hourly_price_paise | NULL (no historical quote) |
| booking_requests | estimated_total_paise | NULL (no historical quote) |

SQLite constraints enforce nonnegative stored integers up to 9007199254740991 paise. The existing transactional migration runner registers the new migration. No historical rate is inferred from a current listing.

**Restart the updated backend to apply the migration to the normal database.** Its startup migration runner applies pending migrations automatically. This task did not start or migrate the development database, edit environment files/secrets, change existing user records, or manually edit generated Next.js output. The development database's observed size/last-write time remained 286720 bytes / 2026-10-30 23:35:21.

Tests and browser actions used isolated databases/uploads. Browser requests were routed from the production frontend preview on 3100 to a separate in-memory API on 4201, leaving the existing server on 4000 untouched. Temporary routing, test login and test servers were cleared after verification.

## Verification completed

- Frontend production build: **passed**, including TypeScript checks and generation of all existing routes, via the existing build task.
- Editor diagnostics: **no errors** reported in frontend application/backend source.
- `npm.cmd run test --workspace backend`: **37 tests passed, 0 failed**. This includes all 26 existing tests and 11 new pricing tests. The final run also passed after removing an incidental price projection from the unrelated private condition-image query.
- Pricing tests cover legacy migration preservation/free defaults/NULL historical quotes; SQLite constraints; exact rupee input conversion and INR formatting; free/paid/zero rate normalization; JSON and multipart creates; invalid rates; rate consistency across APIs/AI fallback; ownership restrictions; metadata preservation; Free/Paid updates; fractional-hour rounding; time zones; millisecond precision; overflow rejection; invalid estimate windows; forged totals/payment status; server-calculated booking snapshots; later rate changes; stale quotes and refreshed/free booking requests.
- Existing upload tests still passed, including authorization, replacement/removal, invalid content, rollback cleanup and separate-process image persistence. Existing booking, lifecycle, AI fallback, notification and waitlist tests still passed.
- Browser: verified default Free selection, required Paid rate, rejection of a three-decimal rupee input, ₹150.50/hour creation, edit prefill, switching to Free and back, and owner dashboard/directory price visibility.
- Browser: verified **1.5 hours × ₹150.50/hour = ₹225.75**. Changing the owner's rate to ₹200/hour blocked the stale request without creating a booking, refreshed the estimate to ₹300, then saved a pending request with a ₹300 historical estimate and explicit no-payment text.
- Browser: verified Free booking creation; invalid time-window blocking; a simulated estimate-service failure blocking submission; and Retry recovering to a valid Free estimate.
- Browser: directory, details and booking history had no horizontal overflow at **390px, 768px and 1440px**. The owner Add form was also checked at 390px.
- No live Gemini request or payment collection was performed or claimed. SQLite experimental/type-detection warnings and the existing deliberately induced image-rollback error appeared in test logs; the tests passed.

## Exact changed/added files

| File | Change |
|---|---|
| [backend/src/pricing.js](./backend/src/pricing.js) | Pricing normalization, safe integer validation and exact duration-based estimate calculation |
| [backend/src/db/migrations/006_hourly_resource_pricing.sql](./backend/src/db/migrations/006_hourly_resource_pricing.sql) | Free defaults, integer constraints and nullable booking quote snapshots |
| [backend/src/db/migrate.js](./backend/src/db/migrate.js) | Register pricing migration |
| [backend/src/app.js](./backend/src/app.js) | Price persistence/responses, owner checks, estimate endpoint, booking calculations/snapshots and stale-rate protection |
| [backend/src/ai.js](./backend/src/ai.js) | Include verified hourly rates in the Gemini catalog/results |
| [backend/test/pricing.test.js](./backend/test/pricing.test.js) | Eleven isolated pricing, migration, validation and booking regression tests |
| [frontend/app/lib/pricing.ts](./frontend/app/lib/pricing.ts) | Typed estimates, exact rupee/paise conversion, INR formatting and time-window normalization |
| [frontend/app/components/ResourcePricingField.tsx](./frontend/app/components/ResourcePricingField.tsx) | Responsive Free/Paid owner form controls |
| [frontend/app/components/ResourcePrice.tsx](./frontend/app/components/ResourcePrice.tsx) | Shared resource-price badges and historical estimate display |
| [frontend/app/components/BookingEstimatePanel.tsx](./frontend/app/components/BookingEstimatePanel.tsx) | Server-backed estimates, loading/error/retry and no-payment disclosure |
| [frontend/app/owner/resources/page.tsx](./frontend/app/owner/resources/page.tsx) | Pricing fields, validation, payloads and management-card prices |
| [frontend/app/components/Dashboard.tsx](./frontend/app/components/Dashboard.tsx) | Owner resource price badges |
| [frontend/app/resources/page.tsx](./frontend/app/resources/page.tsx) | Public directory price badges |
| [frontend/app/resources/[id]/page.tsx](./frontend/app/resources/%5Bid%5D/page.tsx) | Details prices, estimate review, booking freshness checks and estimate confirmation |
| [frontend/app/components/AIMatcher.tsx](./frontend/app/components/AIMatcher.tsx) | Verified price display on recommendation cards |
| [frontend/app/bookings/page.tsx](./frontend/app/bookings/page.tsx) | Historical booking estimate display |
| [frontend/app/owner/requests/page.tsx](./frontend/app/owner/requests/page.tsx) | Historical estimate display during owner review |
| [HOURLY_PRICING_REPORT.md](./HOURLY_PRICING_REPORT.md) | This implementation/change/verification report |

Temporary transformation scripts were removed. No packages, authentication settings or unrelated database records were changed.
