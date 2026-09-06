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

class BookingSummaryScreen extends StatefulWidget {
  const BookingSummaryScreen({
    required this.provider,
    required this.eventPackage,
    required this.customization,
    super.key,
  });

  final ProviderModel provider;
  final PackageModel eventPackage;
  final EventCustomizationData customization;

  @override
  State<BookingSummaryScreen> createState() => _BookingSummaryScreenState();
}

class _BookingSummaryScreenState extends State<BookingSummaryScreen> {
  final FeastaRepository repository = FeastaRepository();

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

  double get downPaymentAmount {
    return totalAmount * (widget.eventPackage.downPaymentPercentage / 100);
  }

  double get remainingBalance {
    return totalAmount - downPaymentAmount;
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
    if (isSubmitting) {
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

      final bookingId = await repository.createBookingRequest(
        customer: customer,
        provider: widget.provider,
        package: widget.eventPackage,
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
            bookingId: bookingId,
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

  @override
  Widget build(BuildContext context) {
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

          const _SectionHeading(
            title: 'Booking details',
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
                value: '${widget.eventPackage.guestCapacity} guests',
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
                    '${widget.customization.eventTime} – '
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
            title: 'Caterer add-ons',
            emptyText: 'No caterer add-ons selected.',
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

          const _SectionHeading(
            title: 'Payment summary',
            subtitle:
                'You only pay the down payment after the provider accepts the request.',
          ),

          const SizedBox(height: AppSpacing.md),

          _PaymentSummaryCard(
            packagePrice: widget.eventPackage.price,
            addOnsTotal: addOnsTotal,
            totalAmount: totalAmount,
            downPaymentPercentage: widget.eventPackage.downPaymentPercentage,
            downPaymentAmount: downPaymentAmount,
            remainingBalance: remainingBalance,
          ),

          const SizedBox(height: AppSpacing.md),

          const _BookingProcessNotice(),

          const SizedBox(height: 48),
        ],
      ),
      bottomNavigationBar: _BookingSubmitBar(
        isSubmitting: isSubmitting,
        downPaymentAmount: downPaymentAmount,
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

    final price = rawPrice is num ? rawPrice.toDouble() : 0.0;

    final secondaryText = [
      providerBusinessName,
      category,
    ].where((value) => value.isNotEmpty).join(' • ');

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
    required this.downPaymentPercentage,
    required this.downPaymentAmount,
    required this.remainingBalance,
  });

  final double packagePrice;
  final double addOnsTotal;
  final double totalAmount;
  final double downPaymentPercentage;
  final double downPaymentAmount;
  final double remainingBalance;

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
              children: [
                _PriceSummaryRow(
                  label:
                      'Down payment '
                      '(${downPaymentPercentage.toStringAsFixed(0)}%)',
                  amount: downPaymentAmount,
                  accent: true,
                ),
                const SizedBox(height: AppSpacing.sm),
                _PriceSummaryRow(
                  label: 'Remaining balance',
                  amount: remainingBalance,
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
    this.accent = false,
  });

  final String label;
  final double amount;
  final bool emphasized;
  final bool accent;

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
              color: accent ? AppColors.primaryStrong : AppColors.mainText,
              fontWeight: emphasized || accent
                  ? FontWeight.w900
                  : FontWeight.w600,
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        FeastaPriceText(
          amount: amount,
          decimalDigits: 0,
          semanticLabel: label,
          style: textStyle.copyWith(
            color: emphasized || accent
                ? AppColors.primaryStrong
                : AppColors.mainText,
            fontWeight: emphasized || accent
                ? FontWeight.w900
                : FontWeight.w700,
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
                  'the required down payment to confirm the booking.',
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
    required this.downPaymentAmount,
    required this.onSubmit,
  });

  final bool isSubmitting;
  final double downPaymentAmount;
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
                    'Due after provider acceptance',
                    style: AppTypography.caption.copyWith(
                      color: AppColors.secondaryTextAccessible,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                FeastaPriceText(
                  amount: downPaymentAmount,
                  decimalDigits: 0,
                  semanticLabel: 'Down payment due after provider acceptance',
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
