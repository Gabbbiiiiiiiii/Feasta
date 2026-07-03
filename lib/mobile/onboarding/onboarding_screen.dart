import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../auth/login_screen.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  static const String seenOnboardingKey = 'seen_feasta_onboarding';

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _pageController = PageController();

  int currentIndex = 0;

  final List<_OnboardingPageData> pages = const [
    _OnboardingPageData(
      icon: Icons.search_rounded,
      title: 'Browse Verified Providers',
      description:
          'Discover trusted catering and event service providers in Ormoc City with packages, ratings, and real reviews.',
    ),
    _OnboardingPageData(
      icon: Icons.auto_awesome_rounded,
      title: 'Customize Your Event',
      description:
          'Personalize packages, menus, decorations, chairs, tables, and add-ons based on your event needs.',
    ),
    _OnboardingPageData(
      icon: Icons.verified_user_outlined,
      title: 'Book, Track, and Pay Securely',
      description:
          'Submit booking requests, track your status, chat after booking, and pay your down payment securely.',
    ),
  ];

  Future<void> _finishOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(OnboardingScreen.seenOnboardingKey, true);

    if (!mounted) return;

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => const LoginScreen(),
      ),
    );
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
    const primary = Color(0xFFFF6333);
    const textDark = Color(0xFF1F2937);
    const textMuted = Color(0xFF6B7280);

    final isLastPage = currentIndex == pages.length - 1;

    return Scaffold(
      backgroundColor: const Color(0xFFF8F6F3),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 14, 24, 24),
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: _finishOnboarding,
                  child: const Text(
                    'Skip',
                    style: TextStyle(
                      color: textMuted,
                      fontWeight: FontWeight.w800,
                    ),
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
                          decoration: BoxDecoration(
                            color: primary.withOpacity(0.10),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            page.icon,
                            color: primary,
                            size: 62,
                          ),
                        ),
                        const SizedBox(height: 44),
                        Text(
                          page.title,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: textDark,
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
                              color: textMuted,
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
                children: List.generate(
                  pages.length,
                  (index) {
                    final isActive = currentIndex == index;

                    return AnimatedContainer(
                      duration: const Duration(milliseconds: 220),
                      margin: const EdgeInsets.symmetric(horizontal: 5),
                      width: isActive ? 34 : 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: isActive
                            ? primary
                            : const Color(0xFFD1D5DB),
                        borderRadius: BorderRadius.circular(20),
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: 36),
              SizedBox(
                width: double.infinity,
                height: 58,
                child: ElevatedButton(
                  onPressed: _nextPage,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: primary,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                    ),
                  ),
                  child: Text(
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
  final IconData icon;
  final String title;
  final String description;

  const _OnboardingPageData({
    required this.icon,
    required this.title,
    required this.description,
  });
}