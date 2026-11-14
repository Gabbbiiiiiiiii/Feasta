import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/feasta_models.dart';

/// Display only. Never use this projection to authorize booking actions.
class CustomerBookingPresentation {
  CustomerBookingPresentation(this.booking);
  final BookingModel booking;

  String get label {
    if (booking.status == 'pending_provider_approval') {
      if (_hasPendingResponse) return 'Awaiting provider';
      if (_hasDeclinedResponse) return 'Review provider responses';
      return 'Response status unavailable';
    }
    return const {
          'draft': 'Draft',
          'needs_provider_replacement': 'Provider replacement needed',
          'pending': 'Pending Review',
          'accepted': 'Accepted',
          'waiting_payment': 'Payment Required',
          'waiting_for_down_payment': 'Payment Required',
          'payment_processing': 'Processing Payment',
          'confirmed': 'Confirmed',
          'in_progress': 'In Progress',
          'completed': 'Completed',
          'cancelled': 'Cancelled',
          'rejected': 'Rejected',
          'expired': 'Expired',
        }[booking.status] ??
        'Status unavailable';
  }

  FeastaStatusTone get tone {
    if (booking.status == 'pending_provider_approval' && !_hasPendingResponse) {
      return FeastaStatusTone.neutral;
    }
    switch (booking.status) {
      case 'pending':
      case 'pending_provider_approval':
      case 'needs_provider_replacement':
      case 'waiting_payment':
      case 'waiting_for_down_payment':
      case 'payment_processing':
        return FeastaStatusTone.warning;
      case 'accepted':
      case 'confirmed':
        return FeastaStatusTone.success;
      case 'in_progress':
      case 'completed':
        return FeastaStatusTone.info;
      case 'cancelled':
      case 'rejected':
      case 'expired':
        return FeastaStatusTone.error;
      default:
        return FeastaStatusTone.neutral;
    }
  }

  String get title {
    if (booking.cancellationStatus == 'requested') {
      return 'Cancellation request pending';
    }
    switch (booking.status) {
      case 'draft':
        return 'Review your draft';
      case 'needs_provider_replacement':
        return 'Provider replacement needed';
      case 'pending':
      case 'pending_provider_approval':
        if (_hasPendingResponse) return 'Awaiting provider response';
        if (_hasDeclinedResponse) return 'Review provider responses';
        return 'Check your booking details';
      case 'accepted':
        return 'Review your booking request';
      case 'waiting_payment':
      case 'waiting_for_down_payment':
        return 'Review payment status';
      case 'payment_processing':
        return 'Payment is processing';
      case 'confirmed':
        return 'Your booking is confirmed';
      case 'in_progress':
        return 'Your event is in progress';
      case 'completed':
        return 'Event completed';
      case 'cancelled':
        return 'Booking cancelled';
      case 'rejected':
        return 'Booking request declined';
      case 'expired':
        return 'Booking request expired';
      default:
        return 'Check your booking details';
    }
  }

  // Aggregate response counts are display evidence only. They cannot establish
  // canonical request ownership, provider approval, or payment eligibility.
  bool get _hasPendingResponse =>
      (booking.pendingProviderRequestCount ?? 0) > 0;
  bool get _hasDeclinedResponse =>
      (booking.rejectedProviderRequestCount ?? 0) > 0;

  String get message {
    if (booking.cancellationStatus == 'requested') {
      return 'Review the cancellation request and latest booking details.';
    }
    switch (booking.status) {
      case 'draft':
        return 'Open the booking details to review this draft.';
      case 'needs_provider_replacement':
        return _hasPendingResponse
            ? 'A provider replacement is needed. Review the affected request while other providers respond.'
            : 'A provider replacement is needed. Review the affected request in your booking details.';
      case 'pending':
      case 'pending_provider_approval':
        if (_hasPendingResponse && _hasDeclinedResponse) {
          return 'A provider declined a request while other requests await a response. Review each request for its latest status.';
        }
        if (_hasPendingResponse) {
          return 'Some provider requests are awaiting a response. Review each request for its latest status.';
        }
        if (_hasDeclinedResponse) {
          return 'A provider declined a request. Review the affected request for details.';
        }
        return 'Provider response information is incomplete. Review the latest booking details.';
      case 'accepted':
        return 'Review the latest provider request details and payment status.';
      case 'waiting_payment':
      case 'waiting_for_down_payment':
        return 'Review payment status and any available payment instructions for each provider request.';
      case 'payment_processing':
        return 'Payment is processing. Check its status before attempting another payment.';
      case 'confirmed':
        return 'Review your event schedule and provider request details.';
      case 'in_progress':
        return 'Your event or service is currently underway.';
      case 'completed':
        return 'Review this completed booking in the booking details.';
      case 'cancelled':
        return 'Review the booking record for cancellation information.';
      case 'rejected':
        return 'Review the booking details for the provider response.';
      case 'expired':
        return 'This booking request has expired. Review the booking record for details.';
      default:
        return 'Status information is unavailable. Review the latest booking details.';
    }
  }

  IconData get icon => switch (booking.status) {
    'draft' => Icons.edit_note_rounded,
    'pending' || 'pending_provider_approval' => Icons.schedule_rounded,
    'needs_provider_replacement' => Icons.info_outline_rounded,
    'waiting_payment' ||
    'waiting_for_down_payment' => Icons.account_balance_wallet_outlined,
    'payment_processing' => Icons.sync_rounded,
    'confirmed' => Icons.verified_rounded,
    'in_progress' => Icons.celebration_outlined,
    'completed' => Icons.check_circle_outline_rounded,
    _ => Icons.event_note_outlined,
  };

  Color get foreground => switch (tone) {
    FeastaStatusTone.success => AppColors.success,
    FeastaStatusTone.error => AppColors.error,
    FeastaStatusTone.neutral => AppColors.secondaryTextAccessible,
    _ => AppColors.primaryStrong,
  };
  Color get background => switch (tone) {
    FeastaStatusTone.success => AppColors.successSubtle,
    FeastaStatusTone.error => AppColors.errorSubtle,
    FeastaStatusTone.neutral => AppColors.surfaceMuted,
    _ => AppColors.primarySubtle,
  };
}
