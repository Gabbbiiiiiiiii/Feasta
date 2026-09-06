import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'app_radius.dart';
import 'app_sizes.dart';
import 'app_spacing.dart';
import 'app_typography.dart';

/// FEASTA's application-wide light theme.
///
/// FEASTA's application-wide light theme.
///
/// The FEASTA brand palette is centralized through [AppColors].
/// This theme provides consistent geometry, spacing, typography,
/// colors, and component behavior throughout the customer mobile app.
/// This theme focuses on consistent geometry, spacing, typography, and
/// component behavior.
abstract final class AppTheme {
  static const ColorScheme _lightColorScheme = ColorScheme(
    brightness: Brightness.light,

    primary: AppColors.primary,
    onPrimary: AppColors.primaryForeground,
    primaryContainer: AppColors.primarySubtle,
    onPrimaryContainer: AppColors.mainText,

    secondary: AppColors.secondaryTextAccessible,
    onSecondary: AppColors.surface,
    secondaryContainer: AppColors.surfaceMuted,
    onSecondaryContainer: AppColors.mainText,

    error: AppColors.error,
    onError: AppColors.surface,
    errorContainer: AppColors.errorSubtle,
    onErrorContainer: AppColors.error,

    surface: AppColors.surface,
    onSurface: AppColors.mainText,
    onSurfaceVariant: AppColors.secondaryTextAccessible,

    outline: AppColors.controlBorder,
    outlineVariant: AppColors.border,

    shadow: Color(0x292B211D),
    scrim: AppColors.overlay,

    inverseSurface: AppColors.mainText,
    onInverseSurface: AppColors.background,

    inversePrimary: Color(0xFFFFB59A),

    surfaceTint: Colors.transparent,
  );

  static ThemeData get light {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: _lightColorScheme,

      scaffoldBackgroundColor: AppColors.background,
      canvasColor: AppColors.background,

      focusColor: AppColors.focus.withValues(alpha: 0.14),

      hoverColor: AppColors.primary.withValues(alpha: 0.06),

      splashColor: AppColors.primary.withValues(alpha: 0.08),

      disabledColor: AppColors.disabled,

      textTheme: AppTypography.textTheme,

      materialTapTargetSize: MaterialTapTargetSize.padded,

      visualDensity: VisualDensity.standard,
    );

    return base.copyWith(
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.mainText,
        surfaceTintColor: Colors.transparent,
        shadowColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        toolbarHeight: AppSizes.appBarHeight,
        titleSpacing: AppSpacing.screen,
        titleTextStyle: AppTypography.pageTitle.copyWith(fontSize: 24),
        iconTheme: const IconThemeData(
          color: AppColors.mainText,
          size: AppSizes.iconDefault,
        ),
        actionsIconTheme: const IconThemeData(
          color: AppColors.mainText,
          size: AppSizes.iconDefault,
        ),
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,

        constraints: const BoxConstraints(minHeight: AppSizes.inputHeight),

        hintStyle: AppTypography.bodySmall.copyWith(
          color: AppColors.secondaryTextAccessible,
        ),

        labelStyle: AppTypography.label.copyWith(
          color: AppColors.secondaryTextAccessible,
        ),

        floatingLabelStyle: AppTypography.label.copyWith(
          color: AppColors.focus,
        ),

        helperStyle: AppTypography.helper,
        errorStyle: AppTypography.error,

        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.md,
        ),

        enabledBorder: _inputBorder(AppColors.border),

        disabledBorder: _inputBorder(AppColors.disabled),

        focusedBorder: _inputBorder(AppColors.focus, width: 1.5),

        errorBorder: _inputBorder(AppColors.error),

        focusedErrorBorder: _inputBorder(AppColors.error, width: 1.5),

        border: _inputBorder(AppColors.border),
      ),

      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ButtonStyle(
          minimumSize: const WidgetStatePropertyAll(
            Size(0, AppSizes.buttonHeight),
          ),

          padding: const WidgetStatePropertyAll(
            EdgeInsets.symmetric(horizontal: AppSpacing.xl),
          ),

          elevation: const WidgetStatePropertyAll(0),

          shadowColor: const WidgetStatePropertyAll(Colors.transparent),

          textStyle: const WidgetStatePropertyAll(AppTypography.button),

          foregroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.disabled)) {
              return AppColors.disabledForeground;
            }

            return AppColors.primaryForeground;
          }),

          backgroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.disabled)) {
              return AppColors.disabled;
            }

            if (states.contains(WidgetState.pressed)) {
              return AppColors.primaryPressed;
            }

            if (states.contains(WidgetState.hovered)) {
              return AppColors.primaryHover;
            }

            return AppColors.primary;
          }),

          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadius.large),
            ),
          ),
        ),
      ),

      outlinedButtonTheme: OutlinedButtonThemeData(
        style: ButtonStyle(
          minimumSize: const WidgetStatePropertyAll(
            Size(0, AppSizes.buttonHeight),
          ),

          padding: const WidgetStatePropertyAll(
            EdgeInsets.symmetric(horizontal: AppSpacing.xl),
          ),

          elevation: const WidgetStatePropertyAll(0),

          foregroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.disabled)) {
              return AppColors.disabledForeground;
            }

            return AppColors.mainText;
          }),

          backgroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.pressed)) {
              return AppColors.surfaceMuted;
            }

            return AppColors.surface;
          }),

          side: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.disabled)) {
              return const BorderSide(color: AppColors.disabled);
            }

            return const BorderSide(color: AppColors.border);
          }),

          textStyle: const WidgetStatePropertyAll(AppTypography.button),

          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadius.large),
            ),
          ),
        ),
      ),

      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(
            AppSizes.minimumTouchTarget,
            AppSizes.minimumTouchTarget,
          ),

          foregroundColor: AppColors.primaryStrong,

          textStyle: AppTypography.button,

          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.control),
          ),
        ),
      ),

      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          minimumSize: const Size.square(AppSizes.minimumTouchTarget),

          foregroundColor: AppColors.mainText,

          iconSize: AppSizes.iconDefault,

          shape: const CircleBorder(),
        ),
      ),

      cardTheme: CardThemeData(
        color: AppColors.surface,
        surfaceTintColor: Colors.transparent,

        elevation: 1,

        shadowColor: const Color(0x0D000000),

        margin: EdgeInsets.zero,

        clipBehavior: Clip.antiAlias,

        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.card),
        ),
      ),

      dialogTheme: DialogThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,

        barrierColor: AppColors.overlay,

        elevation: 8,

        shadowColor: const Color(0x14000000),

        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.dialog),
        ),

        titleTextStyle: AppTypography.sectionTitle,

        contentTextStyle: AppTypography.body.copyWith(
          color: AppColors.secondaryTextAccessible,
        ),
      ),

      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.mainText,

        contentTextStyle: AppTypography.bodySmall.copyWith(
          color: AppColors.surface,
        ),

        actionTextColor: AppColors.primary,

        behavior: SnackBarBehavior.floating,

        elevation: 4,

        insetPadding: const EdgeInsets.all(AppSpacing.md),

        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.large),
        ),
      ),

      dividerTheme: const DividerThemeData(
        color: AppColors.border,
        thickness: 1,
        space: 1,
      ),

      chipTheme: base.chipTheme.copyWith(
        backgroundColor: AppColors.surface,

        selectedColor: AppColors.primarySubtle,

        disabledColor: AppColors.disabled,

        side: const BorderSide(color: AppColors.border),

        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.pill),
        ),

        labelStyle: AppTypography.label.copyWith(color: AppColors.mainText),

        secondaryLabelStyle: AppTypography.label.copyWith(
          color: AppColors.primaryStrong,
        ),
      ),

      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.surface,

        selectedItemColor: AppColors.primaryStrong,

        unselectedItemColor: AppColors.secondaryTextAccessible,

        selectedLabelStyle: AppTypography.caption,

        unselectedLabelStyle: AppTypography.caption,

        type: BottomNavigationBarType.fixed,

        elevation: 0,
      ),

      navigationBarTheme: NavigationBarThemeData(
        height: AppSizes.bottomNavigationHeight,

        backgroundColor: AppColors.surface,

        elevation: 0,

        surfaceTintColor: Colors.transparent,

        indicatorColor: AppColors.primarySubtle,

        indicatorShape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.pill),
        ),

        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const IconThemeData(
              color: AppColors.primaryStrong,
              size: AppSizes.iconDefault,
            );
          }

          return const IconThemeData(
            color: AppColors.secondaryTextAccessible,
            size: AppSizes.iconDefault,
          );
        }),

        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return AppTypography.caption.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w700,
            );
          }

          return AppTypography.caption.copyWith(
            color: AppColors.secondaryTextAccessible,
          );
        }),
      ),

      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.primaryStrong,

        linearTrackColor: AppColors.skeleton,

        circularTrackColor: AppColors.skeleton,
      ),

      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: AppColors.mainText,

          borderRadius: BorderRadius.circular(AppRadius.small),
        ),

        textStyle: AppTypography.caption.copyWith(color: AppColors.surface),
      ),

      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surface,

        surfaceTintColor: Colors.transparent,

        modalBackgroundColor: AppColors.surface,

        modalBarrierColor: AppColors.overlay,

        showDragHandle: true,

        dragHandleColor: AppColors.border,

        elevation: 8,

        modalElevation: 8,

        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(AppRadius.surface),
          ),
        ),
      ),

      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: AppColors.primary,

        foregroundColor: AppColors.primaryForeground,

        elevation: 3,

        focusElevation: 3,
        hoverElevation: 4,
        highlightElevation: 2,

        shape: CircleBorder(),
      ),
    );
  }

  static OutlineInputBorder _inputBorder(Color color, {double width = 1}) {
    return OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.large),

      borderSide: BorderSide(color: color, width: width),
    );
  }
}
