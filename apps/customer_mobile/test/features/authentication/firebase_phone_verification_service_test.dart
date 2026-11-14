import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:feasta/features/authentication/data/services/firebase_phone_verification_service.dart';
import 'package:feasta/features/authentication/domain/phone_verification.dart';
import 'package:feasta/features/authentication/application/phone_verification_controller.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late TestAuth auth;
  late TestFunctions functions;
  late FirebasePhoneVerificationService service;
  late List<String> events;
  late String? registeredPhone;

  setUp(() {
    events = [];
    registeredPhone = '09171234567';
    auth = TestAuth(events);
    functions = TestFunctions(events);
    service = FirebasePhoneVerificationService(
      auth: auth,
      functions: functions,
      loadRegisteredPhone: (uid) async {
        expect(uid, 'customer');
        events.add('profile');
        return registeredPhone;
      },
    );
  });

  Future<void> request({String phone = '09171234567', int? resendToken}) =>
      service.requestCode(
        phoneNumber: phone,
        resendToken: resendToken,
        onCodeSent: (id, token) {
          expect(id, 'verification');
          expect(token, 42);
          events.add('codeSent');
        },
        onVerified: () async {
          events.add('verified');
        },
        onFailure: (error) =>
            fail('Unexpected callback failure: ${error.kind}'),
        onTimeout: (_) {},
      );

  Matcher failure(PhoneVerificationFailureKind kind) => throwsA(
    isA<PhoneVerificationException>().having((e) => e.kind, 'kind', kind),
  );

  test(
    'registered number is prepared before SMS with an empty payload',
    () async {
      await request();
      expect(functions.payloads, [{}]);
      expect(events, [
        'profile',
        'prepareCustomerPhoneVerification',
        'sms',
        'codeSent',
      ]);
      expect(auth.sentPhone, '+639171234567');
    },
  );

  test('replacement sends only the normalized phoneNumber field', () async {
    functions.response = {'phoneNumber': '+639181234567'};
    await request(phone: '0918 123 4567');
    expect(functions.payloads, [
      {'phoneNumber': '+639181234567'},
    ]);
    expect(auth.sentPhone, '+639181234567');
  });

  test(
    'missing registered number permits a server-validated replacement',
    () async {
      registeredPhone = null;
      await request();
      expect(functions.payloads, [
        {'phoneNumber': '+639171234567'},
      ]);
    },
  );

  test(
    'resend repeats preparation and preserves the native resend token',
    () async {
      await request();
      await request(resendToken: 42);
      expect(functions.payloads, [{}, {}]);
      expect(auth.resendToken, 42);
      expect(auth.smsCalls, 2);
    },
  );

  for (final entry in {
    'invalid-argument': PhoneVerificationFailureKind.invalidPhone,
    'already-exists': PhoneVerificationFailureKind.phoneAlreadyInUse,
    'permission-denied': PhoneVerificationFailureKind.blocked,
    'resource-exhausted': PhoneVerificationFailureKind.tooManyRequests,
    'failed-precondition': PhoneVerificationFailureKind.configuration,
    'unauthenticated': PhoneVerificationFailureKind.configuration,
    'unavailable': PhoneVerificationFailureKind.network,
    'not-found': PhoneVerificationFailureKind.unknown,
  }.entries) {
    test('${entry.key} preparation rejection prevents SMS', () async {
      functions.error = FirebaseFunctionsException(
        code: entry.key,
        message: 'Rejected',
      );
      await expectLater(request(), failure(entry.value));
      expect(auth.smsCalls, 0);
    });
  }

  test('malformed or mismatched preparation response prevents SMS', () async {
    for (final response in [
      null,
      {},
      {'phoneNumber': 12},
      {'phoneNumber': 'bad'},
      {'phoneNumber': '+639181234567'},
    ]) {
      functions.response = response;
      await expectLater(
        request(),
        failure(PhoneVerificationFailureKind.configuration),
      );
    }
    expect(auth.smsCalls, 0);
  });

  test(
    'missing session and invalid input do not call preparation or SMS',
    () async {
      await expectLater(
        request(phone: 'bad'),
        failure(PhoneVerificationFailureKind.invalidPhone),
      );
      auth.user = null;
      await expectLater(
        request(),
        failure(PhoneVerificationFailureKind.sessionExpired),
      );
      expect(events, isEmpty);
    },
  );

  test('account switch during profile lookup prevents preparation', () async {
    service = FirebasePhoneVerificationService(
      auth: auth,
      functions: functions,
      loadRegisteredPhone: (_) async {
        auth.user = TestUser('another-customer');
        return registeredPhone;
      },
    );
    await expectLater(
      request(),
      failure(PhoneVerificationFailureKind.sessionExpired),
    );
    expect(functions.payloads, isEmpty);
    expect(auth.smsCalls, 0);
  });

  test('account switch during preparation prevents SMS', () async {
    functions.onPrepare = () => auth.user = TestUser('another-customer');
    await expectLater(
      request(),
      failure(PhoneVerificationFailureKind.sessionExpired),
    );
    expect(auth.smsCalls, 0);
  });

  test('profile read failure prevents preparation and SMS', () async {
    service = FirebasePhoneVerificationService(
      auth: auth,
      functions: functions,
      loadRegisteredPhone: (_) async => throw FirebaseException(
        plugin: 'cloud_firestore',
        code: 'unavailable',
      ),
    );
    await expectLater(request(), failure(PhoneVerificationFailureKind.network));
    expect(functions.payloads, isEmpty);
    expect(auth.smsCalls, 0);
  });

  test(
    'email prerequisite has an actionable message and prevents SMS',
    () async {
      functions.error = FirebaseFunctionsException(
        code: 'failed-precondition',
        message: 'Verify your email before verifying your mobile number.',
      );
      await expectLater(
        request(),
        failure(PhoneVerificationFailureKind.emailVerificationRequired),
      );
      expect(
        PhoneVerificationController.messageFor(
          PhoneVerificationFailureKind.emailVerificationRequired,
        ),
        'Verify your email before verifying your mobile number.',
      );
      expect(auth.smsCalls, 0);
    },
  );

  for (final message in [
    'The mobile identity relationship is inconsistent. Contact support.',
    'The verified mobile identity is unavailable or inconsistent.',
    'Unknown private diagnostic',
  ]) {
    test('other precondition stays generic: $message', () async {
      functions.error = FirebaseFunctionsException(
        code: 'failed-precondition',
        message: message,
      );
      await expectLater(
        request(),
        failure(PhoneVerificationFailureKind.configuration),
      );
      expect(auth.smsCalls, 0);
    });
  }

  test(
    'automatic completion links, reloads, refreshes, synchronizes, then succeeds',
    () async {
      await request();
      await auth.complete(0);
      expect(events.sublist(4), [
        'link:customer',
        'reload:customer',
        'token:customer',
        'syncPhoneVerification',
        'verified',
      ]);
      expect(functions.syncCalls, 1);
    },
  );

  test(
    'manual completion preserves valid linking and synchronization',
    () async {
      await request();
      await service.confirmCode(
        verificationId: 'verification',
        smsCode: '123456',
      );
      expect(events.sublist(4), [
        'link:customer',
        'reload:customer',
        'token:customer',
        'syncPhoneVerification',
      ]);
      expect(functions.syncCalls, 1);
      await expectLater(
        service.confirmCode(verificationId: 'verification', smsCode: '123456'),
        failure(PhoneVerificationFailureKind.expiredCode),
      );
    },
  );

  test('existing phone provider updates instead of linking', () async {
    (auth.user as TestUser).hasPhoneProvider = true;
    await request();
    await service.confirmCode(
      verificationId: 'verification',
      smsCode: '123456',
    );
    expect(events, contains('update:customer'));
    expect(events, isNot(contains('link:customer')));
    expect(functions.syncCalls, 1);
  });

  for (final signedOut in [false, true]) {
    test(
      'manual completion rejects ${signedOut ? 'signout' : 'account switch'}',
      () async {
        await request();
        auth.user = signedOut ? null : TestUser('another-customer', events);
        await expectLater(
          service.confirmCode(
            verificationId: 'verification',
            smsCode: '123456',
          ),
          failure(PhoneVerificationFailureKind.sessionExpired),
        );
        expect(
          events.where((e) => e.startsWith('link:') || e.startsWith('update:')),
          isEmpty,
        );
        expect(functions.syncCalls, 0);
      },
    );

    test(
      'automatic completion rejects ${signedOut ? 'signout' : 'account switch'}',
      () async {
        final failures = <PhoneVerificationException>[];
        await service.requestCode(
          phoneNumber: '09171234567',
          onCodeSent: (_, _) {},
          onVerified: () async => fail('Unexpected verification'),
          onFailure: failures.add,
          onTimeout: (_) {},
        );
        auth.user = signedOut ? null : TestUser('another-customer', events);
        await auth.complete(0);
        expect(
          failures.single.kind,
          PhoneVerificationFailureKind.sessionExpired,
        );
        expect(
          events.where((e) => e.startsWith('link:') || e.startsWith('update:')),
          isEmpty,
        );
        expect(functions.syncCalls, 0);
      },
    );
  }

  test('resend invalidates older callbacks and verification IDs', () async {
    await request();
    auth.nextVerificationId = 'new-verification';
    await service.requestCode(
      phoneNumber: '09171234567',
      resendToken: 42,
      onCodeSent: (id, _) => expect(id, 'new-verification'),
      onVerified: () async => events.add('new-verified'),
      onFailure: (_) => fail('Stale callback must not fail the new attempt'),
      onTimeout: (_) => fail('Stale timeout'),
    );
    await auth.complete(0);
    auth.codeSentCallbacks[0]('old-late-id', 99);
    auth.timeoutCallbacks[0]('old-late-id');
    auth.failureCallbacks[0](
      FirebaseAuthException(code: 'invalid-phone-number'),
    );
    expect(functions.syncCalls, 0);
    await expectLater(
      service.confirmCode(verificationId: 'verification', smsCode: '123456'),
      failure(PhoneVerificationFailureKind.expiredCode),
    );
    await service.confirmCode(
      verificationId: 'new-verification',
      smsCode: '123456',
    );
    expect(functions.syncCalls, 1);
  });

  for (final stage in ['link', 'reload', 'token']) {
    test(
      'account switch during $stage prevents subsequent synchronization',
      () async {
        final original = auth.user as TestUser;
        original.hooks[stage] = () =>
            auth.user = TestUser('another-customer', events);
        await request();
        await expectLater(
          service.confirmCode(
            verificationId: 'verification',
            smsCode: '123456',
          ),
          failure(PhoneVerificationFailureKind.sessionExpired),
        );
        expect(functions.syncCalls, 0);
        expect(events, isNot(contains('link:another-customer')));
        if (stage == 'link') expect(events, isNot(contains('reload:customer')));
        if (stage == 'reload') {
          expect(events, isNot(contains('token:customer')));
        }
      },
    );
  }

  test(
    'new attempt during linking stops the older attempt before synchronization',
    () async {
      final barrier = Completer<void>();
      final user = auth.user as TestUser;
      user.linkBarrier = barrier.future;
      await request();
      final oldCompletion = service.confirmCode(
        verificationId: 'verification',
        smsCode: '123456',
      );
      final rejectedOldCompletion = expectLater(
        oldCompletion,
        failure(PhoneVerificationFailureKind.expiredCode),
      );
      await request(resendToken: 42);
      barrier.complete();
      await rejectedOldCompletion;
      expect(functions.syncCalls, 0);
      expect(events, isNot(contains('reload:customer')));
      user.linkBarrier = null;
      await auth.complete(1);
      expect(functions.syncCalls, 1);
    },
  );

  test(
    'automatic callback during manual confirmation does not duplicate linking',
    () async {
      final barrier = Completer<void>();
      (auth.user as TestUser).linkBarrier = barrier.future;
      await request();
      final manual = service.confirmCode(
        verificationId: 'verification',
        smsCode: '123456',
      );
      await auth.complete(0);
      expect(events.where((e) => e == 'link:customer').length, 1);
      barrier.complete();
      await manual;
      expect(functions.syncCalls, 1);
    },
  );

  test('invalid OTP can be retried within the same attempt', () async {
    final user = auth.user as TestUser;
    user.linkError = FirebaseAuthException(code: 'invalid-verification-code');
    await request();
    await expectLater(
      service.confirmCode(verificationId: 'verification', smsCode: '000000'),
      failure(PhoneVerificationFailureKind.invalidCode),
    );
    expect(functions.syncCalls, 0);
    user.linkError = null;
    await service.confirmCode(
      verificationId: 'verification',
      smsCode: '123456',
    );
    expect(functions.syncCalls, 1);
  });
}

class TestUser implements User {
  TestUser(this.uid, [List<String>? events]) : events = events ?? [];
  final List<String> events;
  bool hasPhoneProvider = false;
  Object? linkError;
  Future<void>? linkBarrier;
  final Map<String, void Function()> hooks = {};
  @override
  final String uid;
  @override
  List<UserInfo> get providerData =>
      hasPhoneProvider ? [TestPhoneProvider()] : [];
  @override
  Future<UserCredential> linkWithCredential(AuthCredential credential) async {
    events.add('link:$uid');
    if (linkError != null) throw linkError!;
    hooks['link']?.call();
    if (linkBarrier != null) await linkBarrier;
    return TestUserCredential();
  }

  @override
  Future<void> updatePhoneNumber(PhoneAuthCredential credential) async {
    events.add('update:$uid');
    hooks['link']?.call();
  }

  @override
  Future<void> reload() async {
    events.add('reload:$uid');
    hooks['reload']?.call();
  }

  @override
  Future<String?> getIdToken([bool forceRefresh = false]) async {
    expect(forceRefresh, isTrue);
    events.add('token:$uid');
    hooks['token']?.call();
    return 'test-token';
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class TestAuth implements FirebaseAuth {
  TestAuth(this.events) {
    user = TestUser('customer', events);
  }
  final List<String> events;
  User? user;
  String nextVerificationId = 'verification';
  final List<Future<void> Function(PhoneAuthCredential)> completionCallbacks =
      [];
  final List<PhoneCodeSent> codeSentCallbacks = [];
  final List<PhoneCodeAutoRetrievalTimeout> timeoutCallbacks = [];
  final List<PhoneVerificationFailed> failureCallbacks = [];
  Future<void> complete(int index) => completionCallbacks[index](
    PhoneAuthProvider.credential(
      verificationId: 'verification',
      smsCode: '123456',
    ),
  );
  int smsCalls = 0;
  String? sentPhone;
  int? resendToken;
  @override
  User? get currentUser => user;
  @override
  dynamic noSuchMethod(Invocation invocation) {
    if (invocation.memberName == #verifyPhoneNumber) {
      smsCalls++;
      events.add('sms');
      sentPhone = invocation.namedArguments[#phoneNumber] as String?;
      resendToken = invocation.namedArguments[#forceResendingToken] as int?;
      completionCallbacks.add(
        invocation.namedArguments[#verificationCompleted]
            as Future<void> Function(PhoneAuthCredential),
      );
      codeSentCallbacks.add(
        invocation.namedArguments[#codeSent] as PhoneCodeSent,
      );
      timeoutCallbacks.add(
        invocation.namedArguments[#codeAutoRetrievalTimeout]
            as PhoneCodeAutoRetrievalTimeout,
      );
      failureCallbacks.add(
        invocation.namedArguments[#verificationFailed]
            as PhoneVerificationFailed,
      );
      (invocation.namedArguments[#codeSent] as PhoneCodeSent)(
        nextVerificationId,
        42,
      );
      return Future<void>.value();
    }
    return super.noSuchMethod(invocation);
  }
}

class TestFunctions implements FirebaseFunctions {
  TestFunctions(this.events);
  final List<String> events;
  final List<dynamic> payloads = [];
  dynamic response = {'phoneNumber': '+639171234567'};
  Object? error;
  void Function()? onPrepare;
  int syncCalls = 0;
  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) {
    expect(
      name,
      isIn(['prepareCustomerPhoneVerification', 'syncPhoneVerification']),
    );
    events.add(name);
    return TestCallable(this, name);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class TestCallable implements HttpsCallable {
  TestCallable(this.functions, this.name);
  final TestFunctions functions;
  final String name;
  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    if (name == 'syncPhoneVerification') {
      functions.syncCalls++;
      return TestResult<T>(null as T);
    }
    functions.payloads.add(parameters);
    functions.onPrepare?.call();
    if (functions.error != null) throw functions.error!;
    return TestResult<T>(functions.response as T);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class TestPhoneProvider implements UserInfo {
  @override
  String get providerId => PhoneAuthProvider.PROVIDER_ID;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class TestUserCredential implements UserCredential {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class TestResult<T> implements HttpsCallableResult<T> {
  TestResult(this.data);
  @override
  final T data;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
