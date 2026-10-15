import 'package:feasta/features/authentication/domain/auth_account_presentation.dart';
import 'package:feasta/features/authentication/domain/auth_account_state.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('every account gate has canonical user-facing terminology', () {
    for (final kind in AuthenticationGateKind.values) {
      final presentation = authenticationGatePresentation(kind);
      expect(presentation.label.trim(), isNotEmpty, reason: kind.name);
      expect(presentation.message.trim(), isNotEmpty, reason: kind.name);
    }
  });

  test('critical recovery messages align with the shared web terminology', () {
    expect(
      authenticationGatePresentation(AuthenticationGateKind.blocked).message,
      'This account is blocked. Contact FEASTA support for help.',
    );
    expect(
      authenticationGatePresentation(
        AuthenticationGateKind.customerPhoneVerificationRequired,
      ).message,
      'Verify your phone number before submitting a booking.',
    );
    expect(
      authenticationGatePresentation(
        AuthenticationGateKind.providerResubmissionRequired,
      ).label,
      'Resubmission required',
    );
    expect(
      authenticationGatePresentation(
        AuthenticationGateKind.sessionExpired,
      ).message,
      'Your session ended. Sign in again to continue.',
    );
  });
}
