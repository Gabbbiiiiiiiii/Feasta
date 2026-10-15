# Customer web hydration audit

Scope: `apps/web`, continued from the existing working tree. Earlier uncommitted UI and routing work was preserved. Repository-wide searches were triaged into render paths, effects/subscriptions, event handlers, and server-only code; this is not a certification of every admin/provider screen.

## Findings and fixes

| Finding | Root cause | Resolution |
| --- | --- | --- |
| MarketplaceSearch date minimum | `useMemo(manilaDateValue)` independently read the server and browser clocks; crossing Manila midnight changes `min`. | Set the input minimum in an effect. Submission still validates against the current Manila date. |
| Booking customization date minimum | `useMemo(tomorrowDateValue)` had the same midnight boundary risk. | Set the minimum after commit, including when returning to the schedule step. Booking validation and mutations are unchanged. |
| Provider-card return links | Return-link normalization reran date-expiry validation during rendering. A clock boundary could strip planning fields from `href`. | Normalize return links with a fixed lower bound. Marketplace query parsing retains its current-date default. |
| Package-card links | Rendering reparsed event context against the current date. | Pass a fixed lower bound when serializing the supplied context. Destination validation still rejects expired dates. |
| Customer conversation timestamp | The label selected time versus date using the host's local "today". | Render month/day/time from the supplied timestamp with explicit `en-PH` and `Asia/Manila`. |
| Customer and provider verification email | Both pages read Firebase `auth.currentUser` directly during rendering. | Shared `useCurrentUserEmail` starts at `null`, subscribes after hydration, updates from Firebase, and unsubscribes on unmount. |
| Banner storage access (hardening, not a reproduced SSR defect) | Its existing fixed server snapshot was hydration-safe, but the client snapshot read storage during later renders. | A per-instance cached boolean is read during rendering; the subscription reads storage after commit and on the existing dismissal event. Session persistence, focus return, blocked-storage fallback and cross-instance dismissal remain intact. |

## Values intentionally left server-rendered

- Header identity is supplied by the server customer layout. Guest/authenticated markup does not consult Firebase during render. Auth mode starts closed; password/form state starts deterministically.
- Event Finder parses supplied URL defaults with a fixed date bound. Its date minimum and Start Your Event's date minimum were already set after mount.
- `ProviderEventContextPanel` is a Server Component in its production usage. Its date minimum is serialized in the RSC output, rather than recomputed by a hydrated client component.
- `LandingFooter` is used from Server Components. Its copyright year is serialized server output, not a client-side year calculation.
- Provider/package text, image choices, prices, capacity and discovery ordering derive from supplied data and canonical catalogs. Number formatting uses explicit locale; displayed planning dates/times use explicit Manila/UTC formatting.
- NotificationMenu starts with an empty snapshot, loading=true and open=false. Relative notification times are only displayed after its effect-based subscription supplies data.
- FirebaseBrowserInitializer already invokes browser/App Check initialization in an effect and produces no DOM. Firebase SDK exports do not determine marketplace render-time identity.
- Responsive layouts use CSS classes. Venue `useId` is unconditional; its tree is stable initially. Browser focus, scrolling, timers and form actions execute after mount or from event handlers.

No nesting repairs or unstable IDs were observed in the exercised hydration trees. Tests parse server HTML before hydrating and fail on console warnings/errors or recoverable hydration errors.

## Exact source paths inspected

Paths below are relative to `apps/web`; inspection includes targeted render/state/helper reads, not necessarily every line of each large file.

- `src/app/layout.tsx`
- `src/app/customer/layout.tsx`
- `src/app/customer/providers/page.tsx`
- `src/app/customer/messages/customer-messages-client.tsx`
- `src/app/login/login-form.tsx`
- `src/app/verify-email/page.tsx`
- `src/app/provider-verify-email/page.tsx`
- `src/app/provider-register/page.tsx`
- `src/app/page.tsx`
- `src/app/about/page.tsx`
- `src/app/how-it-works/page.tsx`
- `src/app/services/page.tsx`
- `src/app/become-a-provider/page.tsx`
- `src/components/customer/layout/customer-marketplace-header.tsx`
- `src/components/customer/layout/customer-marketplace-shell.tsx`
- `src/components/customer/layout/public-provider-marketplace-shell.tsx`
- `src/components/customer/layout/customer-auth-provider.tsx`
- `src/components/customer/layout/event-finder.tsx`
- `src/components/customer/providers/marketplace-welcome-banner.tsx`
- `src/components/customer/providers/customer-login-modal.tsx`
- `src/components/customer/providers/provider-event-context-panel.tsx`
- `src/components/customer/providers/provider-card.tsx`
- `src/components/customer/providers/provider-results.tsx`
- `src/components/customer/packages/public-package-card.tsx`
- `src/components/customer/packages/package-results.tsx`
- `src/components/customer/favorites/provider-favorite-control.tsx`
- `src/components/customer/discovery/marketplace-search.tsx`
- `src/components/customer/discovery/marketplace-active-event-strip.tsx`
- `src/components/customer/bookings/event-customization-experience.tsx`
- `src/components/customer/payments/customer-payments-client.tsx`
- `src/components/auth/customer-registration-form.tsx`
- `src/components/auth/logout-button.tsx`
- `src/components/auth/use-current-user-email.ts`
- `src/components/forms/password-input.tsx`
- `src/components/landing/start-your-event-form.tsx`
- `src/components/landing/event-venue-input.tsx`
- `src/components/landing/landing-header.tsx`
- `src/components/landing/landing-footer.tsx`
- `src/components/layout/notification-menu.tsx`
- `src/components/providers/firebase-browser-initializer.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/dialog.tsx`
- `src/lib/firebase/client.ts`
- `src/lib/auth/client-session.ts`
- `src/lib/customer/planning/event-planning-context.ts`
- `src/lib/customer/providers/provider-query.ts`
- `src/lib/customer/providers/provider-discovery-sections.ts`
- `src/lib/customer/discovery/package-query.ts`

## Exact files changed in this pass

- `src/app/customer/messages/customer-messages-client.tsx`
- `src/app/verify-email/page.tsx`
- `src/app/provider-verify-email/page.tsx`
- `src/components/auth/use-current-user-email.ts` (new)
- `src/components/customer/discovery/marketplace-search.tsx`
- `src/components/customer/bookings/event-customization-experience.tsx`
- `src/components/customer/providers/marketplace-welcome-banner.tsx`
- `src/components/customer/packages/public-package-card.tsx`
- `src/lib/customer/providers/provider-query.ts`
- `src/lib/customer/planning/event-planning-context.ts`
- `test/helpers/assert-hydration.tsx` (new)
- `test/components/customer-hydration.test.tsx` (new)
- `test/components/verification-hydration.test.tsx` (new)
- `test/components/customer-provider-availability.test.tsx`
- `test/components/customer-messages.test.tsx`
- `test/components/customer-packages.test.tsx`
- `test/components/marketplace-welcome-banner.test.tsx`
- `docs/hydration-audit.md` (new)

## External mutation and validation boundaries

`rg` found no `fdprocessedid` in production source. `git grep -n fdprocessedid -- apps/web` found only the pre-existing provider-authentication absence assertion; the new hydration helper also asserts its absence. No production accommodation for injected attributes was added. No hydration suppression, SSR disabling, or mounted-null guard was added.

The reported browser attribute is consistent with external DOM mutation; no extension was identified in this run. Verify `/customer/providers` in Incognito with extensions disabled or a clean browser profile. The tests exercise application hydration, not installed browser extensions.

The broader run included two unrelated provider registration assertions expecting `Login` while the existing untouched registration page renders `Log in`. Those assertions and that page were not changed by this pass. Known provider-detail failures were not rerun or claimed resolved.

## Final validation

- `pnpm.cmd exec tsc --noEmit`: passed.
- ESLint on all 17 changed TypeScript/TSX files: passed, no errors or warnings. This Markdown report is not an ESLint input.
- Broader run: 187 passed, 2 unrelated provider-registration presentation failures across 16 suites.
- Final booking recheck after the schedule-step commit adjustment: 17 passed, 0 failed (overlapping the broader run, not additional unique tests).
- Scoped `git diff --check`: no whitespace errors; Git reports existing LF-to-CRLF normalization notices.

Suites run (all under `test/components/`):

- `customer-auth-dialog.test.tsx`
- `customer-authentication.test.tsx`
- `customer-event-planning-marketplace.test.tsx`
- `customer-hydration.test.tsx`
- `customer-marketplace-discovery.test.tsx`
- `customer-marketplace-header.test.tsx`
- `customer-messages.test.tsx`
- `customer-packages.test.tsx`
- `customer-provider-availability.test.tsx`
- `customer-refund-policy-disclosure.test.tsx`
- `landing-event-discovery.test.tsx`
- `marketplace-welcome-banner.test.tsx`
- `provider-authentication.test.tsx`
- `provider-discovery-sections.test.tsx`
- `representative-screens.test.tsx`
- `verification-hydration.test.tsx`

No commit, push, deployment, backend changes or SSR suppression were performed. Clean-browser visual verification remains a human review step.
