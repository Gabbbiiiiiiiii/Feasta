import 'booking_lifecycle_presentation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/constants/status_constants.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import '../chat/chat_screen.dart';
import 'booking_details_screen.dart';
import 'customer_booking_presentation.dart';
import 'customer_bookings_controller.dart';
import 'full_payment_presentation.dart';
import 'payment_required_screen.dart';

class CustomerBookingsScreen extends StatefulWidget {
  const CustomerBookingsScreen({super.key, this.source});

  final CustomerBookingsSource? source;

  @override
  State<CustomerBookingsScreen> createState() => _CustomerBookingsScreenState();
}

class _CustomerBookingsScreenState extends State<CustomerBookingsScreen> {
  late final CustomerBookingsController controller;
  String _filter = 'All';
  String _query = '';
  bool _matches(BookingModel b) {
    final terminal = const [
      'completed',
      'cancelled',
      'expired',
      'rejected',
    ].contains(b.status);
    final pending = const [
      'pending',
      'pending_provider_approval',
      'needs_provider_replacement',
      'accepted',
      'waiting_payment',
      'waiting_for_down_payment',
      'payment_processing',
    ].contains(b.status);
    return (_filter == 'All' ||
            (_filter == 'Past' && terminal) ||
            (_filter == 'Pending' && pending) ||
            (_filter == 'Upcoming' && !terminal && !pending)) &&
        '${b.providerBusinessName} ${b.packageName} ${b.eventType} ${b.bookingCode}'
            .toLowerCase()
            .contains(_query.toLowerCase().trim());
  }

  @override
  void initState() {
    super.initState();
    controller = CustomerBookingsController(
      widget.source ?? FeastaRepository().customerBookingsSource(),
    );
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 12, 20),
            child: Row(
              children: [
                const Expanded(
                  child: Text(
                    'My Bookings',
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF0F4C3A),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: TextField(
              onChanged: (value) => setState(() => _query = value),
              decoration: InputDecoration(
                hintText: 'Search loaded bookings',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(28),
                ),
              ),
            ),
          ),
          Expanded(
            child: ListenableBuilder(
              listenable: controller,
              builder: (context, _) {
                if (controller.loading && controller.bookings.isEmpty) {
                  return const FeastaListSkeleton(
                    itemCount: 5,
                    padding: EdgeInsets.fromLTRB(
                      AppSpacing.screen,
                      AppSpacing.sm,
                      AppSpacing.screen,
                      AppSpacing.xl,
                    ),
                  );
                }

                if (controller.error != null && controller.bookings.isEmpty) {
                  return Center(
                    child: FeastaApplicationErrorState(
                      kind: FeastaErrorKind.load,
                      message:
                          'We could not load your bookings. Please try again.',
                      onRetry: () {
                        controller.refresh();
                      },
                    ),
                  );
                }

                final bookings = controller.bookings.where(_matches).toList()
                  ..sort((a, b) {
                    bool past(BookingModel value) => const [
                      'completed',
                      'cancelled',
                      'expired',
                      'rejected',
                    ].contains(value.status);
                    if (past(a) != past(b)) return past(a) ? 1 : -1;
                    final order = (a.eventDate ?? DateTime(9999)).compareTo(
                      b.eventDate ?? DateTime(9999),
                    );
                    return past(a) ? -order : order;
                  });

                if (controller.bookings.isEmpty) {
                  return RefreshIndicator(
                    onRefresh: controller.refresh,
                    child: ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: const [
                        SizedBox(height: 100),
                        _BookingsEmptyState(),
                      ],
                    ),
                  );
                }

                return RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: controller.refresh,
                  child: ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.screen,
                      AppSpacing.sm,
                      AppSpacing.screen,
                      100,
                    ),
                    itemCount: bookings.length + 2,
                    separatorBuilder: (context, index) {
                      return const SizedBox(height: AppSpacing.md);
                    },
                    itemBuilder: (context, index) {
                      if (index == 0) {
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _BookingsIntro(bookingCount: bookings.length),
                            const SizedBox(height: 16),
                            SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              child: Row(
                                children: [
                                  for (final label in [
                                    'All',
                                    'Upcoming',
                                    'Pending',
                                    'Past',
                                  ])
                                    Padding(
                                      padding: const EdgeInsets.only(right: 8),
                                      child: ChoiceChip(
                                        label: Text(label),
                                        selected: _filter == label,
                                        selectedColor: const Color(0xFF0F4C3A),
                                        labelStyle: TextStyle(
                                          color: _filter == label
                                              ? Colors.white
                                              : const Color(0xFF0F4C3A),
                                        ),
                                        showCheckmark: false,
                                        onSelected: (_) =>
                                            setState(() => _filter = label),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            if (controller.hasMore)
                              const Padding(
                                padding: EdgeInsets.only(top: 8),
                                child: Text(
                                  'Search and filters apply to loaded bookings. Load more to see older events.',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: AppColors.secondaryTextAccessible,
                                  ),
                                ),
                              ),
                            if (bookings.isEmpty)
                              const Padding(
                                padding: EdgeInsets.symmetric(vertical: 24),
                                child: Text(
                                  'No bookings match. Try another filter or load more.',
                                ),
                              ),
                          ],
                        );
                      }

                      if (index == bookings.length + 1) {
                        return Column(
                          children: [
                            if (controller.historyUpdated)
                              Semantics(
                                liveRegion: true,
                                child: const Text(
                                  'Bookings updated. Load older bookings again.',
                                ),
                              ),
                            if (controller.error != null)
                              Semantics(
                                liveRegion: true,
                                child: const Text(
                                  'Could not load older bookings. Please retry.',
                                ),
                              ),
                            if (controller.loading)
                              Semantics(
                                liveRegion: true,
                                label: 'Loading more bookings.',
                                child: const ExcludeSemantics(
                                  child: Center(
                                    child: CircularProgressIndicator(),
                                  ),
                                ),
                              )
                            else if (controller.hasMore)
                              OutlinedButton(
                                onPressed: controller.loadMore,
                                child: Text(
                                  controller.error == null
                                      ? 'Load More'
                                      : 'Retry',
                                ),
                              )
                            else
                              const Text(
                                'You have reached the end of available bookings.',
                              ),
                          ],
                        );
                      }
                      return BookingCard(
                        booking: bookings[index - 1],
                        onReturn: controller.refresh,
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _BookingsIntro extends StatelessWidget {
  const _BookingsIntro({required this.bookingCount});

  final int bookingCount;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Your events',
            style: AppTypography.sectionTitle.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: AppSpacing.xxs),
          Text(
            'Showing $bookingCount booking'
            '${bookingCount == 1 ? '' : 's'}',
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          ),
        ],
      ),
    );
  }
}

class _BookingsEmptyState extends StatelessWidget {
  const _BookingsEmptyState();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: AppSpacing.screen),
        child: FeastaEmptyState(
          icon: Icons.event_note_outlined,
          title: 'No bookings yet',
          message: 'Your catering bookings will appear here.',
        ),
      ),
    );
  }
}

class BookingCard extends StatelessWidget {
  const BookingCard({required this.booking, super.key, this.onReturn});

  final Future<void> Function()? onReturn;

  final BookingModel booking;

  CustomerBookingPresentation get presentation =>
      CustomerBookingPresentation(booking);
  String get statusLabel => presentation.label;
  FeastaStatusTone get statusTone => presentation.tone;

  String get formattedDate {
    final date = booking.eventDate;

    if (date == null) {
      return 'Date not set';
    }

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

  String get nextStepTitle => presentation.title;
  String get nextStepDescription => presentation.message;
  IconData get nextStepIcon => presentation.icon;
  Color get nextStepColor => presentation.foreground;
  Color get nextStepBackground => presentation.background;

  void _openDetails(BuildContext context) {
    Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => BookingDetailsScreen(bookingId: booking.id),
      ),
    ).then((_) => onReturn?.call());
  }

  void _openChat(BuildContext context) {
    Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) =>
            ChatScreen(booking: booking, currentRole: UserRoles.customer),
      ),
    ).then((_) => onReturn?.call());
  }

  void _openPayment(BuildContext context) {
    Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => PaymentRequiredScreen(booking: booking),
      ),
    ).then((_) => onReturn?.call());
  }

  @override
  Widget build(BuildContext context) => BookingLifecycleBuilder(
    booking: booking,
    builder: (context, label, message) =>
        _buildContent(context, label, message),
  );

  Widget _buildContent(BuildContext context, String? label, String? message) {
    final statusLabel = label ?? this.statusLabel;
    final nextStepTitle = label ?? this.nextStepTitle;
    final nextStepDescription = message ?? this.nextStepDescription;

    final textScaler = MediaQuery.textScalerOf(context);

    // Lifecycle holds have longer labels than ordinary statuses. Use the
    // existing stacked layout so neither the badge nor provider details squeeze
    // the other out while relationship evidence is loading.
    final largeText = textScaler.scale(16) >= 22 || statusLabel.length > 18;

    return Semantics(
      container: true,
      explicitChildNodes: true,
      label:
          'Booking with ${booking.providerBusinessName}. '
          '${booking.eventType}. '
          'Status $statusLabel. '
          'Event date $formattedDate.',
      child: FeastaCard(
        semanticLabel:
            'Booking with ${booking.providerBusinessName}, '
            '${booking.eventType}, '
            '$statusLabel, '
            '$formattedDate',
        padding: EdgeInsets.zero,
        onTap: () {
          _openDetails(context);
        },
        child: largeText
            ? _LargeTextBookingContent(
                booking: booking,
                statusLabel: statusLabel,
                statusTone: statusTone,
                formattedDate: formattedDate,
                nextStepTitle: nextStepTitle,
                nextStepDescription: nextStepDescription,
                nextStepIcon: nextStepIcon,
                nextStepColor: nextStepColor,
                nextStepBackground: nextStepBackground,
                onDetails: () {
                  _openDetails(context);
                },
                onChat: () {
                  _openChat(context);
                },
                onPayment: () {
                  _openPayment(context);
                },
              )
            : _StandardBookingContent(
                booking: booking,
                statusLabel: statusLabel,
                statusTone: statusTone,
                formattedDate: formattedDate,
                nextStepTitle: nextStepTitle,
                nextStepDescription: nextStepDescription,
                nextStepIcon: nextStepIcon,
                nextStepColor: nextStepColor,
                nextStepBackground: nextStepBackground,
                onDetails: () {
                  _openDetails(context);
                },
                onChat: () {
                  _openChat(context);
                },
                onPayment: () {
                  _openPayment(context);
                },
              ),
      ),
    );
  }
}

class _StandardBookingContent extends StatelessWidget {
  const _StandardBookingContent({
    required this.booking,
    required this.statusLabel,
    required this.statusTone,
    required this.formattedDate,
    required this.nextStepTitle,
    required this.nextStepDescription,
    required this.nextStepIcon,
    required this.nextStepColor,
    required this.nextStepBackground,
    required this.onDetails,
    required this.onChat,
    required this.onPayment,
  });

  final BookingModel booking;

  final String statusLabel;
  final FeastaStatusTone statusTone;
  final String formattedDate;

  final String nextStepTitle;
  final String nextStepDescription;
  final IconData nextStepIcon;
  final Color nextStepColor;
  final Color nextStepBackground;

  final VoidCallback onDetails;
  final VoidCallback onChat;
  final VoidCallback onPayment;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.all(AppSpacing.card),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _ProviderPicture(booking: booking),

                  const SizedBox(width: AppSpacing.md),

                  Expanded(child: _ProviderBookingInfo(booking: booking)),

                  const SizedBox(width: AppSpacing.sm),

                  FeastaStatusBadge(label: statusLabel, tone: statusTone),
                ],
              ),

              const SizedBox(height: AppSpacing.lg),

              Wrap(
                spacing: AppSpacing.md,
                runSpacing: AppSpacing.sm,
                children: [
                  _BookingMeta(
                    icon: Icons.calendar_month_outlined,
                    text: formattedDate,
                  ),

                  if (booking.eventTime.trim().isNotEmpty)
                    _BookingMeta(
                      icon: Icons.schedule_rounded,
                      text: booking.eventTime,
                    ),

                  _BookingMeta(
                    icon: Icons.groups_outlined,
                    text: '${booking.guestCount} guests',
                  ),
                ],
              ),

              const SizedBox(height: AppSpacing.md),

              Row(
                children: [
                  Expanded(
                    child: Text(
                      booking.eventType,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.caption.copyWith(
                        color: AppColors.secondaryTextAccessible,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Flexible(
                    child: InkWell(
                      onTap: () async {
                        await Clipboard.setData(
                          ClipboardData(text: booking.bookingCode),
                        );
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Booking reference copied'),
                            ),
                          );
                        }
                      },
                      child: Tooltip(
                        message: 'Copy booking reference',
                        child: Text(
                          booking.bookingCode,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.right,
                          style: AppTypography.caption.copyWith(
                            color: const Color(0xFF0F4C3A),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        _NextStepPanel(
          title: nextStepTitle,
          description: nextStepDescription,
          icon: nextStepIcon,
          foreground: nextStepColor,
          background: nextStepBackground,
        ),

        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.card,
            AppSpacing.md,
            AppSpacing.card,
            AppSpacing.card,
          ),
          child: _BookingCardActions(
            booking: booking,
            onDetails: onDetails,
            onChat: onChat,
            onPayment: onPayment,
            forceStack: true,
          ),
        ),
      ],
    );
  }
}

class _LargeTextBookingContent extends StatelessWidget {
  const _LargeTextBookingContent({
    required this.booking,
    required this.statusLabel,
    required this.statusTone,
    required this.formattedDate,
    required this.nextStepTitle,
    required this.nextStepDescription,
    required this.nextStepIcon,
    required this.nextStepColor,
    required this.nextStepBackground,
    required this.onDetails,
    required this.onChat,
    required this.onPayment,
  });

  final BookingModel booking;

  final String statusLabel;
  final FeastaStatusTone statusTone;
  final String formattedDate;

  final String nextStepTitle;
  final String nextStepDescription;
  final IconData nextStepIcon;
  final Color nextStepColor;
  final Color nextStepBackground;

  final VoidCallback onDetails;
  final VoidCallback onChat;
  final VoidCallback onPayment;

  @override
  Widget build(BuildContext context) {
    final packageName = booking.packageName.trim().isEmpty
        ? booking.eventType
        : booking.packageName;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.all(AppSpacing.card),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _ProviderPicture(booking: booking),

              const SizedBox(height: AppSpacing.md),

              Text(
                booking.providerBusinessName,
                style: AppTypography.cardTitle.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w900,
                ),
              ),

              const SizedBox(height: AppSpacing.xs),

              Text(
                packageName,
                style: AppTypography.bodySmall.copyWith(
                  color: AppColors.secondaryTextAccessible,
                  fontWeight: FontWeight.w600,
                ),
              ),

              const SizedBox(height: AppSpacing.md),

              Align(
                alignment: Alignment.centerLeft,
                child: FeastaStatusBadge(label: statusLabel, tone: statusTone),
              ),

              const SizedBox(height: AppSpacing.lg),

              _LargeTextDetail(label: 'Event date', value: formattedDate),

              const SizedBox(height: AppSpacing.sm),

              if (booking.eventTime.trim().isNotEmpty) ...[
                _LargeTextDetail(label: 'Event time', value: booking.eventTime),
                const SizedBox(height: AppSpacing.sm),
              ],

              _LargeTextDetail(
                label: 'Guests',
                value: '${booking.guestCount} guests',
              ),

              const SizedBox(height: AppSpacing.sm),

              _LargeTextDetail(label: 'Event type', value: booking.eventType),

              const SizedBox(height: AppSpacing.sm),

              _LargeTextDetail(
                label: 'Booking code',
                value: booking.bookingCode,
              ),
            ],
          ),
        ),

        _LargeTextNextStepPanel(
          title: nextStepTitle,
          description: nextStepDescription,
          icon: nextStepIcon,
          foreground: nextStepColor,
          background: nextStepBackground,
        ),

        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.card,
            AppSpacing.md,
            AppSpacing.card,
            AppSpacing.card,
          ),
          child: _BookingCardActions(
            booking: booking,
            onDetails: onDetails,
            onChat: onChat,
            onPayment: onPayment,
            forceStack: true,
          ),
        ),
      ],
    );
  }
}

class _LargeTextDetail extends StatelessWidget {
  const _LargeTextDetail({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: AppTypography.caption.copyWith(
            color: AppColors.secondaryTextAccessible,
            fontWeight: FontWeight.w700,
          ),
        ),

        const SizedBox(height: AppSpacing.xxs),

        Text(
          value,
          style: AppTypography.bodySmall.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _ProviderBookingInfo extends StatelessWidget {
  const _ProviderBookingInfo({required this.booking});

  final BookingModel booking;

  @override
  Widget build(BuildContext context) {
    final packageName = booking.packageName.trim().isEmpty
        ? booking.eventType
        : booking.packageName;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          booking.providerBusinessName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.cardTitle.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),

        const SizedBox(height: AppSpacing.xxs),

        Text(
          packageName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.bodySmall.copyWith(
            color: AppColors.secondaryTextAccessible,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _ProviderIcon extends StatelessWidget {
  const _ProviderIcon({required this.status});

  final String status;

  Color get foreground {
    switch (status) {
      case 'confirmed':
      case 'completed':
        return AppColors.success;

      case 'cancelled':
      case 'rejected':
      case 'expired':
        return AppColors.error;

      default:
        return AppColors.primaryStrong;
    }
  }

  Color get background {
    switch (status) {
      case 'confirmed':
      case 'completed':
        return AppColors.successSubtle;

      case 'cancelled':
      case 'rejected':
      case 'expired':
        return AppColors.errorSubtle;

      default:
        return AppColors.primarySubtle;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 54,
      height: 54,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(AppRadius.large),
      ),
      child: Icon(Icons.restaurant_menu_rounded, color: foreground, size: 26),
    );
  }
}

class _BookingMeta extends StatelessWidget {
  const _BookingMeta({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 17, color: AppColors.secondaryTextAccessible),

        const SizedBox(width: 5),

        Text(
          text,
          style: AppTypography.caption.copyWith(
            color: AppColors.secondaryTextAccessible,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _NextStepPanel extends StatelessWidget {
  const _NextStepPanel({
    required this.title,
    required this.description,
    required this.icon,
    required this.foreground,
    required this.background,
  });

  final String title;
  final String description;
  final IconData icon;
  final Color foreground;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: background,
        borderRadius: const BorderRadius.vertical(
          bottom: Radius.circular(AppRadius.card),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppRadius.medium),
            ),
            child: Icon(icon, color: foreground, size: 20),
          ),

          const SizedBox(width: AppSpacing.sm),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: AppTypography.label.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  description,
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

class _LargeTextNextStepPanel extends StatelessWidget {
  const _LargeTextNextStepPanel({
    required this.title,
    required this.description,
    required this.icon,
    required this.foreground,
    required this.background,
  });

  final String title;
  final String description;
  final IconData icon;
  final Color foreground;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.card),
      decoration: BoxDecoration(
        color: background,
        borderRadius: const BorderRadius.vertical(
          bottom: Radius.circular(AppRadius.card),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppRadius.medium),
            ),
            child: Icon(icon, color: foreground, size: 20),
          ),

          const SizedBox(height: AppSpacing.sm),

          Text(
            title,
            style: AppTypography.label.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),

          const SizedBox(height: AppSpacing.xs),

          Text(
            description,
            style: AppTypography.caption.copyWith(
              color: AppColors.secondaryTextAccessible,
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }
}

class _BookingCardActions extends StatelessWidget {
  const _BookingCardActions({
    required this.booking,
    required this.onDetails,
    required this.onChat,
    required this.onPayment,
    required this.forceStack,
  });

  final BookingModel booking;

  final VoidCallback onDetails;
  final VoidCallback onChat;
  final VoidCallback onPayment;

  final bool forceStack;

  bool get showPayment {
    return BookingStatus.isWaitingForPayment(booking.status);
  }

  bool get showChat {
    return booking.status == BookingStatus.confirmed ||
        booking.status == BookingStatus.completed;
  }

  ButtonStyle get _outlinedStyle {
    return OutlinedButton.styleFrom(
      foregroundColor: AppColors.mainText,
      minimumSize: const Size(0, 52),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm,
      ),
      side: const BorderSide(color: AppColors.border),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
    );
  }

  ButtonStyle get _primaryStyle {
    return ElevatedButton.styleFrom(
      backgroundColor: const Color(0xFF0F4C3A),
      foregroundColor: Colors.white,
      minimumSize: const Size(0, 52),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm,
      ),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.large),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (showPayment) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ElevatedButton(
            onPressed: onPayment,
            style: _primaryStyle,
            child: Text(
              isHistoricalDepositTerms(
                    amount: booking.totalAmount,
                    upfrontAmount: booking.downPaymentAmount,
                  )
                  ? 'Pay down payment'
                  : 'Pay full payment',
              textAlign: TextAlign.center,
              style: AppTypography.button.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),

          const SizedBox(height: AppSpacing.sm),

          OutlinedButton(
            onPressed: onDetails,
            style: _outlinedStyle,
            child: Text(
              'View details',
              textAlign: TextAlign.center,
              style: AppTypography.button.copyWith(
                color: AppColors.mainText,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      );
    }

    if (showChat) {
      if (forceStack) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            OutlinedButton(
              onPressed: onDetails,
              style: _outlinedStyle,
              child: Text(
                'View details',
                textAlign: TextAlign.center,
                style: AppTypography.button.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),

            const SizedBox(height: AppSpacing.sm),

            ElevatedButton(
              onPressed: onChat,
              style: _primaryStyle,
              child: Text(
                'Message provider',
                textAlign: TextAlign.center,
                style: AppTypography.button.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        );
      }

      return Row(
        children: [
          Expanded(
            child: OutlinedButton(
              onPressed: onDetails,
              style: _outlinedStyle,
              child: Text(
                'View details',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.button.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),

          const SizedBox(width: AppSpacing.sm),

          Expanded(
            child: ElevatedButton(
              onPressed: onChat,
              style: _primaryStyle,
              child: Text(
                'Message provider',
                style: AppTypography.button.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
        ],
      );
    }

    return SizedBox(
      width: double.infinity,
      child: OutlinedButton(
        onPressed: onDetails,
        style: _outlinedStyle,
        child: Text(
          'View details',
          textAlign: TextAlign.center,
          style: AppTypography.button.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}

class _ProviderPicture extends StatefulWidget {
  const _ProviderPicture({required this.booking});
  final BookingModel booking;
  @override
  State<_ProviderPicture> createState() => _ProviderPictureState();
}

class _ProviderPictureState extends State<_ProviderPicture> {
  late Future<String?> _image;
  @override
  void initState() {
    super.initState();
    _image = _load();
  }

  @override
  void didUpdateWidget(covariant _ProviderPicture oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.booking.providerId != widget.booking.providerId) {
      _image = _load();
    }
  }

  Future<String?> _load() async {
    try {
      return (await FeastaRepository().getProviderById(
        widget.booking.providerId,
      ))?.logoUrl;
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 54,
    height: 54,
    child: ClipOval(
      child: FutureBuilder<String?>(
        future: _image,
        builder: (context, snapshot) {
          final url = snapshot.data?.trim();
          final fallback = _ProviderIcon(status: widget.booking.status);
          return url == null || url.isEmpty
              ? fallback
              : Image.network(
                  url,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => fallback,
                );
        },
      ),
    ),
  );
}
