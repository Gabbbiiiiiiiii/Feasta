import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/widgets/widgets.dart';
import 'customer_register_screen.dart';
import 'provider_register_screen.dart';

class RoleSelectionScreen extends StatelessWidget {
  const RoleSelectionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Choose account type')),
      body: SafeArea(
        child: SingleChildScrollView(
          child: FeastaContentContainer(
            maxWidth: 600,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'How would you like to use Feasta?',
                  textAlign: TextAlign.center,
                  style: AppTypography.headline,
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  'Choose the account type that best fits your role.',
                  textAlign: TextAlign.center,
                  style: AppTypography.body.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
                const SizedBox(height: AppSpacing.xxl),
                _RoleCard(
                  icon: Icons.person_outline,
                  title: 'Customer',
                  description: 'Browse, customize, and book catering services.',
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const CustomerRegisterScreen(),
                      ),
                    );
                  },
                ),
                const SizedBox(height: AppSpacing.md),
                _RoleCard(
                  icon: Icons.storefront_outlined,
                  title: 'Provider',
                  description:
                      'Register your catering or event service business and manage bookings.',
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const ProviderRegisterScreen(),
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String description;
  final VoidCallback onTap;

  const _RoleCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      onTap: onTap,
      semanticLabel: '$title account. $description',
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Row(
        children: [
          CircleAvatar(
            radius: 30,
            backgroundColor: AppColors.primarySubtle,
            child: Icon(
              icon,
              color: AppColors.primary,
              size: 30,
              semanticLabel: null,
            ),
          ),
          const SizedBox(width: AppSpacing.lg),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppTypography.title),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  description,
                  style: AppTypography.body.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
              ],
            ),
          ),
          const Icon(
            Icons.chevron_right,
            color: AppColors.secondaryTextAccessible,
          ),
        ],
      ),
    );
  }
}
