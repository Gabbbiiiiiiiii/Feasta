# Step 171: Provider package pricing and guided editor

Implemented on `chore/monorepo-setup`, starting at
`fdef299dcc4e3ae5b5656cb394b2380246439115`.

## Pricing contract

- Optional `pricingModel`: `per_pax` or `per_bundle`. Absence preserves legacy fixed pricing.
- `price` remains the lowest enabled `serviceOptions[tier].price` in PHP.
- For `per_pax`, each tier price is a unit price per person. The resolver validates
  the integer guest count against the stored minimum/maximum and multiplies
  integer centavos by guests. It never accepts a browser subtotal.
- For `per_bundle`, each tier price is fixed throughout the configured guest range.
  There is no guest multiplier or invented extra-bundle charge.
- Canonical prices require at most two decimal places. Calculated subtotals above
  PHP 10,000,000 are rejected, consistent with the supported package money envelope.
- Create/update persist the validated model. Legacy edits keep their original
  semantics unless the provider explicitly chooses a canonical model.
- Existing payment policies and saved booking/payment snapshots are unchanged.
  The booking resolver supplies its calculated subtotal to the existing payment pipeline.

## Provider experience

Five steps: Basic Details, Pricing & Capacity, Food Menu, Services & Media,
Review & Save. The editor retains values between steps and hydrates draft edits.
It includes progress, Back/Next controls, validation, heading focus, a live price
and capacity summary, price-unit labels, payment terms, review, and draft saving.
Service tiers, included services, themes, owned image uploads, optional furniture,
decorations, and the legacy publishing workflow remain available.

Food categories are editor group labels encoded as `Category: Dish` in the existing
`foodInclusions` string array. Uncategorised legacy inclusions remain readable.
There are no sample production dishes. Providers add/remove their own dishes;
every listed dish is included. Empty new rows are omitted. Existing server bounds
of 50 inclusions and 160 characters per inclusion still apply.

Customer-configurable category counts, substitutions, and surcharges are explicitly
unavailable. Categories are not a new customer selection-rule contract.

## Release gates and Pia's Mobile handoff

Canonical models are intentionally **draft-only**. Publication rejects them,
provider cards disable Publish with an explanation, Customer Web normalization
excludes them, and booking package validation rejects direct attempts. No client
capability flag can bypass these gates. Legacy published packages retain their flow.

Before removing these gates in a coordinated release, Customer Web and Mobile need:

1. Read the optional model; absent means legacy fixed price. Reject/hide unknown models.
2. Label tier prices as PHP/person for Per Pax and fixed package price for Per Bundle.
3. Calculate display-only estimates using integer centavos and validated guest counts.
   Never multiply bundles by guests. Explain min/max capacity in customization.
4. Submit stable package/tier/theme IDs and guest count, never financial totals.
5. Confirm the server-calculated amount before payment, and consume immutable
   booking financial snapshots for existing bookings instead of recalculating from packages.
6. Verify full payment, deposits, remaining balances, themes, add-ons, invalid/stale
   selections, and old client behavior. Keep custom category-selection rules disabled
   until there is a separately validated end-to-end contract.
7. Add immutable model/unit-price/guest-count pricing context to new booking snapshots
   as part of that release; existing snapshots must remain untouched.
8. Remove the gates together in package publication, booking-contract validation,
   public normalization, and the Provider Publish button only after compatibility tests pass.

No Customer Mobile files were changed. Customer Web's new pricing display and
customization are not released by this change; availability is gated instead.

## Files changed

- `apps/web/src/app/provider/packages/provider-package-form.tsx`
- `apps/web/src/app/provider/packages/provider-package-food-menu.tsx`
- `apps/web/src/app/provider/packages/provider-package-offer-builder.tsx`
- `apps/web/src/app/provider/packages/provider-package-card.tsx`
- `apps/web/src/lib/provider/provider-package-client.ts`
- `apps/web/src/lib/customer/discovery/public-package-normalization.ts`
- `apps/web/test/components/provider-package-management.test.tsx`
- `apps/web/test/components/customer-packages.test.tsx`
- `functions/src/packages/package-domain.ts`
- `functions/src/packages/create-provider-package.ts`
- `functions/src/packages/update-provider-package.ts`
- `functions/src/bookings/booking-package-offer.ts`
- `functions/src/bookings/booking-contract.ts`
- `functions/src/bookings/submit-booking-request.ts`
- `functions/test/package-pricing-model.test.cjs`
- This handoff document.

## Verification

- Web TypeScript `tsc --noEmit`: passed.
- Functions direct TypeScript compilation: passed. The runtime preparation/build
  script was deliberately avoided to preserve the already-modified generated manifest.
- Functions ESLint: passed with warnings (604 warnings in the full source tree).
- Focused Web ESLint: passed. Full Web ESLint: passed with one existing unused-import warning in `customer-booking-experience.tsx`.
- Focused Vitest: 51 passed across provider management, offer configuration,
  category form contract, and customer package marketplace.
- Node tests: 97 passed across pricing, booking contracts/offers, package management,
  package payment terms, payment security, and booking payment agreements.
- Added coverage includes centavo calculations, capacity, trusted tier prices,
  legacy behavior, invalid models/precision, publication/direct-booking gates,
  financial snapshot compatibility, wizard navigation, dish preservation, saving,
  and customer discovery gating.
- The first UI regression run found a visibility assertion tied to the old long
  form. The test now navigates to Pricing & Capacity before inspecting payment terms.
- No browser visual inspection, emulator tests, or deployed integration tests were run.
  The two design documents referenced by the task were not included in the attachment;
  visual styling follows the existing FEASTA components and the supplied task requirements.

No deployment, emulator launch, production-data mutation, commit, push, branch
switch, clone, reset, clean, or worktree creation was performed. The pre-existing
local change to `functions/vendor/shared-types-manifest.json` was preserved.
