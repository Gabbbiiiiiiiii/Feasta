# FEASTA component inventory

Status date: 2026-07-18

This inventory records the reusable Phase 5 surface. A component listed here is
preferred over a feature-local replacement. Presentation availability does not
grant authorization; protected actions and data remain guarded by the trusted
backend and server route policy.

## Flutter

| Area | Public component | Source | Verification |
| --- | --- | --- | --- |
| Buttons | `FeastaPrimaryButton`, `FeastaSecondaryButton`, `FeastaTextButton`, `FeastaDestructiveButton` | `core/widgets/buttons/` | enabled, disabled, loading, semantics, touch target |
| Inputs | `FeastaTextField`, `FeastaSearchField` | `core/widgets/inputs/` | label/error association, password disclosure, focus order |
| Feedback | `FeastaLoadingIndicator`, `FeastaSkeleton`, `FeastaEmptyState`, `FeastaErrorState`, `FeastaSnackbars` | `core/widgets/feedback/` | loading semantics, actions, retry, reduced motion |
| Dialogs | `FeastaConfirmationDialog`, `showFeastaConfirmationDialog` | `core/widgets/dialogs/` | confirm, cancel, busy state, route semantics |
| Containers | `FeastaCard`, `FeastaContentContainer`, `FeastaAdaptivePadding`, `FeastaResponsiveGap` | `core/widgets/cards/`, `core/widgets/layout/` | grouped semantics, width matrix, large text |
| Status and price | `FeastaStatusBadge`, `FeastaPriceText` | `core/widgets/badges/` | textual status, PHP formatting, missing values |
| Images | `FeastaImage`, `FeastaImagePlaceholder` | `core/widgets/images/` | loading, failure fallback, description |
| Product cards | `ProviderCard`, `PackageCard` and presentation data types | `core/widgets/cards/` | narrow width, missing image/rating, long names, semantics |

The supported barrel import is `core/widgets/widgets.dart`. Core widgets accept
display values and callbacks; they do not instantiate repositories or Firebase
clients.

## Next.js

| Area | Public component | Source | Verification |
| --- | --- | --- | --- |
| UI controls | `Button`, `Input`, `Textarea`, `Select`, `Badge`, Radix dialog wrappers | `components/ui/` | variants, focus, disabled/loading, keyboard behavior |
| Form composition | `FormField`, `PasswordInput`, `SearchInput`, `CheckboxField`, `RadioGroup` | `components/forms/` | visible label, description/error linkage, autocomplete |
| Feedback | `LoadingSpinner`, `LoadingSkeleton`, `EmptyState`, `ErrorState`, `FeastaToaster` | `components/feedback/` | live status, empty/error action, reduced motion |
| Shared formatting | `ConfirmationDialog`, `StatusBadge`, `PriceDisplay`, `ImagePlaceholder` | `components/shared/` | pending confirmation, textual status, PHP formatting, alt semantics |
| Application layout | `ApplicationShell`, `ApplicationHeader`, `ApplicationSidebar`, `MobileNavigation`, `PageHeading`, `ContentContainer` | `components/layout/` | landmarks, skip link, role navigation, width matrix |
| Data management | `DataTable`, `CursorPagination`, `FilterToolbar`, `DetailDrawer`, `ManagementModal`, `SummaryCard`, `ChartContainer` | `components/data/` | loading/empty/error, cursors, sorting, focus, local overflow |

No public component-showcase route is currently implemented. Component tests
are the local executable inventory; a future showcase must be development-only
and must be added to `phase5:verify` before it becomes an accepted artifact.

## Representative adoption

- Flutter: login, customer provider discovery/profile presentation, and booking
  history.
- Customer web: overview, provider discovery, and booking history.
- Provider web: overview, verification progress, and package management.
- Admin web: overview and provider table/inspector.

Remaining legacy screens are migrated incrementally. A private widget may be
deleted only after repository search and tests prove that it has no callers.
