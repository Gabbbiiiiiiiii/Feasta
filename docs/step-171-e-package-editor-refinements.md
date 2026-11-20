# Step 171-E: package editor corrections

Implemented directly on `chore/monorepo-setup`. Existing Step 171 changes and the
already-modified generated shared-types manifest were preserved. No backend,
booking, payment, refund, security, or Customer Mobile source was changed in this step.

## Root causes and corrections

1. The live summary used `lg:sticky lg:top-0` inside the package dialog's scrolling
   grid, with a translucent background. Scrolled fields could pass under it.
   It now occupies normal document flow with an opaque card background, without
   sticky, absolute, or z-index positioning. The original fixed dialog header and
   footer remain outside the scrolling area. Step navigation resets that area's
   scroll position and focuses the new heading without scrolling it into an overlap.
2. Food parsing recognized only a fixed category whitelist. Custom prefixes could
   not hydrate as distinct categories. Categories are now discovered from each
   package's `Category: Dish` inclusions, plus session-local categories and optional
   suggestions. No collections or schema changes were introduced.
3. Food save serialization reused a helper that deduplicated and sliced to 50.
   Food now has its own validation and serialization path: over-limit, blank,
   duplicate, or overlength values produce errors and remain available to edit.
   Nothing is silently sliced or filtered from the food form.
4. Dish and theme creation immediately exposed large inline inputs and mutated
   local parent draft state before the user finished. Both now stage edits in a
   child modal; Save applies them locally and Cancel discards that modal's changes.
5. The submit catch replaced every callable error with the same generic message.
   A safe classifier now distinguishes known unsupported-model errors, unavailable
   services, expired sessions, permission failures, rate limits, and validation
   failures. Arbitrary server messages and internal diagnostics are never rendered.
6. Moving the theme picker into a modal revealed a preview-lifetime problem:
   the picker normally revokes blob URLs on unmount. Theme editing now transfers
   preview ownership to the parent editor, which releases them when its editing
   session ends. Images still upload only in the existing package save workflow.

## Dynamic categories and food storage

- Add Category creates a package-local choice. Duplicate detection ignores case,
  Unicode compatibility differences, and repeated whitespace. Empty names, colons,
  control characters, and category names over 120 characters are rejected.
- There is no fixed count limit on logical category choices. The persisted food
  list retains its existing maximum of 50 inclusions and 160 characters per complete
  inclusion, including the category prefix and separator.
- Empty categories exist only during the current editing session. The UI explains
  that a category needs a dish to persist through package Save/reopen.
- Existing inclusion strings are retained while unrelated rows are edited or added.
  The parent form keeps the original string array, so blank or multiline legacy
  entries are preserved as records and reported for explicit correction, rather
  than silently filtered or split into new dishes.
  Uncategorized legacy dishes are supported. The first valid `: ` delimiter is
  treated as the category separator; subsequent delimiters remain in the dish name.
  The legacy contract cannot reveal whether an old string containing `: ` was
  originally intended as prose or a category, so its raw content is retained.
- New uncategorized dishes containing `: ` require an explicit category to avoid
  changing their interpretation on reload. Invalid legacy lists are shown intact
  and block saving until the provider explicitly corrects them. Existing server-side
  whitespace normalization remains in effect.
- Category suggestions are optional; no sample dishes are added to production data.
- Food customer-selection rules remain gated as in Step 171.

## Modal behavior

- Food's main view shows compact grouped rows with Edit actions. Add Dish opens
  category and dish-name fields, Save Dish, Save & Add Another, and Cancel.
  Remove Dish is an explicit action within Edit Dish.
- Add Category opens the category dialog. Choosing custom category creation from
  a dish switches the same child dialog's content and preserves the dish draft.
  It never creates a third dialog layer.
- Theme cards open Add/Edit Theme with the original name, description, image picker,
  validation, saved ID, and setup-tier restrictions. Cancel does not modify the
  package's theme array. Remove Theme is available within editing.
- Existing Radix dialog primitives provide the focus trap. Child overlays use
  z-index 60 and content 70, above the parent at 50. Escape closes the child without
  closing Create Package. Closing restores the opener, with an Add trigger fallback
  if a removed item no longer exists.
- Package images retain their direct picker; there is no intermediate upload modal.
- Adding categories, dishes, or themes makes no Firebase writes or Cloudinary uploads.

## Review and Save

Review now has separate responsive cards for package details, model/capacity,
service-tier prices and inclusions, categorized food, additional services, themes,
package images, and payment terms. Prices consistently use `PHP` and two decimal
places, with per-person versus fixed-package labels and Per Pax capacity examples.
Canonical pricing displays an explicit draft-only compatibility warning. The
existing publication, discovery, and direct-booking safety gates remain intact.

## Draft creation error diagnosis

Verified from the starting commit: `createProviderPackage` does not allow
`pricingModel`, and its unknown-field guard throws `invalid-argument` with
`Unsupported package fields: pricingModel.` for an otherwise current request.
The local Step 171 callable allows and validates that field, and the client sends
it without stripping or changing its financial meaning.

Given that the changed backend has not been deployed, a callable-version mismatch
is a supported explanation. The screenshot's generic error does **not** prove the
actual production response, and no production mutation or remote log lookup was
performed. Therefore the exact live cause remains unverified. Other failures receive
their own safe messages rather than being mislabeled as a confirmed version mismatch.

A regression test sends a canonical draft to a mocked old callable, verifies the
specific compatibility message, and confirms that the pricing model and form data
remain intact for retry. No deployment was performed to resolve compatibility.

## Files changed in this step

- `apps/web/src/app/provider/packages/provider-package-form.tsx`
- `apps/web/src/app/provider/packages/provider-package-food-menu.tsx`
- `apps/web/src/app/provider/packages/provider-package-offer-builder.tsx`
- `apps/web/src/app/provider/packages/provider-package-review.tsx` (new)
- `apps/web/src/lib/provider/package-food-inclusions.ts` (new)
- `apps/web/src/lib/provider/provider-package-save-error.ts` (new)
- `apps/web/src/components/ui/dialog.tsx` (optional child-overlay class)
- `apps/web/src/components/provider/catalog-image-uploader.tsx` (optional preview ownership)
- `apps/web/test/components/provider-package-management.test.tsx`
- `apps/web/test/components/provider-package-editor-refinement.test.tsx` (new)
- This report.

## Verification and remaining blockers

- Web TypeScript: passed.
- Focused ESLint for all changed source/tests: passed without errors or warnings.
  Full Web ESLint also passed with warnings: the existing unused import plus a
  temporary preview-config warning. That temporary fixture has been removed.
- Focused Vitest: 61 tests passed in five files. Covers categories, delimiters,
  inclusion limits, legacy preservation, add/edit/cancel/remove, repeated dish entry,
  nested-dialog count, Escape/focus return, theme validation/IDs, image preview
  ownership, wizard state/scroll reset, review, pricing, and save rejection handling.
- Node regression tests: 103 passed across pricing, inclusion validation, package/booking contracts,
  payment terms, payment security, and financial agreement behavior. No Functions
  source changes required recompilation for this UI correction.
- A local browser-preview attempt used mocked saves/uploads. The browser tool
  reported no available browsers, so desktop/mobile screenshot verification could
  not be performed. The temporary preview server was stopped and its fixture files
  were removed. Browser visual QA remains outstanding; no screenshot pass is claimed.
- Live callable compatibility remains a separate release dependency. The exact
  failed request needs its callable error or logs to establish a definitive live cause.

No deployment, emulator launch, production database mutation, branch switch,
repository/worktree creation, reset, commit, or push was performed.
