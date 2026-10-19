import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart';
import 'booking_attempt_coordinator.dart';
import 'booking_refund_policy_review_screen.dart';
import '../../shared/models/booking_contract.dart';
import 'booking_agreement_review_screen.dart';
import 'widgets/package_option_cards.dart';
import 'package:flutter/material.dart';

import '../../core/helpers/verification_guard.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_sizes.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/event_customization_data.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'booking_submitted_screen.dart';
import 'widgets/booking_preparation_price.dart';
import 'widgets/provider_brand_visual.dart';
import '../../core/helpers/booking_preparation.dart';

class BookingSummaryScreen extends StatefulWidget {
  const BookingSummaryScreen({
    required this.provider,
    required this.eventPackage,
    required this.customization,
    this.preparationOnly = true,
    super.key,
  });

  final bool preparationOnly;
  final ProviderModel provider;
  final PackageModel eventPackage;
  final EventCustomizationData customization;

  @override
  State<BookingSummaryScreen> createState() => _BookingSummaryScreenState();
}

class _BookingSummaryScreenState extends State<BookingSummaryScreen> {
  final FeastaRepository repository = FeastaRepository();

  static final _attempts = BookingAttemptCoordinator(
    store: const SecureBookingAttemptStore(),
    currentUid: () => FirebaseAuth.instance.currentUser?.uid,
  );
  bool _savingAttempt = false;
  String? _attemptMessage;
  StreamSubscription<User?>? _attemptAuth;

  @override
  void initState() {
    super.initState();
    _attemptAuth = FirebaseAuth.instance.authStateChanges().listen((_) {
      _attempts.invalidateSession();
      if (mounted) setState(() => _attemptMessage = null);
    });
  }

  @override
  void dispose() {
    _attemptAuth?.cancel();
    super.dispose();
  }

  Future<void> _prepareAttempt() async {
    if (_savingAttempt) return;
    setState(() => _savingAttempt = true);
    try {
      final attempt = await _attempts.prepare(
        BookingSelection(
          providerId: widget.provider.id,
          packageId: widget.eventPackage.id,
          customization: snapshotCustomization(widget.customization),
        ),
      );
      if (!mounted) return;
      setState(
        () => _attemptMessage = attempt.result != null
            ? 'This request already has a confirmed booking result. Review booking history.'
            : attempt.status == BookingAttemptStatus.requiresReconciliation
            ? 'Previous request outcome needs reconciliation. No new booking has been sent.'
            : 'Request identity saved securely. No booking has been sent. Fresh agreement and refund-policy reviews are required before future submission.',
      );
    } catch (_) {
      if (mounted) {
        setState(
          () => _attemptMessage =
              'Request identity could not be safely prepared. Submission remains blocked; existing attempts have been retained.',
        );
      }
    } finally {
      if (mounted) setState(() => _savingAttempt = false);
    }
  }

  bool isSubmitting = false;

  List<Map<String, dynamic>> get cateringProviderAddOns {
    return widget.customization.selectedAddOns
        .where((addon) => addon['source'] == 'catering_provider')
        .toList();
  }

  List<Map<String, dynamic>> get marketplaceAddOns {
    return widget.customization.selectedAddOns
        .where((addon) => addon['source'] == 'feasta_addon_provider')
        .toList();
  }

  double get addOnsTotal {
    return widget.customization.selectedAddOns.fold<double>(0, (sum, addon) {
      final rawPrice = addon['price'];

      if (rawPrice is num) {
        return sum + rawPrice.toDouble();
      }

      return sum;
    });
  }

  double get totalAmount {
    return widget.eventPackage.price + addOnsTotal;
  }

  double get fullPaymentEstimate {
    return totalAmount;
  }

  String get formattedDate {
    final date = widget.customization.eventDate;

    const months = <String>[
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    return '${months[date.month - 1]} '
        '${date.day}, ${date.year}';
  }

  Future<void> _submitBookingRequest() async {
    if (widget.preparationOnly || isSubmitting) {
      return;
    }

    final canSubmit = await requireVerifiedPhoneForBooking(context);

    if (!mounted || !canSubmit) {
      return;
    }

    setState(() {
      isSubmitting = true;
    });

    try {
      final customer = await repository.getCurrentCustomer();

      final result = await repository.createBookingRequest(
        customer: customer,
        provider: widget.provider,
        package: widget.eventPackage,
        serviceTier: widget.customization.serviceTier,
        packageThemeId: widget.customization.packageThemeId,
        eventType: widget.customization.eventType,
        eventDate: widget.customization.eventDate,
        eventTime: widget.customization.eventTime,
        eventEndTime: widget.customization.eventEndTime,
        guestCount: widget.customization.guestCount,
        eventLocation: widget.customization.eventLocation,
        eventAddress: widget.customization.eventAddress,
        selectedFoods: widget.customization.selectedFoods,
        selectedDecorations: widget.customization.selectedDecorations,
        selectedFurniture: widget.customization.selectedFurniture,
        selectedAddOns: widget.customization.selectedAddOns,
        willArrangeOwnAddOns: widget.customization.willArrangeOwnAddOns,
        customerArrangedAddOnsNote:
            widget.customization.customerArrangedAddOnsNote,
        specialRequest: widget.customization.specialRequest,
      );

      if (!mounted) {
        return;
      }

      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(
          builder: (_) => BookingSubmittedScreen(
            bookingId: result.bookingId,
            providerName: widget.provider.businessName,
          ),
        ),
        (_) => false,
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(error.toString().replaceAll('Exception: ', '')),
          ),
        );
    } finally {
      if (mounted) {
        setState(() {
          isSubmitting = false;
        });
      }
    }
  }

  Widget _preparationReview(BuildContext context) {
    final data = widget.customization;
    final service = preparationServices(widget.eventPackage)[data.serviceTier];
    final inclusions = service?['includedServices'];
    final theme = preparationThemes(widget.eventPackage)
        .where((item) => item['id'] == data.packageThemeId)
        .map((item) => item['name'].toString())
        .join(', ');
    Widget choices(String label, List<String> values) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 6),
        Wrap(
          spacing: 6,
          runSpacing: 4,
          children: [for (final value in values) Chip(label: Text(value))],
        ),
        const SizedBox(height: 10),
      ],
    );
    return Scaffold(
      appBar: AppBar(title: const Text('Review Event')),
      backgroundColor: AppColors.background,
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const CustomizationProgress(step: 3),
          OutlinedButton(
            onPressed: _savingAttempt ? null : _prepareAttempt,
            child: Text(
              _savingAttempt
                  ? 'Saving request identity...'
                  : 'Prepare request identity',
            ),
          ),
          if (_attemptMessage != null) Text(_attemptMessage!),
          const SizedBox(height: 8),
          const Text(
            'Preparation only. Availability is unverified. No booking has been sent.',
          ),
          const SizedBox(height: 12),
          _SummaryCard(
            icon: Icons.storefront_outlined,
            title: 'Provider and package',
            children: [
              Row(
                children: [
                  ProviderLogoBadge(provider: widget.provider, size: 40),
                  const SizedBox(width: 10),
                  Expanded(child: Text(widget.provider.businessName)),
                ],
              ),
              _SummaryRow(label: 'Package', value: widget.eventPackage.name),
              if (data.serviceTier != null)
                _SummaryRow(
                  label: 'Service',
                  value: service == null
                      ? data.serviceTier!
                      : serviceOptionTitle(data.serviceTier!, service),
                ),
            ],
          ),
          const SizedBox(height: 12),
          _SummaryCard(
            icon: Icons.calendar_month_outlined,
            title: 'Event details',
            children: [
              _SummaryRow(label: 'Event type', value: data.eventType),
              _SummaryRow(label: 'Date', value: formattedDate),
              _SummaryRow(
                label: 'Time',
                value: '${data.eventTime} - ${data.eventEndTime}',
              ),
              _SummaryRow(label: 'Guests', value: '${data.guestCount}'),
              _SummaryRow(label: 'Location', value: data.eventLocation),
              _SummaryRow(label: 'Full address', value: data.eventAddress),
            ],
          ),
          const SizedBox(height: 12),
          _SummaryCard(
            icon: Icons.tune_rounded,
            title: 'Customization',
            children: [
              if (data.selectedFoods.isNotEmpty)
                choices('Menu', data.selectedFoods),
              if (data.selectedDecorations.isNotEmpty)
                choices('Decorations', data.selectedDecorations),
              if (data.selectedFurniture.isNotEmpty)
                choices('Furniture and equipment', data.selectedFurniture),
              if (theme.isNotEmpty) _SummaryRow(label: 'Theme', value: theme),
              if (inclusions is List && inclusions.isNotEmpty)
                choices(
                  'Service inclusions',
                  inclusions.map((item) => item.toString()).toList(),
                ),
              if (widget.eventPackage.serviceInclusions.isNotEmpty)
                choices(
                  'Package services',
                  widget.eventPackage.serviceInclusions,
                ),
              if (data.selectedFoods.isEmpty &&
                  data.selectedDecorations.isEmpty &&
                  data.selectedFurniture.isEmpty &&
                  theme.isEmpty &&
                  (inclusions is! List || inclusions.isEmpty) &&
                  widget.eventPackage.serviceInclusions.isEmpty)
                const Text('No optional package choices selected.'),
            ],
          ),
          const SizedBox(height: 12),
          _SummaryCard(
            icon: Icons.add_circle_outline,
            title: 'Additional services',
            children: [
              if (data.selectedAddOns.isEmpty && !data.willArrangeOwnAddOns)
                const Text('No additional services selected'),
              for (final addon in data.selectedAddOns)
                _SummaryRow(
                  label: addon['source'] == 'catering_provider'
                      ? 'Provider add-on'
                      : 'FEASTA marketplace',
                  value: addon['name']?.toString() ?? 'Add-on',
                ),
              if (data.willArrangeOwnAddOns)
                _SummaryRow(
                  label: 'Customer-arranged',
                  value: data.customerArrangedAddOnsNote.trim().isEmpty
                      ? 'Arranging own services; costs unconfirmed'
                      : data.customerArrangedAddOnsNote,
                ),
              if (data.specialRequest.trim().isNotEmpty)
                _SummaryRow(
                  label: 'Special request',
                  value: data.specialRequest,
                ),
            ],
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            icon: const Icon(Icons.description_outlined),
            label: const Text('Review Booking & Payment Agreements'),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => BookingAgreementReviewScreen(
                  selection: BookingSelection(
                    providerId: widget.provider.id,
                    packageId: widget.eventPackage.id,
                    customization: snapshotCustomization(widget.customization),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            icon: const Icon(Icons.policy_outlined),
            label: const Text('Review Refund Policies'),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => BookingRefundPolicyReviewScreen(
                  selection: BookingSelection(
                    providerId: widget.provider.id,
                    packageId: widget.eventPackage.id,
                    customization: snapshotCustomization(widget.customization),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          BookingPreparationPrice(
            package: widget.eventPackage,
            addons: data.selectedAddOns,
            serviceTier: data.serviceTier,
            hasUnconfirmedRequests:
                data.willArrangeOwnAddOns ||
                data.specialRequest.trim().isNotEmpty,
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: FeastaPrimaryButton(
            label: 'Edit event details and selections',
            icon: const Icon(Icons.edit_outlined),
            onPressed: () => Navigator.pop(context),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.preparationOnly) return _preparationReview(context);
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: Text(
          'Review Booking',
          style: AppTypography.sectionTitle.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screen,
          AppSpacing.sm,
          AppSpacing.screen,
          140,
        ),
        children: [
          _BookingReviewHeader(
            provider: widget.provider,
            eventPackage: widget.eventPackage,
          ),

          const SizedBox(height: AppSpacing.xl),

          _SectionHeading(
            title: 'Event details',
            subtitle:
                'Review your event information before sending the request.',
          ),

          const SizedBox(height: AppSpacing.md),

          _SummaryCard(
            icon: Icons.storefront_outlined,
            title: 'Provider',
            children: [
              _SummaryRow(
                label: 'Provider',
                value: widget.provider.businessName,
              ),
              _SummaryRow(label: 'Location', value: widget.provider.location),
              _StatusSummaryRow(approved: widget.provider.isApproved),
            ],
          ),

          const SizedBox(height: AppSpacing.md),

          _SummaryCard(
            icon: Icons.inventory_2_outlined,
            title: 'Selected package',
            children: [
              _SummaryRow(label: 'Package', value: widget.eventPackage.name),
              _SummaryRow(
                label: 'Event type',
                value: widget.customization.eventType,
              ),
              _SummaryRow(
                label: 'Package capacity',
                value: widget.eventPackage.guestCapacity > 0
                    ? '${widget.eventPackage.guestCapacity} guests'
                    : 'Capacity not published',
              ),
            ],
          ),

          const SizedBox(height: AppSpacing.md),

          _SummaryCard(
            icon: Icons.calendar_month_outlined,
            title: 'Event details',
            children: [
              _IconSummaryRow(
                icon: Icons.calendar_today_outlined,
                label: 'Date',
                value: formattedDate,
              ),
              _IconSummaryRow(
                icon: Icons.schedule_rounded,
                label: 'Time',
                value:
                    '${widget.customization.eventTime} \u2013 '
                    '${widget.customization.eventEndTime}',
              ),
              _IconSummaryRow(
                icon: Icons.groups_outlined,
                label: 'Guests',
                value: '${widget.customization.guestCount}',
              ),
              _IconSummaryRow(
                icon: Icons.location_city_outlined,
                label: 'Location',
                value: widget.customization.eventLocation,
              ),
              _IconSummaryRow(
                icon: Icons.location_on_outlined,
                label: 'Address',
                value: widget.customization.eventAddress,
              ),
            ],
          ),

          const SizedBox(height: AppSpacing.xl),

          const _SectionHeading(
            title: 'Package selections',
            subtitle: 'These are the package items selected for your event.',
          ),

          const SizedBox(height: AppSpacing.md),

          _ListSummaryCard(
            icon: Icons.restaurant_outlined,
            title: 'Selected foods',
            emptyText: 'No food selections.',
            items: widget.customization.selectedFoods,
          ),

          const SizedBox(height: AppSpacing.md),

          _ListSummaryCard(
            icon: Icons.auto_awesome_outlined,
            title: 'Selected decorations',
            emptyText: 'No decoration selections.',
            items: widget.customization.selectedDecorations,
          ),

          const SizedBox(height: AppSpacing.md),

          _ListSummaryCard(
            icon: Icons.chair_outlined,
            title: 'Selected furniture',
            emptyText: 'No furniture selections.',
            items: widget.customization.selectedFurniture,
          ),

          const SizedBox(height: AppSpacing.xl),

          const _SectionHeading(
            title: 'Add-ons',
            subtitle: 'Review optional services included with this booking.',
          ),

          const SizedBox(height: AppSpacing.md),

          _AddOnGroupCard(
            icon: Icons.storefront_outlined,
            title: 'Provider add-ons',
            emptyText: 'No provider add-ons selected.',
            addOns: cateringProviderAddOns,
          ),

          const SizedBox(height: AppSpacing.md),

          _AddOnGroupCard(
            icon: Icons.grid_view_rounded,
            title: 'FEASTA marketplace',
            emptyText: 'No marketplace add-ons selected.',
            addOns: marketplaceAddOns,
          ),

          if (widget.customization.willArrangeOwnAddOns) ...[
            const SizedBox(height: AppSpacing.md),
            _TextSummaryCard(
              icon: Icons.person_outline_rounded,
              title: 'Customer-arranged add-ons',
              text:
                  widget.customization.customerArrangedAddOnsNote.trim().isEmpty
                  ? 'You indicated that you will arrange your own add-ons.'
                  : widget.customization.customerArrangedAddOnsNote.trim(),
            ),
          ],

          if (widget.customization.specialRequest.trim().isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xl),
            const _SectionHeading(
              title: 'Special request',
              subtitle: 'Additional information you provided for the caterer.',
            ),
            const SizedBox(height: AppSpacing.md),
            _TextSummaryCard(
              icon: Icons.sticky_note_2_outlined,
              title: 'Your request',
              text: widget.customization.specialRequest.trim(),
            ),
          ],

          const SizedBox(height: AppSpacing.xl),

          ...[
            const _SectionHeading(
              title: 'Payment summary',
              subtitle:
                  'Full Payment. You pay the full amount after the provider accepts the request.',
            ),

            const SizedBox(height: AppSpacing.md),

            _PaymentSummaryCard(
              packagePrice: widget.eventPackage.price,
              addOnsTotal: addOnsTotal,
              totalAmount: totalAmount,
            ),

            const SizedBox(height: AppSpacing.md),

            const _BookingProcessNotice(),
          ],
          const SizedBox(height: 48),
        ],
      ),
      bottomNavigationBar: _BookingSubmitBar(
        isSubmitting: isSubmitting,
        fullPaymentEstimate: fullPaymentEstimate,
        onSubmit: _submitBookingRequest,
      ),
    );
  }
}

class _BookingReviewHeader extends StatelessWidget {
  const _BookingReviewHeader({
    required this.provider,
    required this.eventPackage,
  });

  final ProviderModel provider;
  final PackageModel eventPackage;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.large),
            child: SizedBox(
              width: 88,
              height: 88,
              child: FeastaImage.network(
                imageUrl: eventPackage.imageUrl,
                description: '${eventPackage.name} package image',
                fallbackLabel: 'Package image unavailable',
                compactFallback: true,
                width: 88,
                height: 88,
                borderRadius: 0,
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        eventPackage.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.cardTitle.copyWith(
                          color: AppColors.mainText,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    if (provider.isApproved) ...[
                      const SizedBox(width: AppSpacing.xs),
                      const Tooltip(
                        message: 'Verified provider',
                        child: Icon(
                          Icons.verified_rounded,
                          color: AppColors.success,
                          size: AppSizes.iconMedium,
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  provider.businessName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                FeastaPriceText(
                  amount: eventPackage.price,
                  decimalDigits: 0,
                  semanticLabel: 'Package price',
                  style: AppTypography.label.copyWith(
                    color: AppColors.primaryStrong,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: AppTypography.sectionTitle.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: AppSpacing.xxs),
        Text(
          subtitle,
          style: AppTypography.bodySmall.copyWith(
            color: AppColors.secondaryTextAccessible,
            height: 1.4,
          ),
        ),
      ],
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.icon,
    required this.title,
    required this.children,
  });

  final IconData icon;
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _CardHeading(icon: icon, title: title),
          const SizedBox(height: AppSpacing.lg),
          for (var index = 0; index < children.length; index++) ...[
            children[index],
            if (index != children.length - 1)
              const Divider(height: AppSpacing.lg, color: AppColors.border),
          ],
        ],
      ),
    );
  }
}

class _CardHeading extends StatelessWidget {
  const _CardHeading({required this.icon, required this.title});

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 42,
          height: 42,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.primarySubtle,
            borderRadius: BorderRadius.circular(AppRadius.medium),
          ),
          child: Icon(
            icon,
            color: AppColors.primaryStrong,
            size: AppSizes.iconMedium,
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(
            title,
            style: AppTypography.cardTitle.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ],
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 4,
          child: Text(
            label,
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          flex: 6,
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ],
    );
  }
}

class _StatusSummaryRow extends StatelessWidget {
  const _StatusSummaryRow({required this.approved});

  final bool approved;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            'Verification',
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.sm,
            vertical: AppSpacing.xs,
          ),
          decoration: BoxDecoration(
            color: approved ? AppColors.successSubtle : AppColors.surfaceMuted,
            borderRadius: BorderRadius.circular(AppRadius.pill),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                approved ? Icons.verified_rounded : Icons.info_outline_rounded,
                color: approved
                    ? AppColors.success
                    : AppColors.secondaryTextAccessible,
                size: AppSizes.iconSmall,
              ),
              const SizedBox(width: 5),
              Text(
                approved ? 'Verified' : 'Not verified',
                style: AppTypography.caption.copyWith(
                  color: approved
                      ? AppColors.success
                      : AppColors.secondaryTextAccessible,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _IconSummaryRow extends StatelessWidget {
  const _IconSummaryRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          icon,
          color: AppColors.secondaryTextAccessible,
          size: AppSizes.iconMedium,
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: AppTypography.caption.copyWith(
                  color: AppColors.secondaryTextAccessible,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: AppTypography.bodySmall.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w800,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ListSummaryCard extends StatelessWidget {
  const _ListSummaryCard({
    required this.icon,
    required this.title,
    required this.emptyText,
    required this.items,
  });

  final IconData icon;
  final String title;
  final String emptyText;
  final List<String> items;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _CardHeading(icon: icon, title: title),
          const SizedBox(height: AppSpacing.md),
          if (items.isEmpty)
            Text(
              emptyText,
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.secondaryTextAccessible,
              ),
            )
          else
            for (var index = 0; index < items.length; index++) ...[
              _CheckItem(text: items[index]),
              if (index != items.length - 1)
                const SizedBox(height: AppSpacing.sm),
            ],
        ],
      ),
    );
  }
}

class _CheckItem extends StatelessWidget {
  const _CheckItem({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: AppColors.successSubtle,
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.check_rounded,
            color: AppColors.success,
            size: 17,
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(top: 3),
            child: Text(
              text,
              style: AppTypography.body.copyWith(
                color: AppColors.mainText,
                height: 1.4,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _AddOnGroupCard extends StatelessWidget {
  const _AddOnGroupCard({
    required this.icon,
    required this.title,
    required this.emptyText,
    required this.addOns,
  });

  final IconData icon;
  final String title;
  final String emptyText;
  final List<Map<String, dynamic>> addOns;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _CardHeading(icon: icon, title: title),
          const SizedBox(height: AppSpacing.md),
          if (addOns.isEmpty)
            Text(
              emptyText,
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.secondaryTextAccessible,
              ),
            )
          else
            for (var index = 0; index < addOns.length; index++) ...[
              _AddOnSummaryRow(addOn: addOns[index]),
              if (index != addOns.length - 1)
                const Divider(height: AppSpacing.lg, color: AppColors.border),
            ],
        ],
      ),
    );
  }
}

class _AddOnSummaryRow extends StatelessWidget {
  const _AddOnSummaryRow({required this.addOn});

  final Map<String, dynamic> addOn;

  @override
  Widget build(BuildContext context) {
    final name = addOn['name']?.toString().trim() ?? '';

    final providerBusinessName =
        addOn['providerBusinessName']?.toString().trim() ?? '';

    final category = addOn['category']?.toString().trim() ?? '';

    final rawPrice = addOn['price'];

    final price = rawPrice is num ? rawPrice.toDouble() : double.nan;

    final secondaryText = [
      providerBusinessName,
      category,
    ].where((value) => value.isNotEmpty).join(' \u2022 ');

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.primarySubtle,
            borderRadius: BorderRadius.circular(AppRadius.medium),
          ),
          child: const Icon(
            Icons.add_rounded,
            color: AppColors.primaryStrong,
            size: AppSizes.iconMedium,
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name.isEmpty ? 'Add-on' : name,
                style: AppTypography.label.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (secondaryText.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  secondaryText,
                  style: AppTypography.caption.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        FeastaPriceText(
          amount: price,
          decimalDigits: 0,
          semanticLabel: '${name.isEmpty ? 'Add-on' : name} price',
          style: AppTypography.label.copyWith(
            color: AppColors.primaryStrong,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );
  }
}

class _TextSummaryCard extends StatelessWidget {
  const _TextSummaryCard({
    required this.icon,
    required this.title,
    required this.text,
  });

  final IconData icon;
  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _CardHeading(icon: icon, title: title),
          const SizedBox(height: AppSpacing.md),
          Text(
            text,
            style: AppTypography.body.copyWith(
              color: AppColors.secondaryTextAccessible,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _PaymentSummaryCard extends StatelessWidget {
  const _PaymentSummaryCard({
    required this.packagePrice,
    required this.addOnsTotal,
    required this.totalAmount,
  });

  final double packagePrice;
  final double addOnsTotal;
  final double totalAmount;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        children: [
          _PriceSummaryRow(label: 'Package price', amount: packagePrice),

          const SizedBox(height: AppSpacing.sm),

          _PriceSummaryRow(label: 'Add-ons total', amount: addOnsTotal),

          const Padding(
            padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
            child: Divider(height: 1, color: AppColors.border),
          ),

          _PriceSummaryRow(
            label: 'Total amount',
            amount: totalAmount,
            emphasized: true,
          ),

          const SizedBox(height: AppSpacing.md),

          Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.primarySubtle,
              borderRadius: BorderRadius.circular(AppRadius.large),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Full Payment',
                  style: AppTypography.label.copyWith(
                    color: AppColors.primaryStrong,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  'The exact amount due is taken from the accepted provider request. This summary does not set the payment amount.',
                  style: AppTypography.caption.copyWith(
                    color: AppColors.secondaryTextAccessible,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PriceSummaryRow extends StatelessWidget {
  const _PriceSummaryRow({
    required this.label,
    required this.amount,
    this.emphasized = false,
  });

  final String label;
  final double amount;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final textStyle = emphasized
        ? AppTypography.cardTitle
        : AppTypography.bodySmall;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Text(
            label,
            style: textStyle.copyWith(
              color: AppColors.mainText,
              fontWeight: emphasized ? FontWeight.w900 : FontWeight.w600,
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        FeastaPriceText(
          amount: amount,
          decimalDigits: 0,
          semanticLabel: label,
          style: textStyle.copyWith(
            color: emphasized ? AppColors.primaryStrong : AppColors.mainText,
            fontWeight: emphasized ? FontWeight.w900 : FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _BookingProcessNotice extends StatelessWidget {
  const _BookingProcessNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.primarySubtle,
        borderRadius: BorderRadius.circular(AppRadius.large),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.surface,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.info_outline_rounded,
              color: AppColors.primaryStrong,
              size: AppSizes.iconMedium,
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'What happens next?',
                  style: AppTypography.label.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  'Submitting this request does not immediately '
                  'confirm your booking. The provider must accept '
                  'the request first. After acceptance, complete '
                  'the full payment to confirm the booking.',
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.secondaryTextAccessible,
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _BookingSubmitBar extends StatelessWidget {
  const _BookingSubmitBar({
    required this.isSubmitting,
    required this.fullPaymentEstimate,
    required this.onSubmit,
  });

  final bool isSubmitting;
  final double fullPaymentEstimate;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.surface,
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.sm,
        AppSpacing.screen,
        AppSpacing.md,
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Full payment after acceptance',
                    style: AppTypography.caption.copyWith(
                      color: AppColors.secondaryTextAccessible,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                FeastaPriceText(
                  amount: fullPaymentEstimate,
                  decimalDigits: 0,
                  semanticLabel:
                      'Estimated full payment after provider acceptance',
                  style: AppTypography.label.copyWith(
                    color: AppColors.primaryStrong,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            FeastaPrimaryButton(
              label: isSubmitting
                  ? 'Submitting Request...'
                  : 'Submit Booking Request',
              icon: isSubmitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.surface,
                      ),
                    )
                  : const Icon(Icons.send_rounded),
              onPressed: isSubmitting ? null : onSubmit,
            ),
          ],
        ),
      ),
    );
  }
}
