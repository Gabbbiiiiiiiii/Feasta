# Phase 5 design system

Status date: 2026-07-18

Phase 5.2 establishes FEASTA's shared design tokens and foundational theme.
Phase 5.3 adds Flutter presentation-only primitives under
`apps/customer_mobile/lib/core/widgets/`. Phase 5.5 establishes the equivalent
Next.js Shadcn-compatible primitive library under `apps/web/src/components/`.
These phases do not migrate every product screen.
Authentication, server route guards, App Check, Firebase Rules, and backend
authorization remain unchanged; UI visibility must never be used as an
authorization boundary.

## Sources of truth

Flutter tokens live in `apps/customer_mobile/lib/core/theme/`. The application
uses `AppTheme.light` from `app_theme.dart`. Web tokens live in
`apps/web/src/app/globals.css` and are exposed to Tailwind v4 through `@theme
inline` semantic utilities such as `bg-background`, `text-foreground`,
`border-input`, and `text-muted-foreground`.

Raw palette values belong only in these token sources. Product components use
semantic roles so contrast or branding can be corrected centrally.

## Color tokens

| Semantic role | Light value | Intended use |
| --- | --- | --- |
| `primary` | `#FF6333` | FEASTA brand surfaces and accents |
| `primaryForeground` | `#2B211D` | Text/icons on the primary brand surface |
| `primaryStrong` / `ring` | `#B83A12` | Orange text on light surfaces and focus rings |
| `background` | `#F8F6F3` | Page/canvas background |
| `foreground` / `mainText` | `#2B211D` | Main text |
| `card` / `surface` | `#FFFFFF` | Cards, dialogs, and form surfaces |
| `secondary` | `#FFF3EE` | Brand-tinted secondary surface |
| `secondaryText` | `#8C817A` | Required brand gray; large text or decoration only |
| `mutedForeground` / `secondaryTextAccessible` | `#6B625D` | Normal-size secondary text |
| `border` | `#E8E1DB` | Decorative dividers and surface borders |
| `input` / `controlBorder` | `#8C817A` | Boundaries of interactive controls |
| `destructive` / `error` | `#B42318` | Errors and destructive actions |
| `success` | `#166534` | Confirmed success state |
| `warning` | `#92400E` | Warning state |
| `info` | `#1D4ED8` | Informational state |
| `disabled` | `#D7CEC8` | Disabled control surface |
| `overlay` | 60% black | Modal scrim |
| `skeleton` | `#F1ECE8` | Loading placeholder base |
| `skeletonHighlight` | `#E6DED8` | Loading placeholder highlight |

The existing web application already followed the operating-system dark-mode
preference. Phase 5.2 preserves that behavior and maps every semantic variable
to a dark value. Dark mode is not otherwise expanded in this phase.

### Contrast rules

- `#FF6333` with `#2B211D` is 5.29:1 and passes WCAG AA for normal text.
- White on `#FF6333` is only 2.96:1 and is forbidden for normal-sized text.
- `#8C817A` on `#F8F6F3` is only 3.52:1. Use it for sufficiently large text or
  decoration; normal secondary copy uses `#6B625D` (5.51:1).
- Interactive control boundaries use `controlBorder`/`input`, not the subtle
  decorative border, so their visual boundary reaches at least 3:1.
- A semantic status may not be communicated by color alone. Pair it with text,
  an icon with a semantic label, or both.

## Typography hierarchy

Flutter exposes these named roles through `AppTypography`. Web uses the shared
system sans-serif stack until a bundled cross-platform font is approved.

| Role | Size / line height | Typical use |
| --- | --- | --- |
| Display | 40 / 48 | Hero heading only |
| Headline | 32 / 40 | Screen title |
| Headline small | 24 / 32 | Major section heading |
| Title | 20 / 28 | Card and section title |
| Body large | 18 / 28 | Introductory copy |
| Body | 16 / 24 | Default content |
| Body small | 14 / 20 | Supporting content |
| Label | 14 / 20, bold | Form/control label |
| Caption | 12 / 16 | Metadata; never core content below this size |
| Button | 16 / 20, bold | Action label |
| Helper/error | 12 / 17 | Form help and validation feedback |

Screens must use named theme styles and `copyWith` only for a semantic exception.
Do not create feature-local type scales.

## Spacing rules

The spacing scale is `4, 8, 12, 16, 20, 24, 32, 40, 48, 64` logical pixels.
Flutter names these `xxs` through `massive` in `AppSpacing`.

- 4–8: internal icon/text details and tightly related content.
- 12–16: normal control and card spacing.
- 20–24: section/card padding and page gutters.
- 32–40: separation between major content groups.
- 48–64: page-level or hero separation.
- Arbitrary spacing is forbidden unless an external platform/widget contract
  requires it and the reason is documented beside the value.

## Shape, borders, and elevation

Radii are 8 (`small`), 12 (`medium`), 16 (`large`), 20 (`card`), 24
(`dialog`), and pill/circular. Border widths are 1 px by default and 2 px for
focused or selected controls. Do not use pill radius for ordinary cards.

Elevation has four levels: none, card, floating control, and modal. A component
must not combine a strong shadow and strong border without a documented visual
reason.

## Responsive breakpoints

| Window class | Start width | Intended layout |
| --- | ---: | --- |
| Mobile | 0 | Single-column/mobile navigation |
| Tablet | 600 | Wider content or two-column opportunities |
| Laptop | 1024 | Desktop navigation and content rail |
| Desktop | 1280 | Full application shell |
| Large desktop | 1536 | Capped content with additional whitespace |

Flutter uses logical pixels. Web Tailwind breakpoints map `sm`, `md`, `lg`, and
`xl` to tablet, laptop, desktop, and large desktop. Content should be designed
mobile-first, constrained at large widths, and tested at the boundary values.

## Controls, icons, and motion

- Minimum mobile touch target: 48 x 48.
- Compact/default button heights: 48 / 56.
- Default input height: 56.
- Icon sizes: 16, 20, 24, and 32.
- Avatar sizes: 32, 40, 48, and 64.
- Collapsed/expanded sidebar widths: 72 / 280.
- Motion durations: 100, 160, 240, and 360 ms.
- Repeating or nonessential motion must stop when reduced motion is requested.
  The web foundation enforces a global reduced-motion fallback; Flutter
  components must consult platform accessibility settings when migrated.

## Intended and forbidden usage

Required:

- Choose semantic roles based on meaning, not the closest visual color.
- Use primary foreground whenever primary is a background.
- Use status tokens with text or semantics.
- Use focus tokens for keyboard focus and preserve visible focus indication.
- Use accessible secondary text for normal supporting copy.
- Keep shared UI components free of Firebase, repository, payment, or role
  authorization logic.

Forbidden:

- Raw brand hex values in product components.
- White normal-size text on FEASTA primary orange.
- Subtle decorative borders as the only visible boundary of a form control.
- Orange as a generic error color; use the destructive/error role.
- Arbitrary radii, shadows, control heights, or animation durations.
- Hiding a button as a replacement for server-side authorization.
- Moving trusted route/session checks into client-only UI components.

## Component usage examples

Flutter features import the barrel and provide data and callbacks. Domain
mapping stays in the feature layer:

```dart
import '../../core/widgets/widgets.dart';

FeastaPrimaryButton(
  label: 'Submit for review',
  isLoading: isSubmitting,
  onPressed: canSubmit ? submitVerification : null,
)

FeastaStatusBadge(
  label: 'Under review',
  tone: FeastaStatusTone.info,
)
```

Next.js features compose semantic utilities and shared components. Server route
authorization remains outside the presentation component:

```tsx
<PageHeading
  title="Provider verification"
  description="Review the submitted evidence."
  actions={<Button onClick={openReview}>Start review</Button>}
/>
<StatusBadge status="under_review" />
```

Forms always use a visible label and linked feedback:

```tsx
<FormField label="Business name" required error={errors.businessName}>
  <Input autoComplete="organization" />
</FormField>
```

These examples describe presentation only. `canSubmit`, `openReview`, and the
route itself must still be backed by server authorization and trusted lifecycle
validation.

## Flutter shared primitives

Import `core/widgets/widgets.dart` for the complete primitive library, or import
an individual implementation file when a feature needs only one category.

| Category | Components |
| --- | --- |
| Buttons | `FeastaPrimaryButton`, `FeastaSecondaryButton`, `FeastaTextButton`, `FeastaDestructiveButton` |
| Inputs | `FeastaTextField`, `FeastaSearchField` |
| Feedback | `FeastaLoadingIndicator`, `FeastaSkeleton`, `FeastaEmptyState`, `FeastaErrorState`, `FeastaSnackbars` |
| Dialogs | `FeastaConfirmationDialog`, `showFeastaConfirmationDialog` |
| Cards and badges | `FeastaCard`, `FeastaStatusBadge`, `FeastaPriceText` |
| Images | `FeastaImage`, `FeastaImagePlaceholder` |
| Layout | `FeastaContentContainer`, `FeastaAdaptivePadding`, `FeastaResponsiveGap` |

Core primitives accept display data and callbacks only. They must not import
Firebase packages, repositories, feature state, route guards, or business-role
models. Status badges use generic semantic tones; feature code remains
responsible for mapping a domain status to a tone and human-readable label.
Destructive actions must use explicit wording and confirmation where the action
cannot be easily undone. A disabled or hidden action remains a presentation
state and never replaces backend authorization.

## Next.js shared primitives

The web library follows the Shadcn composition model: primitives remain in
`components/ui`, while form composition, feedback, shared formatting, and
layout utilities live in their named component folders. `components.json`
records the local Shadcn aliases and Tailwind v4 CSS-variable setup.

| Area | Components |
| --- | --- |
| UI | `Button`, `Input`, `Textarea`, `Select`, `Badge`, and Radix `Dialog` wrappers |
| Forms | `FormField`, `PasswordInput`, `SearchInput`, `CheckboxField`, `RadioGroup` |
| Feedback | `LoadingSpinner`, `LoadingSkeleton`, `EmptyState`, `ErrorState`, `FeastaToaster` |
| Shared | `ConfirmationDialog`, `StatusBadge`, `PriceDisplay`, `ImagePlaceholder` |
| Layout | `ContentContainer` |

`FormField` supplies a stable control ID, visible label, accessible description,
required state, disabled/loading state, and linked client or server error to its
descendant FEASTA input. Do not render an unlabeled control. Icon-only buttons
must provide `aria-label` and usually a matching tooltip/title. Dialogs use the
Radix implementation so focus trapping, focus restoration, outside interaction,
and Escape behavior are not recreated locally. Mount one `FeastaToaster` at the
application root and invoke notifications through `feastaToast`.

## Next.js application shell

Authenticated customer, provider, and admin routes use one shared
`ApplicationShell`. Role-specific labels and destinations live in
`components/layout/navigation.ts`; the configuration affects presentation only.
Every protected route layout continues to call `requireRole` on the server
before rendering the shell.

The shell provides:

- a first-tab-stop skip link and one focusable `main` region;
- a sticky header with the role home brand link, notification action, and native
  keyboard-operable account menu;
- a desktop/laptop sidebar with visible active state and accessible collapsed
  mode;
- a mobile/tablet bottom navigation with 48-pixel-or-larger targets and safe-area
  padding;
- capped content width, adaptive gutters, and horizontal-overflow protection;
- `PageHeading` for one semantic `h1`, optional description, and actions that
  stack on narrow screens.

Navigation visibility and active styling never grant access. Missing, disabled,
blocked, revoked, or wrong-role sessions remain rejected by the server layouts
and session policy.

## Next.js data display and management

Generic management components live in `apps/web/src/components/data/`:

| Component | Contract |
| --- | --- |
| `DataTable<T>` | Receives one bounded page, typed columns, stable row IDs, optional controlled sort and row actions |
| `CursorPagination<TCursor>` | Returns supplied previous/next cursors without inventing offset pagination |
| `FilterToolbar` | Submits search/filter intent to its caller; it never filters only the visible table page |
| `DetailDrawer` | Radix-managed overlay inspector with focus trap, Escape close, and focus restoration |
| `ManagementModal` | Form modal with loading and server-error states; confirmation uses the existing shared dialog |
| `SummaryCard` | Responsive metric with optional computed trend and loading skeleton |
| `ChartContainer` | Accessible chart frame with range controls and loading, empty, error, and text-summary states |

Production callers own query execution, page limits, stable server sorting,
search indexes, cursors, and retry behavior. Passing a complete collection into
`DataTable` or applying a supposedly global search only to its current `rows`
array is forbidden. Representative protected scaffolds exist at
`/admin/providers`, `/provider/packages`, and `/customer/bookings`; they use
honest empty states until bounded backend queries are connected and do not
manufacture production records.

## Standardized application states

Flutter and Next.js use the same state vocabulary: full-page and section
loading, layout-matched list/table skeletons, domain-specific empty states,
recoverable failures, permission denial, connectivity/server failures, invalid
submissions, and expired sessions. Production UI uses friendly copy and never
renders raw exception objects or stack traces.

Loading takes precedence over empty content. Mutating buttons, form modals, and
confirmation dialogs remain disabled while a request is pending to prevent
duplicate submissions. Retry is offered only when repeating the operation is
safe; authorization denial is explicit and is never treated as a successful
empty response.

The representative migration covers Flutter bookings, favorites, and
notifications, plus the protected web provider, admin, and customer management
pages. The empty-state registry also defines notifications, payments,
complaints, verification submissions, reports, and search results for later
screen migrations.

## Application-state policies

Loading policy:

- A full-page loader is reserved for initial route content; section loaders and
  layout-matched skeletons preserve surrounding context.
- Loading precedes empty-state evaluation. A pending mutation disables its
  trigger and announces progress to prevent duplicate submission.
- Skeleton dimensions approximate the final card, list, table, or image shape.

Empty-state policy:

- Empty states state what is absent and, when useful, the safe next action.
- Search/filter emptiness is distinct from an empty collection and offers filter
  adjustment rather than creation language.
- Unknown or disconnected metrics use an em dash; sample production records are
  never fabricated to make a dashboard appear populated.

Error-state policy:

- Recoverable load, connectivity, and server failures may offer a safe retry.
- Permission denial and expired sessions remain explicit; they are not rendered
  as successful empty results.
- Production UI never displays stack traces, token contents, or raw backend
  exception strings.

Confirmation policy:

- Confirm destructive, difficult-to-reverse, privilege-changing, cancellation,
  block/unblock, approval/rejection, and sign-out actions when appropriate.
- Name the action and consequence. Use the destructive visual variant only for
  destructive outcomes.
- Confirmation remains busy until completion, prevents dismissal/double submit,
  and never substitutes for backend authorization or idempotency.

## Component do and don't examples

| Do | Don't |
| --- | --- |
| Use `AppColors.error` / `destructive` for an error | Reuse brand orange as a generic error |
| Use `primaryForeground` on primary orange | Put normal-size white text on `#FF6333` |
| Use `FeastaTextField` or `FormField` with a visible label | Use placeholder-only form controls |
| Map a domain status to a textual badge | Communicate status with color alone |
| Pass a bounded cursor page into `DataTable` | Load a full collection or search only the visible page |
| Put table overflow on its local container | Allow a table to create horizontal body scroll |
| Pass data and callbacks into core widgets | Import repositories or Firebase into shared UI |
| Keep `requireRole` and callable authorization | Treat a hidden/disabled button as access control |
| Show honest empty/unknown states | Fabricate dashboard counts or provider records |
| Reuse shared breakpoints and spacing tokens | Add one-off media queries and arbitrary gaps |

## Migration guidelines

1. Inspect the screen, its tests, data source, navigation, and authorization
   boundary before changing presentation.
2. Map raw values to semantic tokens. Fix contrast rather than mechanically
   preserving an inaccessible color pairing.
3. Replace feature-local primitives with the closest catalog component while
   preserving callbacks, validation, loading, and error behavior.
4. Keep fetching and domain mapping in the feature/container layer; shared
   components receive lightweight display data.
5. Verify narrow width, long content, large text, keyboard/semantics, loading,
   empty, error, and pending-action states.
6. Search the repository before deleting a private component. Delete only after
   no callers remain and affected tests pass.
7. Run `pnpm phase5:verify`. Do not weaken route guards, Rules, App Check,
   callable authorization, or Phase 3/4 regressions to make a UI migration pass.

The detailed reusable surface and adoption status are maintained in
`docs/design-system-component-inventory.md`.

## Accessibility requirements

- WCAG 2.2 AA contrast for normal text and meaningful non-text controls.
- Visible keyboard focus with at least a 2 px ring and 3 px offset on web.
- Programmatic labels, help/error associations, and live status announcements.
- Minimum 48 x 48 mobile touch targets.
- Keyboard operation for every interactive web control and Flutter custom
  control where a physical keyboard is supported.
- Text scaling without clipping or loss of action access.
- Reduced-motion behavior for animation and skeleton components.
- Color-independent status communication.

## Phase 5.9 accessibility hardening

Shared web layouts provide one main landmark, one page-level `h1`, a first-tab
skip link, named desktop/mobile navigation, persistent focus indicators, and
48-pixel controls. Radix dialogs retain focus trapping and restoration; the
account disclosure additionally closes with Escape and restores focus. Forms
use visible labels with linked descriptions/errors and `aria-invalid` only
when invalid. Loading and failure states use named live regions, tables retain
native header semantics, and every chart requires a text fallback summary.

Flutter controls use named semantics, padded Material tap targets, live error
semantics, logical next-field focus, grouped card containers, route-aware
dialog semantics, ordered dialog actions, and reduced-motion-aware transitions.
Representative booking and provider cards expose combined summaries while
retaining explicit actions, meaningful image descriptions, and textual status.

Automated coverage includes keyboard order, Escape behavior, focus classes,
field/error association, live regions, heading/landmark checks, image and
interactive-control names, Flutter focus traversal, semantics, minimum targets,
large text, dialogs, and reduced motion.

Known limitations:

- The web suite uses a local semantic DOM audit because axe-core is not
  currently installed. It detects common naming, landmark, image, and heading
  defects but is not a replacement for axe or browser accessibility trees.
- JSDOM cannot validate computed color contrast, CSS focus rendering, layout at
  browser zoom, or every native screen-reader interaction.
- Flutter widget tests cannot replace TalkBack/VoiceOver validation on physical
  devices or guarantee every legacy feature screen handles maximum text scale.
- Manual WCAG 2.2 AA checks remain required for supported browsers, Android
  TalkBack, iOS VoiceOver if an iOS customer build is shipped, 200% browser
  zoom, high-contrast settings, and real chart implementations.

## Phase 5.10 responsive layout hardening

Automated responsive checks cover 360, 390, 600, 768, 900, 1024, 1280, and
1440 logical/CSS pixels. Flutter continues to use the shared 600, 1024, 1280,
and 1536 breakpoints. Web Tailwind tokens map `sm` to 600, `md` to 1024, `lg`
to 1280, and `xl` to 1536 pixels; feature components must use those utilities
instead of one-off media queries.

Web shells now explicitly propagate `min-width: 0` and `max-width: 100%` through
the main content column. Page actions and filter controls wrap or stack, tables
own their horizontal scroll, chart content uses a local scroll container,
drawers remain fixed overlays bounded to the viewport, and the document body
clips accidental horizontal overflow. Drawer padding and summary-card padding
adapt at the shared mobile breakpoint without shrinking text or touch targets.

Flutter login and registration content is width-capped on tablets/desktops;
name fields stack below the tablet breakpoint and when text is enlarged.
Provider result cards use breakpoint-aware media width and text-scale-aware
height, ratings wrap, package metadata uses flexible rows, and shared content
containers retain adaptive gutters. Product cards, forms, states, dialogs, and
five-item navigation pass the requested width matrix, including 200% text at
360, 390, and 600 pixels.

Known responsive limitations:

- JSDOM verifies breakpoint classes and containment contracts but does not
  calculate CSS layout, actual `scrollWidth`, browser zoom reflow, safe-area
  insets, or visual overlap. Browser/device viewport review remains required.
- Firebase-backed Flutter login and registration screens are compile-analyzed
  and their responsive structures were inspected, but direct widget tests still
  require injectable Auth/Firestore dependencies instead of global SDK
  singletons.
- The representative product-card tests do not cover every legacy bespoke card
  embedded in older feature screens.
- Foldables, landscape phones below 360 logical pixels, desktop window widths
  above 1536 pixels, virtual keyboards, and platform-specific font substitution
  require manual validation.

## Phase 5.11 representative screen migration

The first production-screen migration deliberately covers a narrow vertical
slice rather than every feature. Flutter login now uses the shared text fields,
password disclosure, primary/secondary buttons, semantic colors, radii,
spacing, typography, and feedback presentation. Customer provider discovery
uses semantic tokens and the shared product presentation primitives. Booking
history retains its existing stream and navigation behavior while using shared
cards, status badges, buttons, snackbars, loading, empty, and error states.

The protected web shells now contain representative customer, provider, and
admin application screens. Customer coverage includes discovery and booking
history; provider coverage includes overview, verification progress, and
package management; admin coverage includes overview and the provider
table/inspector. These screens reuse page headings, filters, summaries, charts,
tables, pagination, drawers, status badges, buttons, and application states.
Role layouts and `requireRole` checks remain unchanged. Unknown dashboard
values render as an em dash, and disconnected collections render honest empty
states; the UI does not fabricate backend results or add untrusted mutations.

Migration limitations:

- Provider verification is currently a read-only progress surface. Document
  registration and submission remain in the existing trusted callable flow.
- The web discovery/history screens retain empty bounded-query states until
  their existing backend query adapters are connected in a later feature phase.
- Product-wide removal of legacy local colors and duplicate private widgets is
  intentionally deferred until each remaining screen is migrated and references
  prove safe to remove.

## Phase 5 verification

Run the complete local design-system gate from the repository root:

```powershell
pnpm phase5:verify
```

The command fails fast and runs:

1. shared-types and Functions TypeScript builds;
2. web lint and typecheck;
3. the complete web component suite plus explicit accessibility and responsive
   subsets;
4. a non-mutating Dart format check for shared Phase 5 sources, tests, and the
   representative migrated screens;
5. Flutter analysis with errors fatal and the documented legacy warning/info
   baseline visible;
6. the complete Flutter test suite, including primitive, semantics,
   accessibility, responsive, migration, and runtime-security tests;
7. the complete Phase 3 emulator regression suite;
8. Phase 4 adversarial-coverage and Flutter security source checks through
   `phase4:local`;
9. an optimized Next.js production build; and
10. Phase 5 artifact/documentation coverage validation.

Useful focused commands:

```powershell
pnpm --dir apps/web test:components
pnpm --dir apps/web test:accessibility
pnpm --dir apps/web test:responsive
pnpm phase5:flutter
pnpm phase3:verify
pnpm phase4:local
```

`phase4:verify` remains equivalent to the Phase 4 local checks plus the Phase 3
regression suite. `phase5:verify` invokes Phase 3 once and then `phase4:local`,
avoiding a duplicate emulator pass without weakening either gate.

The payment webhook integration uses `firebase.payment.test.json` and a
dedicated Firestore port. This prevents a slow Windows Java emulator shutdown
from colliding with the earlier Firestore/Storage Rules emulator while keeping
the payment test isolated and production-service independent.

Hosting validation similarly uses `firebase.hosting.test.json` so it does not
reuse the earlier auth-web Functions ports. The Phase 5 orchestrator records
pre-existing emulator-port owners and, on Windows, terminates only new processes
still listening on the known test ports when the command exits. This makes
successive verification runs repeatable without stopping a developer's
pre-existing emulator process.

No component showcase is implemented. The component inventory and automated
component suites are therefore the validated local catalog. If a showcase is
introduced, it must be development-only and added to this command.

Deployment-dependent App Check enforcement metrics and production bundle
evidence are intentionally not required for local Phase 5 verification. They
remain open production release gates under the Phase 4 acceptance documents.

## Known limitations

- Repository-wide Flutter analysis still reports legacy warning/info
  diagnostics. Phase 5 treats analyzer errors as fatal and prints the entire
  baseline; migrated representative files pass targeted analysis without issues.
- The repository-wide Dart format baseline contains legacy files outside the
  controlled Phase 5 migration. The gate checks the shared design-system files,
  their tests, and representative migrated screens without rewriting unrelated
  product code.
- There is no golden-image or real-browser visual regression suite. JSDOM and
  Flutter layout tests cannot prove pixel rendering, computed contrast, browser
  zoom, platform fonts, or safe-area behavior on physical devices.
- TalkBack, VoiceOver, high-contrast, and supported-browser keyboard acceptance
  remain manual release activities.
- Several older Flutter screens still contain feature-local raw values and
  private presentation widgets. They require controlled migration before safe
  deletion.
- Web discovery, history, verification progress, and dashboard metrics retain
  honest empty/unknown states until bounded backend adapters are connected.
- Production App Check enforcement and production client-bundle evidence remain
  Phase 4 deployment gates, not local design-system test inputs.

## Phase 5 checklist

- [x] Phase 5.1 static UI audit completed.
- [x] Flutter color, spacing, radius, typography, shadow, breakpoint, duration,
  and size tokens created.
- [x] Flutter application wired to the shared Material 3 theme.
- [x] Web semantic light and inherited dark variables created.
- [x] Web Tailwind v4 theme utilities mapped to semantic variables.
- [x] Existing web raw brand component classes migrated to semantic utilities.
- [x] Global web focus-visible and reduced-motion foundations added.
- [ ] Existing Flutter feature screens migrated off local raw values.
- [x] Shared Flutter primitive components implemented and widget tested.
- [x] Shared web component primitives implemented and component tested.
- [x] Responsive authenticated customer, provider, and admin web shells implemented.
- [x] Shared typed data-display and management components implemented and tested.
- [x] Representative Flutter and web application states standardized and tested.
- [x] Shared and representative Flutter/web accessibility behavior hardened and automated.
- [x] Shared and representative Flutter/web layouts hardened across the Phase 5.10 width matrix.
- [x] Representative Flutter customer and role-protected web screens migrated to shared Phase 5 components.
- [x] Component inventory and complete design-system usage policy documented.
- [x] `pnpm phase5:verify` passes locally (2026-07-18; exit code 0).
- [ ] Widget/golden/browser visual regression coverage established.
- [ ] TalkBack, VoiceOver, keyboard, screen-reader, text-scaling, and viewport
  acceptance completed.

Phase 5 is not complete. Token foundations and Flutter/web primitives are in
place; product-wide migration and manual assistive-technology acceptance remain.
