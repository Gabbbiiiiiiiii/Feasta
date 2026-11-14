# Final package and event revisions ? 18 October 2026

Branch: `feat/mobile-customer-parity`. Implemented from the complete supplied written requirements. `revisions (1).pdf` was not found in the accessible attachments, so its screenshots could not be reviewed. Stop for realme C55 review; no installation or physical-device verification was performed.

## Six revisions

1. Package Details passes explicit `readOnly: true` to the existing shared ServiceOptionCards. It retains real published service titles, prices, descriptions and inclusions, removes Choose/Selected indicators and tap handlers, and suppresses selected styling regardless of selection data. Taps cannot change a draft or price. Select Package remains the preparation action, without the sliders icon.
2. Customize Package retains selectable mutually exclusive cards and emerald selection. A new ?Choose your catering service? heading and required-selection explanation precede them. Existing sequential validation, replacement-tier pricing, session memory and Review remain active.
3. A second tap on the selected published theme clears it. Another theme replaces it. Existing pricing excludes theme fees; no unsupported fees were added.
4. No theme needed clears the published theme and custom description. Request a custom theme clears published/no-theme selection, provides a description input and cancellation, and explicitly requires provider confirmation with no price included. Published-theme selection clears custom requests. Switching to drop-off clears incompatible theme information. Draft memory stores the choice and description; Review receives them as labeled text through existing `specialRequest`, preserving separately entered special requests. No Firestore fields were added. These are preparation notes, not provider approval or a submitted booking.
5. An automatic debounced advisory checker sits beneath schedule controls. It shows incomplete, checking, available, unavailable, and unable-to-verify states; failed checks offer Retry. Input identity includes provider, package, date, start/end time, guests and sorted canonical add-on IDs. Input changes immediately invalidate previous status; request generations discard stale completions, disposal cancels timers and prevents state updates, and identical inputs avoid repeated requests. Invalid times, past starts and unsupported guest counts do not initiate checks. Re-entering the event step creates a fresh check rather than treating a previously checked schedule as reserved.
6. The actual `PackageModel.eventType` is displayed read-only for a fixed category and remains constrained through draft restoration and fresh-package validation. Missing category displays a data limitation and prevents progression. The current package/backend contract publishes one scalar eventType; it does not expose multiple package-eligible categories. Provider-wide eventTypesSupported does not establish package eligibility and is not used to invent one. A constrained dropdown branch is retained for a future explicit list contract, but multi-category behavior cannot safely be activated with current data.

## Availability contract and limits

Inspected mobile `availability_check_screen.dart`, repository `checkProviderAvailability`, web `customer-provider-availability-client.ts` and `event-customization-experience.tsx`, and backend `functions/src/provider-availability/check-customer-provider-availability.ts` with the shared availability validator. The legacy mobile direct daily-event count is not used for this indicator.

The supported operation is `checkCustomerProviderAvailability` in `asia-southeast1`, called through Firebase Functions with the existing authentication/App Check setup and a 30-second timeout. Inputs: packageId, addonIds (canonical IDs, including selected provider and marketplace add-ons), eventDate (YYYY-MM-DD), eventTime/eventEndTime (24-hour HH:mm), guestCount. Provider ownership is resolved from server package/add-on records, not client authority. Server requires authentication, customer role, App Check and rate limiting (30 calls per ten minutes), validates published package/add-on eligibility, and evaluates scheduling, blocking, lead time, capacity and conflicts.

Response: `results`, containing providerId, available boolean, nullable reasonCode and safe message. The indicator requires exactly one matching catering-provider result, a boolean, nonempty bounded message, null reason on success or a recognized unavailable reason. Exceptions and malformed/missing results never produce availability. The displayed status concerns the selected catering provider; add-on providers may have separate results and remain subject to later server validation. No internal scheduling records are fetched by the widget.

Deployment, production access and current live results were not tested. Authentication failures, App Check failures, throttling, network failures and unavailable deployment show ?Availability could not be verified?; they never fall back to the daily count. This read is advisory, is not a reservation, and does not make preparation Review a submission. Booking submission must still revalidate capacity transactionally. No backend change is required to consume the existing callable, provided it is deployed and authorized in the target project. Multi-category package support needs an explicit backend/package contract; missing categories require provider data correction. Custom-theme fulfillment and quotes still need provider confirmation.

## Exact files modified for this request

- lib/features/customer/package_details_screen.dart
- lib/features/customer/event_customization_screen.dart
- lib/features/customer/widgets/package_option_cards.dart
- lib/features/customer/widgets/preparation_availability.dart (new)
- test/features/customer/package_customization_revision_test.dart
- test/features/customer/preparation_availability_test.dart (new)
- docs/final-package-event-revisions-review.md (new)

New local diagnostic transcripts: final-revisions-tests.txt, final-revisions-analysis.txt, final-revisions-new-tests.txt, final-theme-test.txt. Earlier diagnostic reports and goldens are retained. Existing dirty files were edited in place only where needed; no reset, checkout, commit, push, merge, deployment, security change, production-data write, maps configuration, booking submission or payment was performed. The seven generated-plugin files were not intentionally edited.

## Validation

Focused suites cover read-only Details taps, selectable customization cards, sequential validation, theme toggle and mutually exclusive no/custom choices, supported special-request text reaching Review, Back preservation, fee-free theme changes, fixed and missing categories, automatic availability checks, input invalidation, deduplication, out-of-order responses, failures, malformed responses and disposal. Existing suites retain replacement pricing, priced add-ons, refreshed package validation, keyboard behavior, unknown-price safety, four-step progress and responsive 360px layouts at 1x, 1.3x and 2x text, plus existing visual goldens. Multiple eligible package categories cannot be meaningfully tested because the contract does not publish them. Physical C55 rendering is pending.

Final results: 39 focused Flutter tests passed, including both existing golden comparisons. Changed-file Flutter analysis: no issues across six Dart files. `git diff --check`: passed (existing line-ending warnings only). See final-revisions-tests.txt and final-revisions-analysis.txt.

## Realme C55 review

1. Open an actual published package. Compare all published service titles, descriptions, prices and inclusions. Tap each Details card: no Choose/Selected styling or estimate/draft change should occur. Select Package should open preparation.
2. Enter a future date, valid start/end times, guest count and manual address. Confirm the fixed category has no dropdown. A package missing its category must explain the limitation. Confirm automatic availability transitions with a signed-in customer; change date/time/guests rapidly and verify old results cannot reappear. Test offline and Retry; failure must never show Available.
3. Continue, verify the service-selection heading and required-service validation, and switch between published tiers. Verify only one emerald selection and replacement pricing. Check theme select/deselect, No theme needed, custom request text, cancellation and choosing a published theme after a custom request.
4. Navigate Back/Continue and reopen the session draft. Verify valid choices persist, incompatible drop-off themes clear, and custom notes appear on Review as requiring provider confirmation. Confirm themes add no invented charge and selected priced add-ons remain counted once.
5. Check scrolling, footer alignment, safe areas, keyboard dismissal, and enlarged Android text on the physical C55. Review is preparation only; do not submit a booking or initiate payment.
