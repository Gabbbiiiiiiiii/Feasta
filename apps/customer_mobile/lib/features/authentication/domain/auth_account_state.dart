import '../../../core/enums/enums.dart';

enum AuthenticationGateKind {
  loading,
  unauthenticated,
  missingUserProfile,
  disabledAuthAccount,
  disabledAccount,
  blocked,
  deactivated,
  emailVerificationRequired,
  customerReady,
  customerPhoneVerificationRequired,
  providerBusinessSetupRequired,
  providerVerificationDraft,
  providerVerificationSubmitted,
  providerUnderReview,
  providerResubmissionRequired,
  providerRejected,
  providerSuspended,
  providerApproved,
  adminReady,
  forbiddenRole,
  sessionExpired,
  configurationError,
  invalidAccountState,
}

class AuthenticationUserProfileInput {
  const AuthenticationUserProfileInput({
    this.role,
    this.accountStatus,
    this.isActive,
    this.isBlocked,
    this.isPhoneVerified,
    this.providerId,
  });

  final Object? role;
  final Object? accountStatus;
  final Object? isActive;
  final Object? isBlocked;
  final Object? isPhoneVerified;
  final Object? providerId;
}

class AuthenticationProviderProfileInput {
  const AuthenticationProviderProfileInput({
    this.verificationStatus,
    this.isActive,
    this.isSuspended,
  });

  final Object? verificationStatus;
  final Object? isActive;
  final Object? isSuspended;
}

class AuthenticationGateInput {
  const AuthenticationGateInput({
    required this.authenticated,
    this.loading = false,
    this.configurationError = false,
    this.sessionExpired = false,
    this.authDisabled = false,
    this.emailVerified = false,
    this.userProfile,
    this.providerProfile,
    this.requiredRoles,
  });

  final bool authenticated;
  final bool loading;
  final bool configurationError;
  final bool sessionExpired;
  final bool authDisabled;
  final bool emailVerified;
  final AuthenticationUserProfileInput? userProfile;
  final AuthenticationProviderProfileInput? providerProfile;
  final Set<UserRole>? requiredRoles;
}

class AuthenticationGateResult {
  const AuthenticationGateResult(
    this.kind, {
    this.role,
    this.accountStatus,
    this.providerVerificationStatus,
  });

  final AuthenticationGateKind kind;
  final UserRole? role;
  final AccountStatus? accountStatus;
  final ProviderVerificationStatus? providerVerificationStatus;
}

AuthenticationGateResult resolveAuthenticationGate(
  AuthenticationGateInput input,
) {
  if (input.configurationError) {
    return const AuthenticationGateResult(
      AuthenticationGateKind.configurationError,
    );
  }
  if (input.loading) {
    return const AuthenticationGateResult(AuthenticationGateKind.loading);
  }
  if (input.sessionExpired) {
    return const AuthenticationGateResult(
      AuthenticationGateKind.sessionExpired,
    );
  }
  if (!input.authenticated) {
    return const AuthenticationGateResult(
      AuthenticationGateKind.unauthenticated,
    );
  }
  if (input.authDisabled) {
    return const AuthenticationGateResult(
      AuthenticationGateKind.disabledAuthAccount,
    );
  }
  final profile = input.userProfile;
  if (profile == null) {
    return const AuthenticationGateResult(
      AuthenticationGateKind.missingUserProfile,
    );
  }

  final role = tryParseUserRole(profile.role);
  final accountStatus = tryParseAccountStatus(profile.accountStatus);
  if (role == null) {
    return const AuthenticationGateResult(AuthenticationGateKind.forbiddenRole);
  }
  if (accountStatus == null) {
    return AuthenticationGateResult(
      AuthenticationGateKind.invalidAccountState,
      role: role,
    );
  }
  if (profile.isActive is! bool || profile.isBlocked is! bool) {
    return AuthenticationGateResult(
      AuthenticationGateKind.invalidAccountState,
      role: role,
      accountStatus: accountStatus,
    );
  }

  AuthenticationGateResult result(
    AuthenticationGateKind kind, {
    ProviderVerificationStatus? providerStatus,
  }) {
    return AuthenticationGateResult(
      kind,
      role: role,
      accountStatus: accountStatus,
      providerVerificationStatus: providerStatus,
    );
  }

  if (profile.isBlocked == true || accountStatus == AccountStatus.blocked) {
    return result(AuthenticationGateKind.blocked);
  }
  if (accountStatus == AccountStatus.pendingDeletion) {
    return result(AuthenticationGateKind.deactivated);
  }
  if (accountStatus == AccountStatus.disabled || profile.isActive != true) {
    return result(AuthenticationGateKind.disabledAccount);
  }
  if (accountStatus != AccountStatus.active) {
    return result(AuthenticationGateKind.invalidAccountState);
  }
  if (input.requiredRoles case final roles? when !roles.contains(role)) {
    return result(AuthenticationGateKind.forbiddenRole);
  }
  if (!input.emailVerified) {
    return result(AuthenticationGateKind.emailVerificationRequired);
  }

  if (role == UserRole.customer) {
    return result(
      profile.isPhoneVerified == true
          ? AuthenticationGateKind.customerReady
          : AuthenticationGateKind.customerPhoneVerificationRequired,
    );
  }
  if (role == UserRole.admin) {
    return result(AuthenticationGateKind.adminReady);
  }

  final providerId = profile.providerId;
  final provider = input.providerProfile;
  if (providerId is! String || providerId.trim().isEmpty || provider == null) {
    return result(AuthenticationGateKind.providerBusinessSetupRequired);
  }
  final providerStatus = tryParseProviderVerificationStatus(
    provider.verificationStatus,
  );
  if (providerStatus == null) {
    return result(AuthenticationGateKind.invalidAccountState);
  }

  return switch (providerStatus) {
    ProviderVerificationStatus.draft => result(
      AuthenticationGateKind.providerVerificationDraft,
      providerStatus: providerStatus,
    ),
    ProviderVerificationStatus.submitted => result(
      AuthenticationGateKind.providerVerificationSubmitted,
      providerStatus: providerStatus,
    ),
    ProviderVerificationStatus.underReview => result(
      AuthenticationGateKind.providerUnderReview,
      providerStatus: providerStatus,
    ),
    ProviderVerificationStatus.resubmissionRequired => result(
      AuthenticationGateKind.providerResubmissionRequired,
      providerStatus: providerStatus,
    ),
    ProviderVerificationStatus.rejected => result(
      AuthenticationGateKind.providerRejected,
      providerStatus: providerStatus,
    ),
    ProviderVerificationStatus.suspended => result(
      AuthenticationGateKind.providerSuspended,
      providerStatus: providerStatus,
    ),
    ProviderVerificationStatus.approved =>
      provider.isActive == true && provider.isSuspended != true
          ? result(
              AuthenticationGateKind.providerApproved,
              providerStatus: providerStatus,
            )
          : result(
              AuthenticationGateKind.invalidAccountState,
              providerStatus: providerStatus,
            ),
  };
}
