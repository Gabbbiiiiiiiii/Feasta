enum UserRole { customer, provider, admin }

enum AccountStatus { active, blocked, disabled, pendingDeletion }

enum ProviderVerificationStatus {
  draft,
  submitted,
  underReview,
  approved,
  rejected,
  resubmissionRequired,
  suspended,
}

enum BookingStatus {
  draft,
  pending,
  providerAccepted,
  providerRejected,
  waitingPayment,
  paymentProcessing,
  confirmed,
  inProgress,
  completed,
  cancelled,
  expired,
  disputed,
}

enum PaymentStatus {
  pending,
  processing,
  paid,
  failed,
  expired,
  refunded,
}

enum ComplaintStatus {
  submitted,
  underReview,
  awaitingCustomer,
  awaitingProvider,
  resolved,
  dismissed,
  escalated,
  closed,
}

enum MainEventStatus {
  draft,
  pendingProviderApproval,
  needsProviderReplacement,
  waitingForDownPayment,
  confirmed,
  inProgress,
  completed,
  cancelled,
  expired,
}

enum ProviderRequestStatus {
  pending,
  accepted,
  rejected,
  waitingForDownPayment,
  paymentProcessing,
  confirmed,
  inProgress,
  completed,
  cancelled,
  expired,
}

enum ProviderRequestType { catering, addon }
