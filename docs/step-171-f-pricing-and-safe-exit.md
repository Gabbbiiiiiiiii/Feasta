# Step 171-F: decimal pricing, dynamic preview, and safe editor exit

Implemented directly on `chore/monorepo-setup`, continuing the existing uncommitted
Step 171/171-E work.

## Numeric input cause and correction

The catering tier fields in `provider-package-offer-builder.tsx` used native
`type="number"`. Browsers accept exponent syntax in these controls; `min`, `max`,
and `step` do not constrain their editable alphabet. The previous serializer also
converted the text with `Number`, which accepts scientific notation.

Tier prices now use a controlled text input with `inputMode="decimal"`:

- Only ASCII digits and at most one decimal point, with up to two fractional digits,
  are accepted. Exponents, signs, non-finite names, grouping separators, and extra
  decimal places are rejected as a complete edit rather than filtered or truncated.
- Empty text is allowed while editing. It remains empty and cannot serialize as zero.
  A decimal point alone is an unfinished, invalid final price. Explicitly entered zero
  remains permitted because the existing server minimum is zero.
- Rejected input leaves the accepted price intact and shows an associated validation
  message. Its temporary error also blocks serialization and preview, so no stale
  estimate is presented as valid.
- Typing, selection replacement, deletion, paste, and IME composition are handled
  through text-change validation, without blocking navigation or shortcut keys.
  Composition is staged locally; completed text must meet the same rules.
- The client serializer independently checks decimal syntax and existing monetary
  bounds, including when the UI is bypassed. Monetary text is parsed into integer
  centavos before calculation. Backend validation is unchanged.
- Existing saved prices hydrate as their actual string values. New service tiers
  remain blank; no preset provider prices were introduced.

## Hardcoded examples and dynamic previews

Removed the Basic Details explanation in `provider-package-form.tsx` that used
`PHP 500 × 50 guests = PHP 25,000` and a `PHP 25,000` bundle example. No other
demonstration monetary defaults were found in the scoped package pricing components.

Replaced the implicit minimum-guest examples in the form's summary and
`provider-package-review.tsx`. The new summary has explicit Preview service tier
and Preview guest count controls. No tier or guest count is fabricated when absent.

- Per Pax: selected tier unit centavos × explicit valid preview guests.
- Per Bundle and legacy fixed pricing: the selected tier's fixed centavos, without
  a guest multiplier. The guest count must still be valid for the package.
- Each enabled tier retains its own entered price. Changing tier, price, model,
  guest count, capacity, or tier availability immediately changes or invalidates
  the estimate. Invalid/incomplete data does not fall back to zero or a prior total.
- Guest capacity must be an integer range within the provider's actual configured
  bounds. Subtotals use the existing supported maximum; out-of-envelope estimates
  are not displayed as valid.
- Missing inputs show: “Enter a price and guest count to preview the total.”
- Review uses that same explicit preview guest count for its individual tier estimates.
  Preview selection/count are local UI state and never submitted as financial authority.
- Summary remains in normal document flow; sticky overlap was not restored.

The numeric amounts still shown in monetary validation describe the existing
minimum/maximum contract. They are bounds, not example prices or provider defaults.

## Editor exit confirmation

The package-list client now routes top-right X, bottom Cancel, and parent Escape
through one existing `ConfirmationDialog`, including for untouched forms:

- Title: **Discard package changes?**
- Description: **Your unsaved package details, pricing, dishes, themes, and images
  will be lost if you close this editor.**
- Actions: **Keep editing** and **Discard changes**.

Opening confirmation does not reset or unmount the editor. Keep editing restores
focus to the initiating control and retains all form state. Discard closes locally
without calling package saves or image uploads and restores the listing opener.

The parent's outside-click dismissal remains disabled. Closing confirmation with
Escape or its own dismissal controls means Keep editing, not Discard. Its child
overlay/content stack above the parent and isolate Escape propagation. Dish,
category, and theme modals retain their existing staged-edit semantics and do not
invoke the parent's discard flow when only the child closes.

A synchronous busy ref and the existing visible busy state prevent exit/discard
throughout saves and uploads. Cancel is disabled and X is unavailable while busy.
Successful saves keep the original direct success-close path with no discard warning.

## Verification

- Web TypeScript: passed.
- Targeted ESLint across changed source and tests: passed.
- Focused Vitest: 81 tests passed across six files, including monetary input syntax,
  precision/bounds, blank/saved prices, paste/selection/IME, dynamic tier previews,
  bundle behavior, invalidated estimates, discard/focus handling, child modals,
  upload protection, and existing package/customer behavior.
- Expanded package-management preservation check passed after verifying Keep editing
  retains all five steps' data plus the explicit preview count.
- Node: 103 pricing, inclusion, package/booking, payment, and security regressions passed.
- Functions TypeScript was not needed: this step changes no backend source files.
- `git diff --check`: passed.
- Tests are component/domain checks; no new real-browser screenshot verification
  is claimed. The browser availability limitation recorded in Step 171-E remains.

## Files modified in this step

- `apps/web/src/app/provider/packages/provider-package-money-input.tsx` (new)
- `apps/web/src/app/provider/packages/provider-package-price-preview.tsx` (new)
- `apps/web/src/lib/provider/package-pricing-preview.ts` (new)
- `apps/web/src/app/provider/packages/provider-package-offer-builder.tsx`
- `apps/web/src/app/provider/packages/provider-package-form.tsx`
- `apps/web/src/app/provider/packages/provider-package-review.tsx`
- `apps/web/src/app/provider/packages/provider-packages-client.tsx`
- `apps/web/src/components/shared/confirmation-dialog.tsx` (optional nested-dialog props)
- `apps/web/test/components/provider-package-pricing-inputs.test.tsx` (new)
- `apps/web/test/components/provider-package-management.test.tsx`
- This report.

All prior local work remains uncommitted. Package models, server financial
authority, and draft-only publication/booking gates remain intact. Customer Mobile,
the generated manifest, production data, and live Firebase resources were untouched.
No deployment, emulator, branch/worktree/repository creation, reset, commit, or push
was performed. Live callable compatibility remains the separately documented
release dependency from Step 171-E.
