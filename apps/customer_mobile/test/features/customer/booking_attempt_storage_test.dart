import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/booking_attempt_coordinator.dart';
import 'booking_attempt_test.dart' show selection;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    messenger.setMockMethodCallHandler(channel, null);
  });
  test(
    'Android uses isolated authenticated storage and never resets unreadable attempts',
    () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      int writes = 0;
      messenger.setMockMethodCallHandler(channel, (call) async {
        final options = (call.arguments as Map)['options'] as Map;
        expect(options['resetOnError'], 'false');
        expect(options['storageNamespace'], 'feasta_booking_attempts_v1');
        expect(options['storageCipherAlgorithm'], 'AES_GCM_NoPadding');
        if (call.method == 'write') writes++;
        throw PlatformException(code: 'key_unavailable');
      });
      final c = BookingAttemptCoordinator(
        store: const SecureBookingAttemptStore(),
        currentUid: () => 'customer_123',
      );
      await expectLater(
        c.prepare(selection()),
        throwsA(isA<PlatformException>()),
      );
      expect(writes, 0);
    },
  );
  test('unsupported persistence platform fails closed', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.windows;
    final c = BookingAttemptCoordinator(
      store: const SecureBookingAttemptStore(),
      currentUid: () => 'customer_123',
    );
    await expectLater(c.prepare(selection()), throwsUnsupportedError);
  });
}
