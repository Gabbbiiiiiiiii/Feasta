# FEASTA implementation map — read before editing

Repo: https://github.com/Gabbbiiiiiiiii/Feasta ; default/production-impacting branch: `chore/monorepo-setup`. Local path reported for the project: `C:\flutterProject\feasta`. Treat deployed state as distinct from a source commit; verify it, don't assume.

| Concern | Inspect first |
|---|---|
| Web brand/tokens | `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx` |
| Web page routes | `apps/web/src/app/customer/`, `provider/`, `admin/` |
| Web shared UI | `apps/web/src/components/ui/`, `forms/`, `feedback/`, `data/`, `layout/`, `shared/` |
| Web icons | `lucide-react` usages and current icon conventions |
| Flutter UI | `apps/customer_mobile/lib/features/customer/`, `core/widgets/`, `core/theme/` |
| Flutter startup/routing | `apps/customer_mobile/lib/app/` |
| Shared domain contracts | `packages/shared-types/src/`, `contracts/customer-event-list/` |
| Booking authority | `functions/src/bookings/` (especially submit paths, availability preparation, restrictions) |
| Availability + capacity | `functions/src/provider-availability/`, `functions/src/providers/update-provider-availability.ts` |
| Provider walk-ins | `apps/web/src/lib/provider/bookings/walk-in-booking-service.ts` |
| Initial payments/deadlines | `functions/src/payments/`, including settlement, initial-payment-reservation, expiration and reconciliation |
| Cancellations/refunds | `functions/src/cancellations/`, `functions/src/refunds/` |
| UI tests | `apps/web/test/components/`, Flutter tests beneath `apps/customer_mobile/test/` |
| Functions tests | `functions/test/` |

**Known 2026-11-19 state:** provider availability now exposes `acceptsMultipleEventsPerDay` and `maxEventsPerDay`; occupied day slots aggregate eligible online bookings and provider walk-ins. Do not revive the old universal one-event-per-day assumption. **Yet:** source presence does not certify production correctness; test affected paths.

**High-risk shared behavior**: FEASTA books one or multiple provider services; customer customization drafts and saved Event Lists are distinct; booking submission has server checks and replay/recovery contracts; initial-payment expiration is a separate trusted engine; payment reconciliation, cancellation and three-strike restrictions have documented invariants. Do not relax or bypass them for UI convenience. Preserve step data, retry journal, authorization and provider availability reservations.

**Implementation policy:** migrate one screen/flow at a time; first search for reusable components, then change smallest possible layer; retain proper separation of presentation/domain/server. Prefer targeted tests and type checks. No blanket style rewrite or global dependency upgrade during page review.
