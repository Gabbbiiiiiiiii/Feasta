import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/feedback/feasta_loading.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.primary,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.xxl),
            child: Semantics(
              container: true,
              label: 'FEASTA is starting securely',
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(AppRadius.dialog),
                    child: Image.asset(
                      'assets/images/mobile_logo.png',
                      width: 120,
                      height: 120,
                      fit: BoxFit.cover,
                      semanticLabel: 'FEASTA logo',
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  Text(
                    'Feasta',
                    style: AppTypography.display.copyWith(color: Colors.white),
                  ),
                  const SizedBox(height: AppSpacing.xxl),
                  const FeastaLoadingIndicator(
                    label: 'Resolving your secure account',
                    color: Colors.white,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
