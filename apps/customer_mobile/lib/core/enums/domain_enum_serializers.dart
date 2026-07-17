import 'domain_enums.dart';

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
