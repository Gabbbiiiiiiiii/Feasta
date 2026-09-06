class UserRoles {
  UserRoles._();

  static const String customer = 'customer';
  static const String provider = 'provider';
  static const String admin = 'admin';
}

class ProviderVerificationStatus {
  ProviderVerificationStatus._();

  static const String draft = 'draft';
  static const String submitted = 'submitted';
  static const String underReview = 'under_review';
  static const String resubmissionRequired = 'resubmission_required';
  static const String approved = 'approved';
  static const String rejected = 'rejected';
  static const String suspended = 'suspended';

  static const List<String> values = [
    draft,
    submitted,
    underReview,
    resubmissionRequired,
    approved,
    rejected,
    suspended,
  ];

  static const Map<String, List<String>> allowedTransitions = {
    draft: [submitted],
    submitted: [underReview],
    underReview: [approved, rejected, resubmissionRequired],
    resubmissionRequired: [submitted],
    approved: [suspended],
    rejected: [],
    suspended: [],
  };

  static bool canTransition(String from, String to) {
    return allowedTransitions[from]?.contains(to) ?? false;
  }
}

class BookingStatus {
  BookingStatus._();

  static const String pending = 'pending';
  static const String accepted = 'accepted';
  static const String rejected = 'rejected';
  static const String waitingPayment = 'waiting_payment';
  static const String paymentProcessing = 'payment_processing';
  static const String confirmed = 'confirmed';

  static const String inProgress = 'in_progress';

  static const String completed = 'completed';
  static const String cancelled = 'cancelled';
  static const String expired = 'expired';

  static const List<String> values = [
    pending,
    accepted,
    rejected,
    waitingPayment,
    paymentProcessing,
    confirmed,
    inProgress,
    completed,
    cancelled,
    expired,
  ];
}

class ProviderServiceTypes {
  ProviderServiceTypes._();

  static const String catering = 'catering';
  static const String addon = 'addon';
  static const String both = 'both';
  static const List<String> values = [catering, addon, both];
}

class VerificationDocumentTypes {
  VerificationDocumentTypes._();

  static const String businessPermit = 'business_permit';
  static const String dtiRegistration = 'dti_registration';
  static const String birRegistration = 'bir_registration';
  static const String validId = 'valid_id';
  static const String sanitaryPermit = 'sanitary_permit';
  static const String mayorsPermit = 'mayors_permit';
  static const String other = 'other';

  static const List<String> values = [
    businessPermit,
    dtiRegistration,
    birRegistration,
    validId,
    sanitaryPermit,
    mayorsPermit,
    other,
  ];
  static const Set<String> required = {businessPermit, validId};
}

class VerificationDocumentStatuses {
  VerificationDocumentStatuses._();

  static const String pending = 'pending';
  static const String verified = 'verified';
  static const String rejected = 'rejected';
  static const String expired = 'expired';
  static const List<String> values = [pending, verified, rejected, expired];
}

class PaymentStatus {
  PaymentStatus._();

  static const String unpaid = 'unpaid';
  static const String partiallyPaid = 'partially_paid';
  static const String paid = 'paid';
  static const String failed = 'failed';
  static const String refunded = 'refunded';
  static const String expired = 'expired';
}

class PaymentRecordStatus {
  PaymentRecordStatus._();

  static const String pending = 'pending';
  static const String processing = 'processing';
  static const String paid = 'paid';
  static const String failed = 'failed';
  static const String refunded = 'refunded';
  static const String expired = 'expired';
}

class NotificationType {
  NotificationType._();

  static const String booking = 'booking';
  static const String payment = 'payment';
  static const String chat = 'new_message';
  static const String review = 'review';
  static const String verification = 'verification';
  static const String system = 'system';
}

class RecoveryOfferStatus {
  RecoveryOfferStatus._();

  static const String offered = 'offered';
  static const String selected = 'selected';
  static const String declined = 'declined';
  static const String expired = 'expired';
}

class AddonRequestStatus {
  AddonRequestStatus._();

  static const String pending = 'pending';
  static const String accepted = 'accepted';
  static const String rejected = 'rejected';
  static const String completed = 'completed';
  static const String cancelled = 'cancelled';
}

class BookingRecoveryStatus {
  BookingRecoveryStatus._();

  static const String none = 'none';
  static const String open = 'open';
  static const String offerReceived = 'offer_received';
  static const String customerSelected = 'customer_selected';
  static const String completed = 'completed';
  static const String failed = 'failed';
  static const String cancelled = 'cancelled';
}

class AddonLinkStatus {
  AddonLinkStatus._();

  static const String active = 'active';
  static const String awaitingCustomerRecoverySelection =
      'awaiting_customer_recovery_selection';
  static const String relinked = 'relinked';
  static const String cancelledDueToMainBookingFailed =
      'cancelled_due_to_main_booking_failed';
}
