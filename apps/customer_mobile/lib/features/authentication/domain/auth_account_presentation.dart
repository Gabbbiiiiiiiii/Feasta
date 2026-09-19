import 'auth_account_state.dart';

class AuthenticationGatePresentation {
  const AuthenticationGatePresentation({
    required this.label,
    required this.message,
    this.recoveryAction,
  });

  final String label;
  final String message;
  final String? recoveryAction;
}

/// Flutter mirror of the canonical account-state presentation in
/// `packages/shared-types/src/authentication.ts`.
///
/// This copy explains trusted account decisions only. It is never an
/// authorization source.
const authenticationGatePresentations =
    <AuthenticationGateKind, AuthenticationGatePresentation>{
      AuthenticationGateKind.loading: AuthenticationGatePresentation(
        label: 'Checking account',
        message: 'FEASTA is checking your account.',
      ),
      AuthenticationGateKind.unauthenticated: AuthenticationGatePresentation(
        label: 'Sign in required',
        message: 'Sign in to continue.',
        recoveryAction: 'Sign in',
      ),
      AuthenticationGateKind.missingUserProfile: AuthenticationGatePresentation(
        label: 'Profile unavailable',
        message: 'We could not find the FEASTA profile for this account.',
        recoveryAction: 'Retry or contact FEASTA support',
      ),
      AuthenticationGateKind
          .disabledAuthAccount: AuthenticationGatePresentation(
        label: 'Account disabled',
        message: 'This account is disabled. Contact FEASTA support for help.',
        recoveryAction: 'Contact FEASTA support',
      ),
      AuthenticationGateKind.disabledAccount: AuthenticationGatePresentation(
        label: 'Account disabled',
        message: 'This account is disabled. Contact FEASTA support for help.',
        recoveryAction: 'Contact FEASTA support',
      ),
      AuthenticationGateKind.blocked: AuthenticationGatePresentation(
        label: 'Account blocked',
        message: 'This account is blocked. Contact FEASTA support for help.',
        recoveryAction: 'Contact FEASTA support',
      ),
      AuthenticationGateKind.deactivated: AuthenticationGatePresentation(
        label: 'Account deactivated',
        message:
            'This account is deactivated. Contact FEASTA support if you want '
            'to restore access.',
        recoveryAction: 'Contact FEASTA support',
      ),
      AuthenticationGateKind.emailVerificationRequired:
          AuthenticationGatePresentation(
            label: 'Email verification required',
            message: 'Verify your email address to continue.',
            recoveryAction: 'Check or resend verification',
          ),
      AuthenticationGateKind.customerReady: AuthenticationGatePresentation(
        label: 'Customer account ready',
        message: 'Your customer account is ready.',
      ),
      AuthenticationGateKind.customerPhoneVerificationRequired:
          AuthenticationGatePresentation(
            label: 'Phone verification required',
            message: 'Verify your phone number before submitting a booking.',
            recoveryAction: 'Verify phone number',
          ),
      AuthenticationGateKind.providerBusinessSetupRequired:
          AuthenticationGatePresentation(
            label: 'Business setup required',
            message: 'Complete your provider business setup to continue.',
            recoveryAction: 'Continue business setup',
          ),
      AuthenticationGateKind
          .providerVerificationDraft: AuthenticationGatePresentation(
        label: 'Verification draft',
        message: 'Complete and submit your provider verification documents.',
        recoveryAction: 'Continue verification',
      ),
      AuthenticationGateKind.providerVerificationSubmitted:
          AuthenticationGatePresentation(
            label: 'Verification submitted',
            message: 'Your provider verification is waiting for FEASTA review.',
            recoveryAction: 'View verification status',
          ),
      AuthenticationGateKind.providerUnderReview:
          AuthenticationGatePresentation(
            label: 'Verification under review',
            message: 'A FEASTA administrator is reviewing your submission.',
            recoveryAction: 'View verification status',
          ),
      AuthenticationGateKind.providerResubmissionRequired:
          AuthenticationGatePresentation(
            label: 'Resubmission required',
            message: 'FEASTA requested changes to your verification documents.',
            recoveryAction: 'Update verification documents',
          ),
      AuthenticationGateKind.providerRejected: AuthenticationGatePresentation(
        label: 'Provider application rejected',
        message: 'This provider profile was not approved.',
        recoveryAction: 'Review FEASTA feedback',
      ),
      AuthenticationGateKind.providerSuspended: AuthenticationGatePresentation(
        label: 'Provider account suspended',
        message: 'Provider business operations are currently disabled.',
        recoveryAction: 'Contact FEASTA support',
      ),
      AuthenticationGateKind.providerApproved: AuthenticationGatePresentation(
        label: 'Provider approved',
        message: 'Your provider account is approved.',
      ),
      AuthenticationGateKind.adminReady: AuthenticationGatePresentation(
        label: 'Admin account ready',
        message: 'Your administrator account is ready.',
      ),
      AuthenticationGateKind.forbiddenRole: AuthenticationGatePresentation(
        label: 'Account not supported',
        message: 'This account cannot use the selected FEASTA app or portal.',
        recoveryAction: 'Use the correct FEASTA app or portal',
      ),
      AuthenticationGateKind.sessionExpired: AuthenticationGatePresentation(
        label: 'Session ended',
        message: 'Your session ended. Sign in again to continue.',
        recoveryAction: 'Sign in again',
      ),
      AuthenticationGateKind.configurationError: AuthenticationGatePresentation(
        label: 'Configuration error',
        message: 'FEASTA could not start securely. Please try again later.',
        recoveryAction: 'Retry',
      ),
      AuthenticationGateKind.invalidAccountState:
          AuthenticationGatePresentation(
            label: 'Account unavailable',
            message:
                'This account is in an unsupported state. Contact FEASTA '
                'support.',
            recoveryAction: 'Contact FEASTA support',
          ),
    };

AuthenticationGatePresentation authenticationGatePresentation(
  AuthenticationGateKind kind,
) {
  return authenticationGatePresentations[kind]!;
}
