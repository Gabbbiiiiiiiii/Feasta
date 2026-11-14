import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';

/// Inline in the gate or sheet: never pushes another Navigator route.
class AuthenticationLoading extends StatelessWidget {
  const AuthenticationLoading({this.signingOut = false, super.key});
  final bool signingOut;

  @override
  Widget build(BuildContext context) {
    final label = signingOut ? 'Signing out...' : 'Signing in...';
    return Semantics(
      container: true,
      liveRegion: true,
      label: label,
      child: ExcludeSemantics(
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: 1),
          duration: MediaQuery.disableAnimationsOf(context)
              ? Duration.zero
              : const Duration(milliseconds: 180),
          builder: (_, opacity, child) =>
              Opacity(opacity: opacity, child: child),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.primary,
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                Text(
                  label,
                  textAlign: TextAlign.center,
                  style: AppTypography.body,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
