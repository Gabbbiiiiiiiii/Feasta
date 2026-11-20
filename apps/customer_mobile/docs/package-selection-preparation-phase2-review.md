# Phase 2 booking preparation review - 2026-10-18

Implemented directly in apps/customer_mobile on feat/mobile-customer-parity. This is package selection, event customization and review only. The new preparation route cannot submit a booking or initiate payment. The four existing commits, including ab390e5, remain intact. All prior Phase 1, generated-plugin, platform/branding and diagnostic changes were retained.

## Existing architecture and findings

ProviderProfileScreen already uses packagesByProvider, whose public query requires providerId, isActive=true, isPublished=true, providerPubliclyVisible=true, status=published and isDeleted=false, with the existing 20-result bound and ordering. PackageDetailsScreen already displayed descriptions, prices and inclusion groups and opened EventCustomizationScreen after a guest login check. EventCustomizationScreen already had event date/start/end time, guests, manual address fields, inclusion checklists, provider add-ons and a separate add-on marketplace. EventCustomizationData already carried selections to subsequent routes. CustomerPlanScreen separately stores general plan preferences and selected addresses; there was no provider/package-scoped booking preparation draft to reuse.

The old customization route entered AvailabilityCheckScreen, which uses a limited client query against mainEvents, then BookingSummaryScreen with a Submit Booking Request button. That path is not the new preparation flow. Existing submission/cancellation/refund/payment implementations remain in place for their pre-existing callers; this phase neither expands them nor invokes them.

PackageModel omitted publication flags needed for revalidation, only consumed imageUrl, and converted missing prices/capacity to zero. The existing web package contract also supports imageUrls, serviceOptions and themeOptions. The existing server booking-package-offer contract defines drop_off, buffet_setup and full_service prices/includedServices, and permits optional theme IDs for buffet_setup/full_service. Those fields, rather than new Firestore fields, supply the added controls.

## Implemented journey

Provider Profile > Packages > existing Package Details > Select Package > existing Customize Event > Review Event. Guest users can inspect public details and must use the existing login modal before customization. Select Package performs a server-source, read-only package and provider eligibility check before continuing. Missing, unpublished, inactive, mismatched, deleted or no-longer-public packages are rejected; connectivity/permission failures show retry/choose-another guidance. Selection has a loading state and prevents double navigation. Existing package streams continue to provide their loading/empty/error states.

The current first imageUrls entry takes precedence over legacy imageUrl, matching the existing web hero contract. No source images or unrelated stock images are substituted. Missing hero images use a compact 112-pixel neutral banner; an available URL uses a proportional 240-pixel cover. Small customization/review thumbnails use an opt-in icon-only fallback, fixing a reproduced RenderFlex overflow in the former label-plus-icon placeholder. Other image widgets keep their previous fallback behavior. A failed selected image shows a neutral fallback; this implementation does not provide a multi-photo gallery or automatically retry all gallery entries.

## Customization and validation

The existing form is reused. Package event type is retained; when it is absent, provider-supported event types are used. Dates/start times must be in the future, and end time must follow start time on the same date. Overnight events are not implied. Guests support direct numeric entry and existing +/- controls; positive counts and published range limits are enforced, including the existing server's 100,000 ceiling. Unknown capacity is stated explicitly rather than shown as a zero-guest package. The form can prepare details when limits are incomplete, but that does not establish backend submission eligibility.

Manual event-address text remains available, with an action into the existing ManualAddressScreen and its validators. An explicitly selected locally stored address seeds an empty address field without replacing user edits/restored drafts. Review retains the resulting city/address text. Preparation validates Ormoc City and a nonempty full address. It neither requests GPS permission nor calls Google Maps. The existing backend event customization contract carries address text; no new coordinate fields are invented.

Food, decoration and furniture choices come only from package inclusion arrays. Fixed packages retain all inclusions and cannot toggle them off. Empty categories have no fabricated checklist options. Catering service-tier controls appear only when real serviceOptions exist; published tier prices replace the base package price. Theme choices come from real themeOptions, deduplicate invalid IDs, and appear only for buffet_setup/full_service. Changing tier clears the theme. Equipment/service information remains the published inclusions, with no invented configurator or pricing. Provider add-ons and the existing marketplace remain distinct supported sources; selected add-on documents and their providers are re-read before review. Provider-owned add-ons must still belong to the chosen provider. Duplicate add-on IDs are collapsed before review.

Before review, the package is revalidated again. Changed selections are reconciled with current options and the customer is asked to review them again. Invalid event types, tier/theme IDs, unavailable add-ons, provider/package mismatches, past dates, invalid guests and outside-Ormoc addresses cannot silently proceed. Fresh package/add-on prices are used in review and reflected back in the retained form state. Availability is always explicitly UNVERIFIED; preparation is not a reservation or acceptance.

The separate backend custom_menu journey uses menuItemId/servingOptionId. This phase's package journey does not invent menu catalog associations or serving quantities that are absent from its package data. It supports the published package inclusion choices and real service tiers. A separate custom-menu workflow would require deliberate reuse/integration of that existing contract.

## Draft and review behavior

PreparationDraftMemory stores only transient form snapshots, scoped to the current authenticated UID/provider/package. It reuses EventCustomizationData as the review payload rather than introducing another booking domain model or collection. Same-context Back/forward navigation retains partial date/time, guests, address, notes and supported choices. Review receives a copied immutable snapshot. Returning through Edit event details and selections opens the retained form. Returning to Package Details and selecting the same package restores the session draft. Changing account, provider or package clears incompatible state; stale routes cannot save into a new scope. Guest users do not create preparation drafts. No draft records or booking records are written to Firestore.

Drafts are intentionally in memory for the current application session, not durable across process termination or app restarts. There was no existing durable provider/package draft service to reuse. Durable draft synchronization would need a separately reviewed storage/security contract; it is not silently implemented through booking writes.

BookingSummaryScreen has an explicit preparationOnly mode. This path shows real provider branding, package, inclusions, selections, service/theme, date/time, guests, city/address, add-ons, notes and price estimate. Its footer edits the event; it has no submission/payment button, and its submit handler also guards against preparationOnly calls. Legacy submission mode is unchanged for existing callers. The form hides its footer while typing and uses scrollable content; narrow and enlarged-text layouts are covered by tests.

## Pricing behavior

Prices use FEASTA's existing PHP formatter. Missing/malformed numeric package/add-on prices remain unknown (NaN internally), with Price unavailable/Estimate unavailable UI rather than a fabricated zero. An explicitly published numeric zero remains a real zero price. Estimates add the selected service-tier price (or the ordinary package price) and current selected flat add-on prices. They do not multiply a flat package by guest count, alter prices when inclusion checkboxes change, add fees/taxes, invent discounts, or price customer-arranged services and free-text requests. Missing prices prevent a numeric total. Estimates explain that unpriced requests are excluded and confirmed charges require the authorized server booking flow.

## Security/backend handoffs before any future submission

Read and preserved the existing contracts in functions/src/bookings/submit-booking-request.ts, booking-package-offer.ts, booking-contract.ts, booking-payment-agreement.ts, booking-refund-policy.ts and the provider-availability handlers. No backend code was modified or deployed.

1. The authorized operations already exist: getBookingPaymentAgreementDisclosures and submitBookingRequest, protected by authentication/role/App Check and server validation. Do not replace them with direct client booking writes.
2. Disclosures must be fetched for the actual current selection before final submission. Agreement acknowledgments are providerId/agreementKey pairs tied to the current server agreement. Refund policyAcknowledgements use providerId/effectivePolicyKey and must follow the active server rollout/policy behavior. No acceptance is implied by reviewing this preparation screen.
3. The mobile createBookingRequest wrapper currently creates a timestamp-based clientRequestId on every call and sends neither current agreementAcknowledgements nor policyAcknowledgements. Before it is used for a future new flow, retain a stable request ID across retries, carry selected serviceTier/packageThemeId, and invalidate/re-fetch disclosures when relevant selections or policies change. This phase does not modify that submission wrapper.
4. checkCustomerProviderAvailability already provides an authenticated customer availability operation using canonical package/add-on selections and shared server capacity rules. Future integration must confirm deployed contract/access and label checks appropriately; a check is not a capacity reservation. The old client mainEvents count is not used by this preparation route and is not claimed as authoritative availability.
5. Server submission revalidates provider/package/add-on visibility and ownership, supported guest limits/event type, service/theme offers, and availability/capacity transactionally. Incomplete published min/max metadata must be corrected by the provider/backend workflow before submission; preparation does not invent it.
6. Payment/deposit eligibility, required upfront amount, deadlines and policy evidence are determined by current server payment-policy snapshots and the agreement disclosure, not by this local estimate. No payment terms, cancellation/recovery/refund protections or payment operations are changed here.
7. No missing new server write endpoint is assumed. The outstanding work is mobile integration and authorized environment verification for the existing endpoints, plus any separately approved durable-draft contract. No unavailable authorization was bypassed.

## Exact files changed in this phase (relative to apps/customer_mobile)

- lib/core/helpers/booking_preparation.dart (new)
- lib/core/widgets/badges/feasta_price_text.dart
- lib/core/widgets/images/feasta_image.dart
- lib/features/authentication/data/repositories/feasta_repository.dart
- lib/features/customer/addon_marketplace_screen.dart
- lib/features/customer/booking_summary_screen.dart
- lib/features/customer/event_customization_screen.dart
- lib/features/customer/package_details_screen.dart
- lib/features/customer/provider_profile_screen.dart (package repository forwarding only; hero/card/logo/tabs unchanged)
- lib/features/customer/widgets/booking_preparation_price.dart (new)
- lib/shared/models/event_customization_data.dart
- lib/shared/models/feasta_models.dart
- test/features/customer/booking_preparation_test.dart (new)
- test/features/customer/booking_preparation_flow_test.dart (new)
- docs/package-selection-preparation-phase2-review.md (this report, new)

## Validation

75 focused tests passed: 19 new preparation unit/widget tests plus the 56 prior Phase 1 tests, including the optional four unchanged public-logo local-file checks. New tests cover publication flags/association, imageUrls mapping, unknown prices/capacity, date/time and guest validation, Ormoc/manual location, inclusion and tier/theme choices, stale-option recovery, add-on price refresh, guest login boundaries, draft scope and Back/forward restoration, unknown estimate behavior, no submit action, unexpected-repository-operation detection and 1.0/1.3/2.0 text layouts. Existing Phase 1 profile goldens, circular-logo fitting, guest discovery, Explore navigation and location-panel tests pass without regenerating their baselines.

Changed-file Flutter analysis: no issues across all 14 changed Dart files. Final git diff --check: passed, with line-ending notices for pre-existing platform/generated files. Tests use local fixtures/fake repositories, not production record writes. The four optional logo tests read existing local downloads from the prior task; this phase made no new production Firestore reads for testing. Live package/add-on reads and deployed callable authorization were not integration-tested. No device build/install, data clearing, credential/configuration change, commit, push, merge or deployment was performed.

## Remaining realme C55 review

Browse actual published packages in Guest Mode, including real imageUrl/imageUrls data and missing images. Sign in through the existing modal, select the intended provider/package, customize date/time/guests, enter an Ormoc address through both supported manual paths, toggle published inclusion/add-on/service/theme options, and review prices and notes. Test Back/edit/reselect for the same package and then change package to verify incompatible choices clear. Check unknown price/capacity states, unavailable/depublished package and add-on handling, offline retry, narrow/large-font scrolling, keyboard dismissal/footer restoration and the absence of any submission/payment action. Confirm all Phase 1 profile imagery and navigation still match the approved device presentation. Google Maps credentials remain unresolved and unchanged.

Implementation stops for real-device review of booking preparation. Final submission/payment work requires a separate explicit scope.
