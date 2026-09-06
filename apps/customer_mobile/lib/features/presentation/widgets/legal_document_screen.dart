import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';

enum FeastaLegalDocument { termsOfService, privacyPolicy }

class LegalDocumentScreen extends StatelessWidget {
  const LegalDocumentScreen({required this.document, super.key});

  final FeastaLegalDocument document;

  bool get _isTerms => document == FeastaLegalDocument.termsOfService;

  String get _title => _isTerms ? 'Terms of Service' : 'Privacy Policy';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.mainText,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          tooltip: 'Close $_title',
          onPressed: () => Navigator.pop(context),
          icon: const Icon(Icons.close_rounded),
        ),
        title: Text(_title),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.xl,
            AppSpacing.lg,
            AppSpacing.xl,
            AppSpacing.huge,
          ),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720),
              child: _isTerms
                  ? const _TermsOfServiceContent()
                  : const _PrivacyPolicyContent(),
            ),
          ),
        ),
      ),
    );
  }
}

class _TermsOfServiceContent extends StatelessWidget {
  const _TermsOfServiceContent();

  @override
  Widget build(BuildContext context) {
    return const _LegalContent(
      title: 'FEASTA Terms of Service',
      introduction:
          'These Terms of Service explain the conditions that apply when '
          'using FEASTA to discover catering and event service providers, '
          'create and manage bookings, communicate with providers, and use '
          'other customer features available through the platform.',
      sections: [
        _LegalSection(
          title: '1. Using FEASTA',
          body:
              'You must provide accurate information when creating and '
              'using your FEASTA customer account. You are responsible for '
              'keeping your account credentials secure and for activity '
              'performed through your account.',
        ),
        _LegalSection(
          title: '2. Customer Accounts',
          body:
              'Some FEASTA features require a registered customer account. '
              'Guest users may browse available services, while protected '
              'features such as bookings, favorites, account management, '
              'and payment-related actions may require authentication.',
        ),
        _LegalSection(
          title: '3. Providers and Services',
          body:
              'FEASTA allows customers to discover catering and event '
              'service providers and review the packages, menus, add-ons, '
              'availability, ratings, and other information made available '
              'through the platform.',
        ),
        _LegalSection(
          title: '4. Booking Requests',
          body:
              'Submitting a booking request does not by itself guarantee '
              'that a provider will accept the event. A booking progresses '
              'according to its current status and the actions required '
              'from the customer and provider.',
        ),
        _LegalSection(
          title: '5. Payments',
          body:
              'When a booking requires a down payment, customers must '
              'complete the required payment through the payment options '
              'provided by FEASTA. Payment status and booking confirmation '
              'are handled according to the applicable booking process.',
        ),
        _LegalSection(
          title: '6. Cancellations and Changes',
          body:
              'Booking changes, cancellations, refunds, and related '
              'requests are subject to the status of the booking and any '
              'applicable FEASTA or provider policies presented to the '
              'customer.',
        ),
        _LegalSection(
          title: '7. Appropriate Use',
          body:
              'You must not misuse FEASTA, interfere with the operation of '
              'the platform, attempt unauthorized access, impersonate '
              'another person, submit fraudulent information, or use the '
              'service for unlawful purposes.',
        ),
        _LegalSection(
          title: '8. Platform Availability',
          body:
              'FEASTA may occasionally be unavailable because of '
              'maintenance, network conditions, third-party services, '
              'security requirements, or other operational circumstances.',
        ),
        _LegalSection(
          title: '9. Updates to These Terms',
          body:
              'These Terms of Service may be updated as FEASTA develops. '
              'When material changes are made, the updated terms should be '
              'made available through the application.',
        ),
      ],
    );
  }
}

class _PrivacyPolicyContent extends StatelessWidget {
  const _PrivacyPolicyContent();

  @override
  Widget build(BuildContext context) {
    return const _LegalContent(
      title: 'FEASTA Privacy Policy',
      introduction:
          'This Privacy Policy describes how FEASTA handles information '
          'needed to provide customer accounts, event planning, booking, '
          'payment, communication, and related platform features.',
      sections: [
        _LegalSection(
          title: '1. Information You Provide',
          body:
              'FEASTA may process information you provide when creating or '
              'using an account, including your name, email address, phone '
              'number, event details, booking information, and other '
              'information necessary to provide requested services.',
        ),
        _LegalSection(
          title: '2. Authentication Information',
          body:
              'FEASTA uses authentication services to identify users and '
              'protect account access. When you choose Google sign-in, '
              'information made available through the authentication '
              'provider may be used to establish or access your FEASTA '
              'account.',
        ),
        _LegalSection(
          title: '3. Booking Information',
          body:
              'Information related to event requests, selected providers, '
              'packages, add-ons, guest counts, event dates, locations, '
              'booking statuses, and related activity may be processed to '
              'provide and manage FEASTA booking services.',
        ),
        _LegalSection(
          title: '4. Payment Information',
          body:
              'Payment-related information may be processed through the '
              'payment services integrated with FEASTA. FEASTA uses the '
              'information necessary to associate payment activity with '
              'the appropriate customer and booking.',
        ),
        _LegalSection(
          title: '5. How Information Is Used',
          body:
              'Information may be used to provide platform functionality, '
              'authenticate users, process booking workflows, communicate '
              'important account or booking information, maintain '
              'security, troubleshoot problems, and improve the service.',
        ),
        _LegalSection(
          title: '6. Sharing Necessary Information',
          body:
              'Information may be shared with the relevant service '
              'provider or supporting service when necessary to process '
              'bookings, payments, communications, or other functionality '
              'requested through FEASTA.',
        ),
        _LegalSection(
          title: '7. Security',
          body:
              'FEASTA uses technical and organizational safeguards '
              'intended to protect account and platform information. No '
              'online system can guarantee absolute security, so users '
              'should also protect their credentials and devices.',
        ),
        _LegalSection(
          title: '8. Your Account Information',
          body:
              'Customers should keep their account information accurate. '
              'Available account features may allow customers to review or '
              'update information associated with their FEASTA account.',
        ),
        _LegalSection(
          title: '9. Policy Updates',
          body:
              'This Privacy Policy may be updated as FEASTA functionality '
              'and data practices develop. Updated information should be '
              'made available through the application.',
        ),
      ],
    );
  }
}

class _LegalContent extends StatelessWidget {
  const _LegalContent({
    required this.title,
    required this.introduction,
    required this.sections,
  });

  final String title;
  final String introduction;
  final List<_LegalSection> sections;

  @override
  Widget build(BuildContext context) {
    return SelectionArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: AppTypography.headline.copyWith(color: AppColors.mainText),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Last updated: August 2026',
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          ),
          const SizedBox(height: AppSpacing.xl),
          Text(
            introduction,
            style: AppTypography.body.copyWith(color: AppColors.mainText),
          ),
          const SizedBox(height: AppSpacing.xxl),
          for (var index = 0; index < sections.length; index++) ...[
            Text(
              sections[index].title,
              style: AppTypography.title.copyWith(color: AppColors.mainText),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              sections[index].body,
              style: AppTypography.body.copyWith(
                color: AppColors.secondaryTextAccessible,
              ),
            ),
            if (index != sections.length - 1)
              const SizedBox(height: AppSpacing.xl),
          ],
        ],
      ),
    );
  }
}

class _LegalSection {
  const _LegalSection({required this.title, required this.body});

  final String title;
  final String body;
}
