import 'package:feasta/app/router/customer_route_guard.dart';
import 'package:feasta/features/authentication/domain/auth_account_state.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'unauthenticated users may browse but protected routes require login',
    () {
      expect(
        CustomerRouteGuard.resolve(
          gate: AuthenticationGateKind.unauthenticated,
          requestedLocation: CustomerAppLocations.browse,
        ),
        CustomerAppLocations.browse,
      );
      expect(
        CustomerRouteGuard.resolve(
          gate: AuthenticationGateKind.unauthenticated,
          requestedLocation: CustomerAppLocations.account,
        ),
        CustomerAppLocations.login,
      );
    },
  );

  test('verified and phone-unverified customers retain intended routes', () {
    for (final gate in [
      AuthenticationGateKind.customerReady,
      AuthenticationGateKind.customerPhoneVerificationRequired,
    ]) {
      expect(
        CustomerRouteGuard.resolve(
          gate: gate,
          requestedLocation: CustomerAppLocations.bookings,
        ),
        CustomerAppLocations.bookings,
      );
    }
  });

  test('redirect resolution is stable and does not loop', () {
    final first = CustomerRouteGuard.resolve(
      gate: AuthenticationGateKind.emailVerificationRequired,
      requestedLocation: CustomerAppLocations.account,
    );
    final second = CustomerRouteGuard.resolve(
      gate: AuthenticationGateKind.emailVerificationRequired,
      requestedLocation: first,
    );
    expect(first, CustomerAppLocations.verifyEmail);
    expect(second, first);
  });

  test('external, malformed, and unknown intended routes are rejected', () {
    for (final value in [
      'https://evil.example/account',
      '//evil.example/account',
      '/account?next=https://evil.example',
      r'\account',
      '/account\n/evil',
      '/unknown',
    ]) {
      expect(CustomerRouteGuard.sanitizeIntendedLocation(value), isNull);
    }
  });
}
