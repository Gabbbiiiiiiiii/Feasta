import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radius.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';

class FeastaGoogleAuthButton extends StatelessWidget {
  const FeastaGoogleAuthButton({
    required this.onPressed,
    this.isLoading = false,
    super.key,
  });

  final VoidCallback? onPressed;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    final isEnabled = onPressed != null && !isLoading;

    return Semantics(
      button: true,
      enabled: isEnabled,
      label: 'Continue with Google',
      child: ExcludeSemantics(
        child: SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: isLoading ? null : onPressed,
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(56),
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.sm,
              ),
              backgroundColor: AppColors.surface,
              foregroundColor: AppColors.mainText,
              disabledForegroundColor: AppColors.secondaryTextAccessible,
              side: const BorderSide(color: AppColors.border),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppRadius.large),
              ),
            ),
            child: isLoading
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.4,
                      color: AppColors.primary,
                    ),
                  )
                : Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    mainAxisSize: MainAxisSize.max,
                    children: [
                      Image.asset(
                        'assets/images/google_logo.png',
                        width: 24,
                        height: 24,
                        fit: BoxFit.contain,
                        excludeFromSemantics: true,
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Flexible(
                        child: Text(
                          'Continue with Google',
                          textAlign: TextAlign.center,
                          overflow: TextOverflow.visible,
                          softWrap: true,
                          style: AppTypography.button.copyWith(
                            color: AppColors.mainText,
                          ),
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}
