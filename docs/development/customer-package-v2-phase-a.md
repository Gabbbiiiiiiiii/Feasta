# Customer Web Package V2 Phase A

Step 2 uses sharedContractVersion === 2 to render fixed inclusions as read-only checks. Shared foods, decorations, furniture and services come from the published package normalization (foodInclusions, decorInclusions, furnitureInclusions, serviceInclusions); equipment comes from equipmentInclusions. Only the selected serviceOptions tier contributes includedServices, decorInclusions, furnitureInclusions and equipmentInclusions. Equivalent names are deduplicated within a category, preserving distinct categories and quantities. No prior customer checkbox state determines the offer.

Required foodChoiceGroups retain group/option IDs, exact counts, draft reconciliation and server validation. Completed groups show a dish-name summary while keeping all option cards visible; checked dishes can be deselected directly. Service-tier cards show each tier's own published benefits, prices, premium indicator and selection state; large provider-image theme cards follow the fixed inclusion groups. Service prices use the existing estimate helper; themes use published themeOptions/imageUrls, remain optional and free, and retain tier restrictions and device-only inspiration notes.

V2 restores and submits empty selectedFoods, selectedDecorations and selectedFurniture arrays. They are legacy customer-selection fields, not fixed inclusion snapshots. Legacy packages retain their selections. No client prices or new payload fields are introduced.

## Existing backend snapshot and Phase C boundary

Reviewed functions/src/bookings/submit-booking-request.ts and booking-package-offer.ts, plus packages/offer-v2-validation.ts. The server validates foodChoiceSelections and resolves dish names from package IDs. It also independently derives pricing and offer/theme selection.

For a tiered offer with offerSchemaVersion === 2, resolveBookingPackageOffer already produces packageOfferSnapshotV2 from resolveOfferV2: tier, unitCentavos, shared plus selected-tier service/decor/furniture/equipment inclusions, fixed foodInclusions, revision and pricingModel. submit-booking-request spreads this selection into stored booking/provider-request data. These fixed inclusions are therefore already represented in that authoritative snapshot; they are not represented by the now-empty legacy arrays. This is code inspection, not a production-data verification.

The no-enabled-service-options branch returns the legacy selection snapshot without packageOfferSnapshotV2. Phase C should reconcile standalone/historical offer support and ensure every supported package path persists a complete authoritative fixed-inclusion snapshot, then align downstream review/receipt consumers with it rather than interpreting empty legacy arrays as no inclusions. Phase A changes no Functions or booking contract and does not backfill existing bookings.

No production Firebase data/configuration, provider publication, payments, feature gates or Mobile changes. No emulators, commits, pushes or deployment. Localhost screenshot review remains the release gate.
