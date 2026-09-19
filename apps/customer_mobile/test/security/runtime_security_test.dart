import 'package:feasta/core/security/runtime_security.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('emulator mode is rejected outside debug builds', () {
    expect(
      () => RuntimeSecurity.validateEmulatorMode(
        useEmulators: true,
        isDebugMode: false,
      ),
      throwsStateError,
    );
    expect(
      () => RuntimeSecurity.validateEmulatorMode(
        useEmulators: true,
        isDebugMode: true,
      ),
      returnsNormally,
    );
  });

  test('release builds require the production Firebase project', () {
    expect(
      () => RuntimeSecurity.validateFirebaseProject(
        projectId: 'unexpected-project',
        isReleaseMode: true,
      ),
      throwsStateError,
    );
    expect(
      () => RuntimeSecurity.validateFirebaseProject(
        projectId: RuntimeSecurity.productionProjectId,
        isReleaseMode: true,
      ),
      returnsNormally,
    );
  });

  test('checkout and incoming-link policy rejects hostile URLs', () {
    expect(
      RuntimeSecurity.requireTrustedPayMongoCheckout(
        'https://checkout.paymongo.com/session/test',
      ).host,
      'checkout.paymongo.com',
    );
    for (final value in [
      'http://checkout.paymongo.com/session/test',
      'https://paymongo.com@evil.example/session',
      'https://evil.example/session',
      '//evil.example/session',
    ]) {
      expect(
        () => RuntimeSecurity.requireTrustedPayMongoCheckout(value),
        throwsFormatException,
      );
    }
    expect(
      RuntimeSecurity.isSupportedIncomingLink(
        Uri.parse('https://app.feasta.test/bookings/one'),
        appHost: 'app.feasta.test',
      ),
      isTrue,
    );
    expect(
      RuntimeSecurity.isSupportedIncomingLink(
        Uri.parse('https://evil.example/bookings/one'),
        appHost: 'app.feasta.test',
      ),
      isFalse,
    );
  });
}
