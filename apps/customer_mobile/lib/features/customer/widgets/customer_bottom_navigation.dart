import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radius.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';

class CustomerBottomNavigation extends StatelessWidget {
  const CustomerBottomNavigation({
    required this.currentIndex,
    required this.isAuthenticated,
    required this.onHomeTap,
    required this.onMessagesTap,
    required this.onPlanTap,
    required this.onBookingsTap,
    required this.onAccountTap,
    this.planOpen = false,
    super.key,
  });

  final int currentIndex;
  final bool isAuthenticated;

  final VoidCallback onHomeTap;
  final VoidCallback onMessagesTap;
  final VoidCallback onPlanTap;
  final VoidCallback onBookingsTap;
  final VoidCallback onAccountTap;

  final bool planOpen;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      elevation: 12,
      shadowColor: Colors.black.withValues(alpha: 0.08),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 76,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.topCenter,
            children: [
              Positioned.fill(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.xs,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: _NavigationItem(
                          label: 'Home',
                          assetPath: 'assets/images/home.png',
                          selected: currentIndex == 0 && !planOpen,
                          onTap: onHomeTap,
                        ),
                      ),
                      Expanded(
                        child: _NavigationItem(
                          label: 'Messages',
                          assetPath: 'assets/images/messages.png',
                          selected: currentIndex == 1 && !planOpen,
                          onTap: onMessagesTap,
                        ),
                      ),

                      const SizedBox(width: 84),

                      Expanded(
                        child: _NavigationItem(
                          label: 'Bookings',
                          assetPath: 'assets/images/bookings.png',
                          selected: currentIndex == 3 && !planOpen,
                          onTap: onBookingsTap,
                        ),
                      ),
                      Expanded(
                        child: _NavigationItem(
                          label: isAuthenticated ? 'Account' : 'Login',
                          assetPath: 'assets/images/account.png',
                          selected: currentIndex == 4 && !planOpen,
                          onTap: onAccountTap,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              Positioned(
                top: -29,
                child: _PlanNavigationButton(
                  selected: planOpen,
                  onTap: onPlanTap,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavigationItem extends StatelessWidget {
  const _NavigationItem({
    required this.label,
    required this.assetPath,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final String assetPath;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected
        ? AppColors.primary
        : AppColors.secondaryTextAccessible;

    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.medium),
          child: SizedBox(
            height: 76,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ColorFiltered(
                  colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
                  child: Image.asset(
                    assetPath,
                    width: 25,
                    height: 25,
                    fit: BoxFit.contain,
                    filterQuality: FilterQuality.high,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.caption.copyWith(
                    color: color,
                    fontSize: 10,
                    fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
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

class _PlanNavigationButton extends StatefulWidget {
  const _PlanNavigationButton({required this.selected, required this.onTap});

  final bool selected;
  final VoidCallback onTap;

  @override
  State<_PlanNavigationButton> createState() => _PlanNavigationButtonState();
}

class _PlanNavigationButtonState extends State<_PlanNavigationButton> {
  bool _pressed = false;

  void _setPressed(bool value) {
    if (_pressed == value) {
      return;
    }

    setState(() {
      _pressed = value;
    });
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;

    final backgroundColor = _pressed
        ? AppColors.primaryPressed
        : AppColors.primary;

    return Semantics(
      button: true,
      selected: widget.selected,
      label: widget.selected ? 'Close Plan Your Event' : 'Open Plan Your Event',
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTapDown: (_) {
              _setPressed(true);
            },
            onTapCancel: () {
              _setPressed(false);
            },
            onTapUp: (_) {
              _setPressed(false);
              widget.onTap();
            },
            child: AnimatedScale(
              duration: reduceMotion
                  ? Duration.zero
                  : const Duration(milliseconds: 120),
              scale: _pressed ? 0.94 : 1,
              child: AnimatedContainer(
                duration: reduceMotion
                    ? Duration.zero
                    : const Duration(milliseconds: 160),
                curve: Curves.easeOutCubic,
                width: 68,
                height: 68,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: backgroundColor,
                  border: Border.all(color: Colors.white, width: 4),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.primary.withValues(alpha: 0.24),
                      blurRadius: 18,
                      spreadRadius: 2,
                      offset: const Offset(0, 7),
                    ),
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.10),
                      blurRadius: 8,
                      offset: const Offset(0, 3),
                    ),
                  ],
                ),
                child: Center(
                  child: ColorFiltered(
                    colorFilter: const ColorFilter.mode(
                      Colors.white,
                      BlendMode.srcIn,
                    ),
                    child: Image.asset(
                      'assets/images/plan.png',
                      width: 34,
                      height: 34,
                      fit: BoxFit.contain,
                      filterQuality: FilterQuality.high,
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'Plan',
            style: AppTypography.caption.copyWith(
              color: AppColors.primary,
              fontSize: 10,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}
