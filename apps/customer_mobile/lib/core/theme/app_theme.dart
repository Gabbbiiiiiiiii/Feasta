import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'app_radius.dart';
import 'app_sizes.dart';
import 'app_spacing.dart';
import 'app_typography.dart';

/// The supported FEASTA application themes.
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
    inversePrimary: Color(0xFFFFA487),
    surfaceTint: AppColors.primary,
  );

  static ThemeData get light {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: _lightColorScheme,
      scaffoldBackgroundColor: AppColors.background,
      canvasColor: AppColors.background,
      focusColor: AppColors.focus.withValues(alpha: 0.16),
      hoverColor: AppColors.primary.withValues(alpha: 0.08),
      splashColor: AppColors.primary.withValues(alpha: 0.12),
      disabledColor: AppColors.disabled,
      textTheme: AppTypography.textTheme,
      materialTapTargetSize: MaterialTapTargetSize.padded,
      visualDensity: VisualDensity.standard,
    );

    return base.copyWith(
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.primarySubtle,
        foregroundColor: AppColors.mainText,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        toolbarHeight: AppSizes.appBarHeight,
        titleTextStyle: TextStyle(
          color: AppColors.mainText,
          fontSize: 24,
          height: 1.3,
          fontWeight: FontWeight.w800,
        ),
        iconTheme: IconThemeData(
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
          horizontal: AppSpacing.md,
          vertical: AppSpacing.md,
        ),
        enabledBorder: _inputBorder(AppColors.controlBorder),
        disabledBorder: _inputBorder(AppColors.disabled),
        focusedBorder: _inputBorder(AppColors.focus, width: 2),
        errorBorder: _inputBorder(AppColors.error),
        focusedErrorBorder: _inputBorder(AppColors.error, width: 2),
        border: _inputBorder(AppColors.controlBorder),
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
          textStyle: const WidgetStatePropertyAll(AppTypography.button),
          foregroundColor: const WidgetStatePropertyAll(
            AppColors.primaryForeground,
          ),
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
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(0, AppSizes.buttonHeight),
          foregroundColor: AppColors.mainText,
          side: const BorderSide(color: AppColors.controlBorder),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.large),
          ),
          textStyle: AppTypography.button,
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
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          minimumSize: const Size.square(AppSizes.minimumTouchTarget),
          foregroundColor: AppColors.mainText,
          iconSize: AppSizes.iconDefault,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.card),
          side: const BorderSide(color: AppColors.border),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        barrierColor: AppColors.overlay,
        elevation: 8,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.dialog),
        ),
        titleTextStyle: AppTypography.title.copyWith(color: AppColors.mainText),
        contentTextStyle: AppTypography.body.copyWith(
          color: AppColors.secondaryTextAccessible,
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.mainText,
        contentTextStyle: AppTypography.bodySmall.copyWith(
          color: AppColors.surface,
        ),
        actionTextColor: const Color(0xFFFFA487),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.medium),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.border,
        thickness: 1,
        space: 1,
      ),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: AppColors.surfaceMuted,
        selectedColor: AppColors.primarySubtle,
        disabledColor: AppColors.disabled,
        side: const BorderSide(color: AppColors.border),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.pill),
        ),
        labelStyle: AppTypography.label.copyWith(color: AppColors.mainText),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.surface,
        selectedItemColor: AppColors.primaryStrong,
        unselectedItemColor: AppColors.secondaryTextAccessible,
        selectedLabelStyle: AppTypography.caption,
        unselectedLabelStyle: AppTypography.caption,
        type: BottomNavigationBarType.fixed,
        elevation: 8,
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
    );
  }

  static OutlineInputBorder _inputBorder(Color color, {double width = 1}) {
    return OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.large),
      borderSide: BorderSide(color: color, width: width),
    );
  }
}
