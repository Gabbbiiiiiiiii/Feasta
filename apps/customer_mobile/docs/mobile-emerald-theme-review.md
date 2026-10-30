# Mobile emerald theme review

Implemented directly in the existing customer_mobile app. The current local `apps/web/src/app/globals.css` is the source of truth; no web files were changed.

## Final palette

| Role | Color |
| --- | --- |
| Primary / strong | `#093B26` |
| Primary foreground | `#FFFFFF` |
| Primary hover / pressed | `#10492E` / `#073520` |
| Link / interactive accent | `#0B6953` |
| Focus | `#087159` |
| Background / card | `#F7F8F8` / `#FFFFFF` |
| Secondary / muted surface | `#F3F4F4` / `#EDEFEF` |
| Main text | `#123B30` |
| Muted / accessible secondary text | `#667A74` / `#49665E` |
| Placeholder | `#6B7D78` |
| Selected tint / stronger tint | `#E8F1EE` / `#D4E7DF` |
| Border / stronger border | `#D9DEDC` / `#C8CECC` |
| Disabled background / foreground | `#F3F4F4` / `#49665E` |
| Skeleton / highlight | `#E5E7E7` / `#F8F9F9` |
| Success / warning / error / info | `#166534` / `#92400E` / `#B42318` / `#1D4ED8` |

Overlay follows the web's 30% charcoal overlay, rounded to the nearest 8-bit alpha. Existing hint/secondary text uses the darker secondary token where needed for readable small labels. Snackbar action text uses a light emerald tint on its dark surface for contrast.

## Implementation

Central colors now drive the existing app components, including splash/welcome, Home, authentication, bookings, scheduling, provider screens, search, favorites, messages, notifications and payments. Hardcoded legacy brand colors in the existing feature screens were replaced with semantic references. Material surface-container roles are explicitly silver; secondary roles use dark foregrounds on silver. Filled/elevated button states, navigation, focus, text selection, inputs, cards, dialogs, chips and progress indicators use the palette. Layouts, typography, spacing, assets and behavior were preserved.

Authentication changes in this theme task are appearance only: the login modal barrier uses the central overlay token; its surface and existing single loader inherit updated tokens. Picker sequencing, modal protection, consent, authorization, recovery and Home navigation logic were not edited.

## Intentionally retained colors

- Warning brown and amber warning outlines retain their status meaning, rather than serving as brand colors.
- Warm rating stars and amber review notifications remain semantic rating/category cues, centralized where updated.
- Purple verification notifications and neutral gray system notifications remain distinct category cues.
- Neutral shadows and photo legibility gradients remain unchanged.
- Original logos, Google branding, uploaded images and photography were not recolored. Any warm colors in those assets remain intentional pending a separate asset update.

## Validation

- 96 focused Flutter tests passed across theme contracts, contrast, shared primitives, responsive layouts, login modal/screen, authentication gate and authentication navigation.
- Tests read the actual local web CSS and compare 32 semantic color roles; check normal-label contrast (4.5:1), focus contrast (3:1), button/selected/disabled roles, both authentication loader labels, and absence of known hardcoded legacy brand colors.
- Analysis of all changed Dart files: no errors or warnings; 12 existing informational notices remain (10 deprecated `withOpacity` uses and 2 callback underscore notices in existing feature code).
- `git diff --check` passed. Git reports existing generated-file line-ending notices only.
- SHA-256 comparisons confirmed all 797 inspected web files and all seven generated Flutter plugin files remained byte-for-byte unchanged from this task's starting state.
- No production writes, Firebase configuration/backend changes, commits, pushes, merges or deployments.

## Real-device review

Review emerald/silver surfaces, selected/disabled/focused controls, large text and original logo assets on Android/iOS. Confirm the native Google picker still precedes the single in-modal emerald loader; check protected dismissal, successful Home navigation and sign-out appearance. Automated widget tests cover these flows, but native UI rendering and display-specific appearance require a device.

## Files modified by this theme task

Paths below are relative to `apps/customer_mobile`; pre-existing changes elsewhere were preserved.

- `lib/core/theme/app_colors.dart`
- `lib/core/utils/chat/chat_screen.dart`
- `lib/features/chat/chat_screen.dart`
- `lib/features/customer/addon_marketplace_screen.dart`
- `lib/features/customer/addon_payment_required_screen.dart`
- `lib/features/customer/availability_check_screen.dart`
- `lib/features/customer/chat_screen.dart`
- `lib/features/customer/customer_account_screen.dart`
- `lib/features/customer/customer_favorites_screen.dart`
- `lib/features/customer/customer_home_screen.dart`
- `lib/features/customer/customer_provider_collection_screen.dart`
- `lib/features/customer/customer_search_screen.dart`
- `lib/features/customer/location_picker_screen.dart`
- `lib/features/customer/manual_address_screen.dart`
- `lib/features/customer/payment_success_screen.dart`
- `lib/features/customer/plan_matching_services_screen.dart`
- `lib/features/customer/provider_profile_screen.dart`
- `lib/features/customer/recovery_offers_screen.dart`
- `lib/features/customer/review_screen.dart`
- `lib/features/notifications/notifications_screen.dart`
- `lib/features/presentation/screens/pending_approval_screen.dart`
- `lib/features/presentation/widgets/provider_review_card.dart`
- `lib/core/theme/app_theme.dart`
- `lib/features/presentation/widgets/customer_login_modal.dart`
- `test/core/theme/app_theme_test.dart`
- `docs/mobile-emerald-theme-review.md`
