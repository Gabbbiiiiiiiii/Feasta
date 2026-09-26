enum UserRole { customer, provider, admin }

enum AccountStatus { active, blocked, disabled, pendingDeletion }

enum ProviderVerificationStatus {
  draft,
  submitted,
  underReview,
  resubmissionRequired,
  approved,
  rejected,
  suspended,
}

enum ProviderServiceType { catering, addon, both }

enum VerificationDocumentType {
  businessPermit,
  dtiRegistration,
  birRegistration,
  validId,
  sanitaryPermit,
  mayorsPermit,
  other,
}

enum VerificationDocumentStatus { pending, verified, rejected, expired }

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

enum PaymentStatus { pending, processing, paid, failed, expired, refunded }

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
