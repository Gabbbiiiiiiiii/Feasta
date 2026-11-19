# FEASTA brand and token source of truth (verified 2026-11-19)

**Live Web:** `apps/web/src/app/globals.css` (Tailwind v4 semantic token declarations). **Live Flutter:** `apps/customer_mobile/lib/core/theme/app_colors.dart`, plus `app_theme.dart`, `app_typography.dart`, `app_spacing.dart`, `app_radius.dart`. **Do not use** old orange values from `docs/phase-5-design-system.md` as the current brand identity.

| Role | Web token | Current Web value | Flutter equivalent |
|---|---|---|---|
| Primary | `--primary` | `#093B26` | `AppColors.primary` |
| Primary hover | `--primary-hover` | `#10492E` | `AppColors.primaryHover` |
| Primary pressed | `--primary-pressed` | `#073520` | `AppColors.primaryPressed` |
| Foreground on primary | `--primary-foreground` | `#FFFFFF` | `AppColors.primaryForeground` |
| Canvas | `--background` | `#F7F8F8` | `AppColors.background` |
| Card | `--card` | `#FFFFFF` | `AppColors.surface` |
| Main text | `--foreground` | `#123B30` | `AppColors.mainText` |
| Subtle brand surface | `--primary-tint` | `#E8F1EE` | `AppColors.primarySubtle` |
| Border | `--border` | `#D9DEDC` | `AppColors.border` |
| Focus | `--ring` | `#087159` | `AppColors.focus` |
| Link | `--link` | `#0B6953` | closest existing semantic role; inspect usage |
| Error | `--destructive` | `#B42318` | `AppColors.error` |
| Success | `--success` | `#166534` | `AppColors.success` |
| Warning | `--warning` | `#92400E` | `AppColors.warning` |
| Info | `--info` | `#1D4ED8` | `AppColors.info` |

**Apply semantic roles**, not these raw hex values in product components. Do not add a competing FEASTA color palette, hardcode Vaadin/Lumo fills, or use the brand green for error states. Test contrast of *actual foreground/background pairs*, including placeholder/disabled and small text.

Additional verified Web style:
- Font: **Plus Jakarta Sans** for application UI and **Playfair Display** for restrained stylized accents. Use the existing font bindings; don't import a Vaadin font by default.
- Radius tokens include `--feasta-radius-sm`, `--feasta-radius-md`, `--feasta-radius-card`, `--feasta-radius-dialog`.
- Shadow tokens include `--feasta-shadow-card`, `--feasta-shadow-floating`; prefer whitespace, soft borders and clear hierarchy over stacked raised cards.
- Motion tokens: instant 100ms, fast 160ms, normal 240ms, slow 360ms; honor reduced motion.
- Flutter `AppTypography` and Web project fonts/tokens govern typographic role, not Figma's source font.

**Precedence rule:** current implementation > outdated phase notes. If the current Web and Flutter tokens differ, investigate context and document the difference before changing either; do not automatically overwrite one from the other.

**Page personality:** credible, calm and modern event-services marketplace. Customer screens may be visually warm through photography and copy; provider/admin screens prioritize clear operations and dense data. Premium means restraint, not extra decoration, gold or metallic gradients.
