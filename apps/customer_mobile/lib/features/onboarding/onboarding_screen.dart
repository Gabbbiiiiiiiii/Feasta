import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({required this.onFinished, super.key});

  static const String seenOnboardingKey = 'seen_feasta_onboarding';

  final Future<void> Function() onFinished;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _pageController = PageController();

  int _currentIndex = 0;
  bool _isFinishing = false;

  static const List<_OnboardingPageData> _pages = [
    _OnboardingPageData(
      icon: Icons.search_rounded,
      title: 'Browse Verified Catering Services',
      description:
          'Discover verified catering providers in Ormoc City and compare '
          'packages, prices, ratings, availability, and service inclusions.',
      semanticsLabel: 'Search verified catering providers',
    ),
    _OnboardingPageData(
      icon: Icons.auto_awesome_rounded,
      title: 'Customize Your Event',
      description:
          'Personalize your event with catering packages and optional add-on '
          'services based on your needs, preferences, and budget.',
      semanticsLabel: 'Customize your event',
    ),
    _OnboardingPageData(
      icon: Icons.check_circle_outline_rounded,
      title: 'Book, Track & Pay Securely',
      description:
          'Submit booking requests, track provider updates, communicate with '
          'selected providers, and complete required down payments through '
          'PayMongo.',
      semanticsLabel: 'Track bookings and payments securely',
    ),
  ];

  bool get _isLastPage => _currentIndex == _pages.length - 1;

  Future<void> _handlePrimaryAction() async {
    if (_isFinishing) return;

    if (!_isLastPage) {
      await _pageController.nextPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutCubic,
      );

      return;
    }

    setState(() {
      _isFinishing = true;
    });

    try {
      await widget.onFinished();
    } finally {
      if (mounted) {
        setState(() {
          _isFinishing = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            return Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.md,
                AppSpacing.lg,
                AppSpacing.md,
              ),
              child: Column(
                children: [
                  Expanded(
                    child: PageView.builder(
                      controller: _pageController,
                      physics: const BouncingScrollPhysics(),
                      itemCount: _pages.length,
                      onPageChanged: (index) {
                        setState(() {
                          _currentIndex = index;
                        });
                      },
                      itemBuilder: (context, index) {
                        return _OnboardingPage(data: _pages[index]);
                      },
                    ),
                  ),
                  _PageIndicator(
                    currentIndex: _currentIndex,
                    pageCount: _pages.length,
                  ),
                  const SizedBox(height: AppSpacing.huge),
                  SizedBox(
                    width: double.infinity,
                    height: 60,
                    child: FilledButton(
                      onPressed: _isFinishing ? null : _handlePrimaryAction,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: AppColors.disabled,
                        disabledForegroundColor: AppColors.disabledForeground,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(AppRadius.large),
                        ),
                      ),
                      child: _isFinishing
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.5,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              _isLastPage ? 'Get Started' : 'Next',
                              style: AppTypography.button.copyWith(
                                color: Colors.white,
                              ),
                            ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _OnboardingPage extends StatelessWidget {
  const _OnboardingPage({required this.data});

  final _OnboardingPageData data;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: data.semanticsLabel,
      child: Column(
        children: [
          const Spacer(flex: 4),
          Icon(
            data.icon,
            size: 88,
            color: AppColors.primary,
            semanticLabel: data.semanticsLabel,
          ),
          const SizedBox(height: AppSpacing.huge),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
            child: Text(
              data.title,
              textAlign: TextAlign.center,
              style: AppTypography.textTheme.headlineMedium?.copyWith(
                color: AppColors.mainText,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            child: Text(
              data.description,
              textAlign: TextAlign.center,
              style: AppTypography.body.copyWith(
                color: AppColors.secondaryTextAccessible,
              ),
            ),
          ),
          const Spacer(flex: 5),
        ],
      ),
    );
  }
}

class _PageIndicator extends StatelessWidget {
  const _PageIndicator({required this.currentIndex, required this.pageCount});

  final int currentIndex;
  final int pageCount;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Onboarding page ${currentIndex + 1} of $pageCount',
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(pageCount, (index) {
          final isActive = index == currentIndex;

          return AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOut,
            width: isActive ? 40 : 10,
            height: 10,
            margin: const EdgeInsets.symmetric(horizontal: AppSpacing.xxs),
            decoration: BoxDecoration(
              color: isActive ? AppColors.primary : AppColors.disabled,
              borderRadius: BorderRadius.circular(AppRadius.pill),
            ),
          );
        }),
      ),
    );
  }
}

class _OnboardingPageData {
  const _OnboardingPageData({
    required this.icon,
    required this.title,
    required this.description,
    required this.semanticsLabel,
  });

  final IconData icon;
  final String title;
  final String description;
  final String semanticsLabel;
}
