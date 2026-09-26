import 'package:feasta/core/enums/enums.dart';
import 'package:feasta/features/authentication/domain/auth_account_state.dart';
import 'package:flutter_test/flutter_test.dart';

AuthenticationUserProfileInput active({
  Object? role = 'customer',
  Object? accountStatus = 'active',
  Object? isActive = true,
  Object? isBlocked = false,
  Object? isPhoneVerified = true,
  Object? providerId,
}) {
  return AuthenticationUserProfileInput(
    role: role,
    accountStatus: accountStatus,
    isActive: isActive,
    isBlocked: isBlocked,
    isPhoneVerified: isPhoneVerified,
    providerId: providerId,
  );
}

AuthenticationGateKind gate({
  bool authenticated = true,
  bool emailVerified = true,
  bool authDisabled = false,
  AuthenticationUserProfileInput? userProfile,
  AuthenticationProviderProfileInput? providerProfile,
  Set<UserRole>? requiredRoles,
}) {
  return resolveAuthenticationGate(
    AuthenticationGateInput(
      authenticated: authenticated,
      emailVerified: emailVerified,
      authDisabled: authDisabled,
      userProfile: userProfile ?? active(),
      providerProfile: providerProfile,
      requiredRoles: requiredRoles,
    ),
  ).kind;
}

void main() {
  test('safe parsers align canonical and explicit legacy values', () {
    expect(tryParseUserRole(' CUSTOMER '), UserRole.customer);
    expect(tryParseUserRole('super_admin'), isNull);
    expect(
      tryParseAccountStatus('pendingDeletion'),
      AccountStatus.pendingDeletion,
    );
    expect(tryParseAccountStatus('enabled'), isNull);
    expect(
      tryParseProviderVerificationStatus('underReview'),
      ProviderVerificationStatus.underReview,
    );
    expect(tryParseProviderVerificationStatus('verified'), isNull);
  });

  test('resolves customer and inactive account states', () {
    expect(gate(), AuthenticationGateKind.customerReady);
    expect(
      gate(emailVerified: false),
      AuthenticationGateKind.emailVerificationRequired,
    );
    expect(
      gate(userProfile: active(isPhoneVerified: false)),
      AuthenticationGateKind.customerPhoneVerificationRequired,
    );
    expect(
      gate(userProfile: active(isBlocked: true)),
      AuthenticationGateKind.blocked,
    );
    expect(
      gate(authDisabled: true),
      AuthenticationGateKind.disabledAuthAccount,
    );
    expect(
      gate(userProfile: active(accountStatus: 'pending_deletion')),
      AuthenticationGateKind.deactivated,
    );
    expect(
      resolveAuthenticationGate(
        const AuthenticationGateInput(authenticated: true, emailVerified: true),
      ).kind,
      AuthenticationGateKind.missingUserProfile,
    );
  });

  test('resolves provider setup and canonical verification lifecycle', () {
    expect(
      gate(userProfile: active(role: 'provider')),
      AuthenticationGateKind.providerBusinessSetupRequired,
    );
    final provider = active(role: 'provider', providerId: 'provider-one');
    final expected = <String, AuthenticationGateKind>{
      'draft': AuthenticationGateKind.providerVerificationDraft,
      'submitted': AuthenticationGateKind.providerVerificationSubmitted,
      'under_review': AuthenticationGateKind.providerUnderReview,
      'resubmission_required':
          AuthenticationGateKind.providerResubmissionRequired,
      'rejected': AuthenticationGateKind.providerRejected,
      'suspended': AuthenticationGateKind.providerSuspended,
    };
    for (final entry in expected.entries) {
      expect(
        gate(
          userProfile: provider,
          providerProfile: AuthenticationProviderProfileInput(
            verificationStatus: entry.key,
            isActive: false,
          ),
        ),
        entry.value,
      );
    }
    expect(
      gate(
        userProfile: provider,
        providerProfile: const AuthenticationProviderProfileInput(
          verificationStatus: 'approved',
          isActive: true,
          isSuspended: false,
        ),
      ),
      AuthenticationGateKind.providerApproved,
    );
  });

  test('resolves admin and fails closed for forbidden roles', () {
    expect(
      gate(userProfile: active(role: 'admin')),
      AuthenticationGateKind.adminReady,
    );
    expect(
      gate(requiredRoles: {UserRole.admin}),
      AuthenticationGateKind.forbiddenRole,
    );
    expect(
      gate(
        userProfile: active(role: 'provider'),
        requiredRoles: {UserRole.admin},
      ),
      AuthenticationGateKind.forbiddenRole,
    );
    expect(
      gate(userProfile: active(role: 'owner')),
      AuthenticationGateKind.forbiddenRole,
    );
  });
}
