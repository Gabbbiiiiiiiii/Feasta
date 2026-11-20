# Provider Request Details V2 refinement and data trace

## Diagnosis

The previous reader required `mainEvents.cateringProviderId`. Submission actually writes `mainEvents.providerId` (and `currentProviderId` / `originalProviderId`). That mismatch rejected valid parent snapshots. Both `packagePrice` and `foodChoiceSelections` were therefore unavailable to the provider UI. The earlier regression fixture incorrectly used `cateringProviderId` too; it now uses the persisted schema.

This diagnosis is verified against repository submission code and targeted fixtures. No production booking was read or modified, so the actual contents of any specific historical booking have not been independently verified.

## Stored data and mapping

- Customer customization submits `foodChoiceSelections` with `groupId` / `optionIds` through `customer-booking-submission-client.ts`.
- `submit-booking-request.ts` calls `parseFoodChoiceSelections` and `resolveFoodChoiceSelections` inside its transaction. The resolver validates selected IDs against the trusted package and saves each group as `{groupId, title, selectionCount, options: [{id, name}]}`.
- The parent `mainEvents` booking stores those snapshots in `foodChoiceSelections`. The provider request does not directly duplicate that field.
- The parent stores server-calculated `packagePrice`. The provider request stores a matching `services` row with `category: catering_package`, `serviceId: packageId`, and `price: packagePrice`.
- Projection prefers explicit request `packagePrice`, then the authorized matching parent `packagePrice`, then exactly one matching saved catering-package service row. It never substitutes `amount`, `totalAmount`, financial gross amounts, or offer unit prices. Gross financial snapshots cover the request and can include add-ons; offer unit prices are not historical package subtotals for per-guest bookings.
- Tier label, theme name/description/image URLs, and resolved V2 inclusions are already stored on provider requests by `resolvedPackageOffer.selection`.
- Shared and selected-tier inclusions are stored as resolved combined category arrays. Their separate provenance is not recoverable from those arrays. Category duplicates are removed without merging live sources.

Parent reads remain scoped to an authenticated, approved provider's request. Parent fields are projected only when customer, parent provider, package ID, and stored request membership match. Only the normalized package presentation reaches the client.

## Presentation

One Request Details drawer remains. Its package title is an inline disclosure with `aria-expanded` / `aria-controls`, keyboard operation, and retained trigger focus. It reveals the saved package reference and categorized inclusions. Native disclosure controls collapse long inclusion lists. No second dialog, backdrop, navigation, or independent scroll region is created. Theme and selected dishes remain visible once, outside the disclosure. The package subtotal is distinct from payment obligations; accept/decline handlers and payment copy are unchanged. Legacy package summaries expand inline too.

## Historical gaps and follow-up

If a valid parent is missing, replaced, or unrelated, its dish choices are not exposed. A matching saved package service row can still supply the package subtotal. If neither attributable subtotal source exists, the UI says it was not recorded. ID-only food selections do not supply display names and are not resolved against a live package. Missing theme fields stay missing. No records are backfilled.

No backend change is needed for the current submission schema. For historical records lacking all snapshots, recovery requires a separately authorized audit of stored historical evidence. A future contract could duplicate food snapshots and an explicit package subtotal on each request to improve resilience; that contract change is outside this correction.

## Verification scope

Targeted Vitest covers saved values, the actual parent provider field, foreign parent rejection, package-only service attribution, exclusion of financial gross totals, one dialog, keyboard disclosure behavior, one theme image, legacy requests, read-only inclusions, and responsive wrapping classes. Layout checks in jsdom verify structure/classes, not actual browser geometry. Localhost visual review remains required.
