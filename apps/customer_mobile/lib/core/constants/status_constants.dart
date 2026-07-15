class UserRoles {
  UserRoles._();

  static const String customer = 'customer';
  static const String provider = 'provider';
  static const String admin = 'admin';
}

class ProviderVerificationStatus {
  ProviderVerificationStatus._();

  static const String pending = 'pending';
  static const String verified = 'verified';
  static const String rejected = 'rejected';
  static const String suspended = 'suspended';
}

class ProviderVerificationRequestStatus {
  ProviderVerificationRequestStatus._();

  static const String pending = 'pending';
  static const String approved = 'approved';
  static const String rejected = 'rejected';
}

class BookingStatus {
  BookingStatus._();

  static const String pending = 'pending';
  static const String accepted = 'accepted';
  static const String rejected = 'rejected';
  static const String waitingPayment = 'waiting_payment';
  static const String paymentProcessing = 'payment_processing';
  static const String confirmed = 'confirmed';
  static const String completed = 'completed';
  static const String cancelled = 'cancelled';
  static const String expired = 'expired';
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
  static const String chat = 'chat';
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