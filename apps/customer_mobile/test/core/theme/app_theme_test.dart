import 'dart:io';

import 'package:feasta/core/theme/app_colors.dart';
import 'package:feasta/core/theme/app_theme.dart';
import 'package:feasta/features/authentication/presentation/authentication_loading.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('mobile semantic palette matches the current local web tokens', () {
    final css = File('../web/src/app/globals.css').readAsStringSync();
    final roles = <String, Color>{
      'primary': AppColors.primary,
      'primary-foreground': AppColors.primaryForeground,
      'primary-hover': AppColors.primaryHover,
      'primary-pressed': AppColors.primaryPressed,
      'primary-strong': AppColors.primaryStrong,
      'primary-tint': AppColors.primarySubtle,
      'primary-tint-strong': AppColors.primarySubtleStrong,
      'background': AppColors.background,
      'card': AppColors.surface,
      'secondary': AppColors.secondary,
      'muted': AppColors.surfaceMuted,
      'foreground': AppColors.mainText,
      'muted-foreground': AppColors.secondaryText,
      'feasta-text-secondary': AppColors.secondaryTextAccessible,
      'placeholder': AppColors.placeholder,
      'border': AppColors.border,
      'input': AppColors.controlBorder,
      'feasta-border-strong': AppColors.borderStrong,
      'ring': AppColors.focus,
      'link': AppColors.accent,
      'feasta-surface-strong': AppColors.surfaceStrong,
      'disabled': AppColors.disabled,
      'skeleton': AppColors.skeleton,
      'skeleton-highlight': AppColors.skeletonHighlight,
      'success': AppColors.success,
      'warning': AppColors.warning,
      'destructive': AppColors.error,
      'info': AppColors.info,
      'success-subtle': AppColors.successSubtle,
      'warning-subtle': AppColors.warningSubtle,
      'destructive-subtle': AppColors.errorSubtle,
      'info-subtle': AppColors.infoSubtle,
    };
    for (final entry in roles.entries) {
      final match = RegExp(
        '--${entry.key}: #([a-fA-F0-9]{6});',
      ).firstMatch(css);
      expect(match, isNotNull, reason: entry.key);
      expect(
        entry.value.toARGB32(),
        0xff000000 | int.parse(match!.group(1)!, radix: 16),
        reason: entry.key,
      );
    }
  });

  test(
    'screens contain no hardcoded legacy orange, cream or brown brand palette',
    () {
      final legacy = RegExp(
        r'0xFF(?:B02F00|FF6333|F8F6F3|2B211D|8C817A|E8E1DB|FFF1EC|FFF3EE|FFE3DA|FFD9CC)',
        caseSensitive: false,
      );
      for (final file
          in Directory('lib')
              .listSync(recursive: true)
              .whereType<File>()
              .where((file) => file.path.endsWith('.dart'))) {
        expect(
          legacy.hasMatch(file.readAsStringSync()),
          isFalse,
          reason: file.path,
        );
      }
    },
  );

  double contrast(Color a, Color b) {
    final first = a.computeLuminance();
    final second = b.computeLuminance();
    return first > second
        ? (first + .05) / (second + .05)
        : (second + .05) / (first + .05);
  }

  test('labels and focus indicators retain accessible contrast', () {
    for (final background in [
      AppColors.background,
      AppColors.surface,
      AppColors.secondary,
      AppColors.surfaceMuted,
      AppColors.primarySubtle,
    ]) {
      for (final text in [
        AppColors.mainText,
        AppColors.secondaryTextAccessible,
      ]) {
        expect(contrast(text, background), greaterThanOrEqualTo(4.5));
      }
      expect(contrast(AppColors.focus, background), greaterThanOrEqualTo(3));
    }
    for (final background in [
      AppColors.primary,
      AppColors.primaryHover,
      AppColors.primaryPressed,
      AppColors.accent,
      AppColors.warning,
      AppColors.error,
      AppColors.info,
      AppColors.success,
    ]) {
      expect(
        contrast(AppColors.primaryForeground, background),
        greaterThanOrEqualTo(4.5),
      );
    }
    expect(AppColors.disabled, isNot(AppColors.primarySubtle));
    expect(
      contrast(AppColors.disabledForeground, AppColors.disabled),
      greaterThanOrEqualTo(4.5),
    );
    expect(
      contrast(
        AppTheme.light.snackBarTheme.actionTextColor!,
        AppColors.mainText,
      ),
      greaterThanOrEqualTo(4.5),
    );
  });

  test('theme routes component states through emerald and silver roles', () {
    final theme = AppTheme.light;
    final style = theme.filledButtonTheme.style!;
    expect(style.backgroundColor!.resolve({}), AppColors.primary);
    expect(
      style.backgroundColor!.resolve({WidgetState.pressed}),
      AppColors.primaryPressed,
    );
    expect(
      style.backgroundColor!.resolve({WidgetState.hovered}),
      AppColors.primaryHover,
    );
    expect(
      style.backgroundColor!.resolve({WidgetState.disabled}),
      AppColors.disabled,
    );
    expect(style.foregroundColor!.resolve({}), AppColors.primaryForeground);
    expect(theme.scaffoldBackgroundColor, AppColors.background);
    expect(theme.colorScheme.secondary, AppColors.secondary);
    expect(theme.colorScheme.onSecondary, AppColors.mainText);
    expect(theme.colorScheme.surfaceContainer, AppColors.secondary);
    expect(theme.navigationBarTheme.indicatorColor, AppColors.primarySubtle);
    expect(theme.dialogTheme.backgroundColor, AppColors.surface);
    expect(theme.progressIndicatorTheme.color, AppColors.primaryStrong);
    expect(
      (theme.inputDecorationTheme.focusedBorder! as OutlineInputBorder)
          .borderSide
          .color,
      AppColors.focus,
    );
    expect(theme.textSelectionTheme.cursorColor, AppColors.focus);
  });

  for (final signingOut in [false, true]) {
    testWidgets('authentication loading uses emerald, signingOut=$signingOut', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: Scaffold(body: AuthenticationLoading(signingOut: signingOut)),
        ),
      );
      await tester.pump(const Duration(milliseconds: 200));
      expect(
        tester
            .widget<CircularProgressIndicator>(
              find.byType(CircularProgressIndicator),
            )
            .color,
        AppColors.primary,
      );
      expect(
        find.text(signingOut ? 'Signing out...' : 'Signing in...'),
        findsOneWidget,
      );
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  }
}
