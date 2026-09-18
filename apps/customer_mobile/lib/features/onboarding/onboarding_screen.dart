import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({required this.onFinished, super.key});

  static const String seenOnboardingKey = 'seen_feasta_onboarding';

  final Future<void> Function() onFinished;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _pageController = PageController();

  int currentIndex = 0;
  bool _isFinishing = false;

  final List<_OnboardingPageData> pages = const [
    _OnboardingPageData(
      icon: Icons.search_rounded,
      title: 'Browse Verified Providers',
      description:
          'Discover trusted catering and event service providers in Ormoc City '
          'with packages, ratings, and real reviews.',
    ),
    _OnboardingPageData(
      icon: Icons.auto_awesome_rounded,
      title: 'Customize Your Event',
      description:
          'Personalize packages, menus, decorations, chairs, tables, and '
          'add-ons based on your event needs.',
    ),
    _OnboardingPageData(
      icon: Icons.verified_user_outlined,
      title: 'Book, Track, and Pay Securely',
      description:
          'Submit booking requests, track your status, chat after booking, '
          'and pay your down payment securely.',
    ),
  ];

  Future<void> _finishOnboarding() async {
    if (_isFinishing) return;

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

  void _nextPage() {
    if (currentIndex == pages.length - 1) {
      _finishOnboarding();
      return;
    }

    _pageController.nextPage(
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOut,
    );
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isLastPage = currentIndex == pages.length - 1;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 14, 24, 24),
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: _isFinishing ? null : _finishOnboarding,
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.secondaryTextAccessible,
                    disabledForegroundColor: AppColors.disabledForeground,
                  ),
                  child: const Text(
                    'Skip',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              ),
              Expanded(
                child: PageView.builder(
                  controller: _pageController,
                  itemCount: pages.length,
                  onPageChanged: (index) {
                    setState(() {
                      currentIndex = index;
                    });
                  },
                  itemBuilder: (context, index) {
                    final page = pages[index];

                    return Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 118,
                          height: 118,
                          decoration: const BoxDecoration(
                            color: AppColors.primarySubtle,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            page.icon,
                            color: AppColors.primary,
                            size: 62,
                          ),
                        ),
                        const SizedBox(height: 44),
                        Text(
                          page.title,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: AppColors.mainText,
                            fontSize: 28,
                            fontWeight: FontWeight.w900,
                            height: 1.15,
                          ),
                        ),
                        const SizedBox(height: 18),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                          child: Text(
                            page.description,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: AppColors.secondaryTextAccessible,
                              fontSize: 17,
                              height: 1.55,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(pages.length, (index) {
                  final isActive = currentIndex == index;

                  return AnimatedContainer(
                    duration: const Duration(milliseconds: 220),
                    margin: const EdgeInsets.symmetric(horizontal: 5),
                    width: isActive ? 34 : 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: isActive ? AppColors.primary : AppColors.disabled,
                      borderRadius: BorderRadius.circular(20),
                    ),
                  );
                }),
              ),
              const SizedBox(height: 36),
              SizedBox(
                width: double.infinity,
                height: 58,
                child: ElevatedButton(
                  onPressed: _isFinishing ? null : _nextPage,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: AppColors.primaryForeground,
                    disabledBackgroundColor: AppColors.disabled,
                    disabledForegroundColor: AppColors.disabledForeground,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                    ),
                  ),
                  child: _isFinishing
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.4,
                            color: AppColors.primaryForeground,
                          ),
                        )
                      : Text(
                          isLastPage ? 'Get Started' : 'Next',
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OnboardingPageData {
  const _OnboardingPageData({
    required this.icon,
    required this.title,
    required this.description,
  });

  final IconData icon;
  final String title;
  final String description;
}
