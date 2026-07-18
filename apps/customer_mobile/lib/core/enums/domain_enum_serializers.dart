import 'domain_enums.dart';

String userRoleToJson(UserRole role) => role.name;

UserRole? tryParseUserRole(Object? value) {
  final normalized = _normalizeAuthValue(value);
  return switch (normalized) {
    'customer' => UserRole.customer,
    'provider' => UserRole.provider,
    'admin' => UserRole.admin,
    _ => null,
  };
}

String accountStatusToJson(AccountStatus status) {
  return switch (status) {
    AccountStatus.active => 'active',
    AccountStatus.blocked => 'blocked',
    AccountStatus.disabled => 'disabled',
    AccountStatus.pendingDeletion => 'pending_deletion',
  };
}

AccountStatus? tryParseAccountStatus(Object? value) {
  final normalized = _normalizeAuthValue(value);
  return switch (normalized) {
    'active' => AccountStatus.active,
    'blocked' => AccountStatus.blocked,
    'disabled' => AccountStatus.disabled,
    'pending_deletion' || 'pendingdeletion' => AccountStatus.pendingDeletion,
    _ => null,
  };
}

String providerVerificationStatusToJson(ProviderVerificationStatus status) {
  return switch (status) {
    ProviderVerificationStatus.draft => 'draft',
    ProviderVerificationStatus.submitted => 'submitted',
    ProviderVerificationStatus.underReview => 'under_review',
    ProviderVerificationStatus.resubmissionRequired => 'resubmission_required',
    ProviderVerificationStatus.approved => 'approved',
    ProviderVerificationStatus.rejected => 'rejected',
    ProviderVerificationStatus.suspended => 'suspended',
  };
}

ProviderVerificationStatus? tryParseProviderVerificationStatus(Object? value) {
  final normalized = _normalizeAuthValue(value);
  return switch (normalized) {
    'draft' => ProviderVerificationStatus.draft,
    'submitted' => ProviderVerificationStatus.submitted,
    'under_review' || 'underreview' => ProviderVerificationStatus.underReview,
    'resubmission_required' ||
    'resubmissionrequired' => ProviderVerificationStatus.resubmissionRequired,
    'approved' => ProviderVerificationStatus.approved,
    'rejected' => ProviderVerificationStatus.rejected,
    'suspended' => ProviderVerificationStatus.suspended,
    _ => null,
  };
}

String _normalizeAuthValue(Object? value) {
  if (value is! String) return '';
  return value.trim().toLowerCase().replaceAll('-', '_');
}

String mainEventStatusToJson(MainEventStatus status) {
  return switch (status) {
    MainEventStatus.draft => 'draft',
    MainEventStatus.pendingProviderApproval => 'pending_provider_approval',
    MainEventStatus.needsProviderReplacement => 'needs_provider_replacement',
    MainEventStatus.waitingForDownPayment => 'waiting_for_down_payment',
    MainEventStatus.confirmed => 'confirmed',
    MainEventStatus.inProgress => 'in_progress',
    MainEventStatus.completed => 'completed',
    MainEventStatus.cancelled => 'cancelled',
    MainEventStatus.expired => 'expired',
  };
}

MainEventStatus mainEventStatusFromJson(String value) {
  return switch (value) {
    'draft' => MainEventStatus.draft,
    'pending_provider_approval' => MainEventStatus.pendingProviderApproval,
    'needs_provider_replacement' => MainEventStatus.needsProviderReplacement,
    'waiting_for_down_payment' => MainEventStatus.waitingForDownPayment,
    'confirmed' => MainEventStatus.confirmed,
    'in_progress' => MainEventStatus.inProgress,
    'completed' => MainEventStatus.completed,
    'cancelled' => MainEventStatus.cancelled,
    'expired' => MainEventStatus.expired,
    _ => throw FormatException('Unknown main event status: $value'),
  };
}

String providerRequestStatusToJson(ProviderRequestStatus status) {
  return switch (status) {
    ProviderRequestStatus.pending => 'pending',
    ProviderRequestStatus.accepted => 'accepted',
    ProviderRequestStatus.rejected => 'rejected',
    ProviderRequestStatus.waitingForDownPayment => 'waiting_for_down_payment',
    ProviderRequestStatus.paymentProcessing => 'payment_processing',
    ProviderRequestStatus.confirmed => 'confirmed',
    ProviderRequestStatus.inProgress => 'in_progress',
    ProviderRequestStatus.completed => 'completed',
    ProviderRequestStatus.cancelled => 'cancelled',
    ProviderRequestStatus.expired => 'expired',
  };
}

ProviderRequestStatus providerRequestStatusFromJson(String value) {
  return switch (value) {
    'pending' => ProviderRequestStatus.pending,
    'accepted' => ProviderRequestStatus.accepted,
    'rejected' => ProviderRequestStatus.rejected,
    'waiting_for_down_payment' => ProviderRequestStatus.waitingForDownPayment,
    'payment_processing' => ProviderRequestStatus.paymentProcessing,
    'confirmed' => ProviderRequestStatus.confirmed,
    'in_progress' => ProviderRequestStatus.inProgress,
    'completed' => ProviderRequestStatus.completed,
    'cancelled' => ProviderRequestStatus.cancelled,
    'expired' => ProviderRequestStatus.expired,
    _ => throw FormatException('Unknown provider request status: $value'),
  };
}

String providerRequestTypeToJson(ProviderRequestType type) {
  return switch (type) {
    ProviderRequestType.catering => 'catering',
    ProviderRequestType.addon => 'addon',
  };
}

ProviderRequestType providerRequestTypeFromJson(String value) {
  return switch (value) {
    'catering' => ProviderRequestType.catering,
    'addon' => ProviderRequestType.addon,
    _ => throw FormatException('Unknown provider request type: $value'),
  };
}
