import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:feasta/features/customer/account/data/firebase_customer_account_repository.dart';
import 'package:feasta/features/customer/account/domain/customer_account_management.dart';
import 'package:feasta/features/customer/account/data/password_recovery_store.dart';
import 'package:feasta/core/security/auth_operation_coordinator.dart';
import 'package:feasta/core/security/customer_session_coordinator.dart';
import 'package:flutter_test/flutter_test.dart';
import '../../helpers/password_recovery_preferences.dart';

void main() {
  late List<String> events;
  late PasswordAuth auth;
  late PasswordUser original;
  late PasswordFunctions functions;
  late FirebaseCustomerAccountRepository repository;
  void Function()? googleHook;
  late MemoryRecoveryStore recoveryStore;

  setUp(() {
    events = [];
    original = PasswordUser('customer-a', events);
    auth = PasswordAuth(original, events);
    original.nativeAuth = auth;
    functions = PasswordFunctions(auth, events);
    googleHook = null;
    recoveryStore = MemoryRecoveryStore();
    repository = FirebaseCustomerAccountRepository(
      auth: auth,
      functions: functions,
      recoveryStore: recoveryStore,
      signOutGoogle: () async {
        events.add('google-signout');
        googleHook?.call();
      },
    );
  });

  Future<void> change() => repository.changePassword(
    currentPassword: 'old-test-password',
    newPassword: 'new-test-password',
  );
  for (final resume in [false, true]) {
    test(
      'password ${resume ? 'recovery' : 'change'} invalidates before blocked queue without changing recovery epoch',
      () async {
        if (resume) {
          recoveryStore.records['customer-a'] = const PasswordRecoveryState(
            'customer-a',
            PasswordRecoveryStage.updateConfirmed,
          );
        }
        final blocked = Completer<void>();
        final queue = AuthOperationCoordinator.shared;
        final occupied = queue.run(() => blocked.future);
        final before = CustomerSessionCoordinator.shared.readSnapshot();
        final epoch = queue.epoch;
        final pending = resume
            ? repository.resumePasswordCleanup(
                currentPassword: 'current-password',
              )
            : change();
        expect(
          CustomerSessionCoordinator.shared.readSnapshot().generation,
          greaterThan(before.generation),
        );
        expect(queue.epoch, epoch);
        expect(events, isEmpty);
        blocked.complete();
        await occupied;
        await pending;
        expect(queue.epoch, epoch);
        expect(recoveryStore.records, isEmpty);
        expect(original.passwordUpdates, resume ? 0 : 1);
      },
    );
  }
  Matcher failure(CustomerAccountFailureKind kind) => throwsA(
    isA<CustomerAccountException>().having((e) => e.kind, 'kind', kind),
  );
  Matcher partial({
    required bool revoked,
    required bool signedOut,
    bool switched = false,
  }) => throwsA(
    isA<CustomerPasswordChangeException>()
        .having((e) => e.sessionsRevoked, 'revoked', revoked)
        .having((e) => e.signedOut, 'signedOut', signedOut)
        .having((e) => e.accountChanged, 'accountChanged', switched),
  );

  test(
    'reauthenticate, refresh, update, refresh, revoke, logout in order',
    () async {
      await change();
      expect(events, [
        'reauth:customer-a',
        'token:customer-a',
        'update:customer-a',
        'token:customer-a',
        'revoke:customer-a',
        'google-signout',
        'signout:customer-a',
      ]);
      expect(original.passwordUpdates, 1);
      expect(original.credentials.single, isA<EmailAuthCredential>());
      expect(original.newPassword, 'new-test-password');
      expect(functions.payloads, [{}]);
      expect(auth.currentUser, isNull);
    },
  );

  for (final entry in {
    'wrong-password': CustomerAccountFailureKind.invalidCredential,
    'invalid-credential': CustomerAccountFailureKind.invalidCredential,
    'requires-recent-login': CustomerAccountFailureKind.recentLoginRequired,
    'user-token-expired': CustomerAccountFailureKind.sessionExpired,
    'invalid-user-token': CustomerAccountFailureKind.sessionExpired,
    'id-token-revoked': CustomerAccountFailureKind.sessionExpired,
  }.entries) {
    test(
      'reauthentication ${entry.key} stops before password update',
      () async {
        original.reauthError = FirebaseAuthException(code: entry.key);
        await expectLater(change(), failure(entry.value));
        expect(original.passwordUpdates, 0);
        expect(functions.targets, isEmpty);
        expect(auth.currentUser, same(original));
      },
    );
  }

  test(
    'Google-only accounts and absent sessions fail without mutations',
    () async {
      original.passwordProvider = false;
      await expectLater(
        change(),
        failure(CustomerAccountFailureKind.passwordProviderRequired),
      );
      auth.user = null;
      await expectLater(
        change(),
        failure(CustomerAccountFailureKind.sessionExpired),
      );
      expect(events, isEmpty);
    },
  );

  test('weak new password does not revoke or sign out', () async {
    original.updateError = FirebaseAuthException(code: 'weak-password');
    await expectLater(
      change(),
      failure(CustomerAccountFailureKind.weakPassword),
    );
    expect(functions.targets, isEmpty);
    expect(auth.currentUser, same(original));
  });

  for (final stage in ['reauth', 'token1']) {
    test('switch during $stage prevents password update', () async {
      final other = PasswordUser('customer-b', events);
      original.hooks[stage] = () => auth.user = other;
      await expectLater(
        change(),
        failure(CustomerAccountFailureKind.sessionExpired),
      );
      expect(original.passwordUpdates, 0);
      expect(functions.targets, isEmpty);
      expect(auth.currentUser, same(other));
    });
  }

  for (final stage in ['update', 'token2']) {
    test(
      'switch during $stage reports partial change and never revokes B',
      () async {
        final other = PasswordUser('customer-b', events);
        original.hooks[stage] = () => auth.user = other;
        await expectLater(
          change(),
          partial(revoked: false, signedOut: false, switched: true),
        );
        expect(original.passwordUpdates, 1);
        expect(functions.targets, isEmpty);
        expect(auth.currentUser, same(other));
        expect(events, isNot(contains('signout:customer-b')));
      },
    );
  }

  test('switch during revocation never signs out or revokes B', () async {
    final other = PasswordUser('customer-b', events);
    functions.onRevoke = () => auth.user = other;
    await expectLater(
      change(),
      partial(revoked: true, signedOut: false, switched: true),
    );
    expect(functions.targets, ['customer-a']);
    expect(auth.currentUser, same(other));
    expect(events, isNot(contains('signout:customer-b')));
  });

  test('signout during successful revocation is a completed outcome', () async {
    functions.onRevoke = () => auth.user = null;
    await change();
    expect(functions.targets, ['customer-a']);
    expect(auth.currentUser, isNull);
    expect(original.passwordUpdates, 1);
  });

  test('switch during Google cleanup prevents Firebase logout of B', () async {
    final other = PasswordUser('customer-b', events);
    googleHook = () => auth.user = other;
    await expectLater(
      change(),
      partial(revoked: true, signedOut: false, switched: true),
    );
    expect(auth.currentUser, same(other));
    expect(events, isNot(contains('signout:customer-b')));
  });

  for (final stage in ['update', 'token2']) {
    test('signout during $stage stops revocation', () async {
      original.hooks[stage] = () => auth.user = null;
      await expectLater(change(), partial(revoked: false, signedOut: true));
      expect(functions.targets, isEmpty);
    });
  }

  for (final code in [
    'unauthenticated',
    'permission-denied',
    'resource-exhausted',
    'unavailable',
    'deadline-exceeded',
    'failed-precondition',
  ]) {
    test(
      'revocation $code reports partial success and signs out locally',
      () async {
        functions.error = FirebaseFunctionsException(
          code: code,
          message: 'Private detail must not be displayed',
        );
        await expectLater(change(), partial(revoked: false, signedOut: true));
        expect(auth.currentUser, isNull);
        expect(original.passwordUpdates, 1);
        expect(functions.targets, ['customer-a']);
      },
    );
  }

  test(
    'malformed revocation response never counts as complete success',
    () async {
      functions.response = {'success': false};
      await expectLater(change(), partial(revoked: false, signedOut: true));
    },
  );

  test(
    'post-update token failure signs out and reports partial success',
    () async {
      original.failTokenAt = 2;
      await expectLater(change(), partial(revoked: false, signedOut: true));
      expect(functions.targets, isEmpty);
    },
  );

  test(
    'logout failure retries only logout, never old-password reauth or update',
    () async {
      auth.signOutError = StateError('Fake logout failure');
      await expectLater(change(), partial(revoked: true, signedOut: false));
      auth.signOutError = null;
      await change();
      expect(original.passwordUpdates, 1);
      expect(original.credentials.length, 1);
      expect(functions.targets, ['customer-a']);
      expect(auth.currentUser, isNull);
    },
  );

  test(
    'revocation and logout failure retries cleanup without repeating update',
    () async {
      functions.error = FirebaseFunctionsException(
        code: 'unavailable',
        message: 'Fake',
      );
      auth.signOutError = StateError('Fake logout failure');
      await expectLater(change(), partial(revoked: false, signedOut: false));
      functions.error = null;
      auth.signOutError = null;
      await change();
      expect(original.passwordUpdates, 1);
      expect(original.credentials.length, 1);
      expect(functions.targets, ['customer-a', 'customer-a']);
    },
  );

  test('duplicate repository submissions cannot overlap', () async {
    final barrier = Completer<void>();
    original.updateBarrier = barrier.future;
    final first = change();
    await expectLater(
      change(),
      failure(CustomerAccountFailureKind.rateLimited),
    );
    barrier.complete();
    await first;
    expect(original.passwordUpdates, 1);
    expect(functions.targets.length, 1);
  });

  test(
    'queued account switch cannot change the native password target',
    () async {
      final barrier = Completer<void>();
      original.updateBarrier = barrier.future;
      original.updateStarted = Completer<void>();
      final first = change();
      await original.updateStarted!.future;
      final other = PasswordUser('customer-b', events);
      final switchAccount = AuthOperationCoordinator.shared.run(() async {
        auth.user = other;
      });
      await Future<void>.delayed(Duration.zero);
      expect(auth.currentUser, same(original));
      barrier.complete();
      await first;
      await switchAccount;
      expect(original.passwordUpdates, 1);
      expect(other.passwordUpdates, 0);
      expect(functions.targets, ['customer-a']);
      expect(auth.currentUser, same(other));
    },
  );

  test(
    'queued login and logout cannot overlap native revocation target selection',
    () async {
      final barrier = Completer<void>();
      functions.dispatchBarrier = barrier.future;
      functions.dispatchStarted = Completer<void>();
      final first = change();
      await functions.dispatchStarted!.future;
      final other = PasswordUser('customer-b', events);
      final oldUid = auth.currentUser!.uid;
      final logout = AuthOperationCoordinator.shared.run(() async {
        if (auth.currentUser?.uid == oldUid) await auth.signOut();
      });
      final login = AuthOperationCoordinator.shared.run(() async {
        auth.user = other;
      });
      barrier.complete();
      await first;
      await logout;
      await login;
      expect(functions.targets, ['customer-a']);
      expect(events, isNot(contains('signout:customer-b')));
      expect(auth.currentUser, same(other));
    },
  );

  test(
    'native update followed by reload error remains uncertain without blind retry',
    () async {
      original.reloadAfterUpdateError = FirebaseAuthException(
        code: 'network-request-failed',
      );
      await expectLater(
        change(),
        throwsA(
          isA<CustomerPasswordChangeException>().having(
            (e) => e.updateOutcomeUncertain,
            'uncertain',
            true,
          ),
        ),
      );
      expect(original.passwordUpdates, 1);
      expect(auth.currentUser, isNull);
      expect(
        recoveryStore.records['customer-a']?.stage,
        PasswordRecoveryStage.uncertainRevocationConfirmed,
      );
      auth.user = original;
      final newRepository = FirebaseCustomerAccountRepository(
        auth: auth,
        functions: functions,
        recoveryStore: recoveryStore,
        signOutGoogle: () async {},
      );
      final credentialsBeforeRetry = original.credentials.length;
      await expectLater(
        newRepository.changePassword(
          currentPassword: 'old-test-password',
          newPassword: 'new-test-password',
        ),
        throwsA(
          isA<CustomerPasswordChangeException>().having(
            (e) => e.requiresReauthentication,
            'requires fresh auth',
            true,
          ),
        ),
      );
      expect(original.credentials.length, credentialsBeforeRetry);
      expect(original.passwordUpdates, 1);
      await newRepository.resumePasswordCleanup(
        currentPassword: 'current-working-password',
      );
      expect(original.passwordUpdates, 1);
      expect(recoveryStore.records, isEmpty);
    },
  );

  test(
    'ambiguous native dispatch error is preserved and never retried as an update',
    () async {
      original.updateError = FirebaseAuthException(
        code: 'network-request-failed',
      );
      await expectLater(
        change(),
        throwsA(
          isA<CustomerPasswordChangeException>().having(
            (e) => e.updateOutcomeUncertain,
            'uncertain',
            true,
          ),
        ),
      );
      expect(recoveryStore.records.containsKey('customer-a'), isTrue);
      expect(original.passwordUpdates, 0);
    },
  );

  test(
    'recreated repository restores confirmed pending cleanup and requires fresh auth',
    () async {
      functions.error = FirebaseFunctionsException(
        code: 'unavailable',
        message: 'Fake',
      );
      await expectLater(change(), partial(revoked: false, signedOut: true));
      auth.user = original;
      final restored = FirebaseCustomerAccountRepository(
        auth: auth,
        functions: functions,
        recoveryStore: recoveryStore,
        signOutGoogle: () async {},
      );
      final issue = await restored.loadPasswordRecovery();
      expect(issue?.updateOutcomeUncertain, isFalse);
      expect(issue?.requiresReauthentication, isTrue);
      await expectLater(
        restored.resumePasswordCleanup(),
        throwsA(isA<CustomerPasswordChangeException>()),
      );
      functions.error = null;
      await restored.resumePasswordCleanup(
        currentPassword: 'current-working-password',
      );
      expect(original.passwordUpdates, 1);
      expect(recoveryStore.records, isEmpty);
    },
  );

  test(
    'persisted revocation stage does not skip backend confirmation after recreation',
    () async {
      auth.signOutError = StateError('Fake logout failure');
      await expectLater(change(), partial(revoked: true, signedOut: false));
      expect(
        recoveryStore.records['customer-a']?.stage,
        PasswordRecoveryStage.revocationConfirmed,
      );
      final restored = FirebaseCustomerAccountRepository(
        auth: auth,
        functions: functions,
        recoveryStore: recoveryStore,
        signOutGoogle: () async {},
      );
      expect((await restored.loadPasswordRecovery())?.sessionsRevoked, isFalse);
      auth.signOutError = null;
      await restored.resumePasswordCleanup(
        currentPassword: 'current-working-password',
      );
      expect(functions.targets, ['customer-a', 'customer-a']);
      expect(original.passwordUpdates, 1);
    },
  );

  test(
    'different UID never resumes or clears the original account recovery',
    () async {
      recoveryStore.records['customer-a'] = const PasswordRecoveryState(
        'customer-a',
        PasswordRecoveryStage.updateDispatched,
      );
      auth.user = PasswordUser('customer-b', events);
      expect(await repository.loadPasswordRecovery(), isNull);
      await expectLater(
        repository.resumePasswordCleanup(currentPassword: 'test'),
        failure(CustomerAccountFailureKind.configuration),
      );
      expect(functions.targets, isEmpty);
      expect(recoveryStore.records.containsKey('customer-a'), isTrue);
    },
  );

  test(
    'weak-password rejection clears dispatch marker; successful cleanup clears its record',
    () async {
      original.updateError = FirebaseAuthException(code: 'weak-password');
      await expectLater(
        change(),
        failure(CustomerAccountFailureKind.weakPassword),
      );
      expect(recoveryStore.records, isEmpty);
      original.updateError = null;
      await change();
      expect(recoveryStore.records, isEmpty);
    },
  );

  test('duplicate cleanup requests do not overlap', () async {
    recoveryStore.records['customer-a'] = const PasswordRecoveryState(
      'customer-a',
      PasswordRecoveryStage.updateConfirmed,
    );
    final barrier = Completer<void>();
    functions.dispatchBarrier = barrier.future;
    functions.dispatchStarted = Completer<void>();
    final first = repository.resumePasswordCleanup(
      currentPassword: 'current-working-password',
    );
    await functions.dispatchStarted!.future;
    await expectLater(
      repository.resumePasswordCleanup(
        currentPassword: 'current-working-password',
      ),
      failure(CustomerAccountFailureKind.rateLimited),
    );
    barrier.complete();
    await first;
    expect(original.passwordUpdates, 0);
    expect(functions.targets.length, 1);
  });

  test(
    'simulated app restart retains dispatch marker and never dispatches another update',
    () async {
      final disk = <String, String>{};
      final store = PreferencesPasswordRecoveryStore(
        preferences: MemoryRecoveryPreferences(disk),
      );
      repository = FirebaseCustomerAccountRepository(
        auth: auth,
        functions: functions,
        recoveryStore: store,
        signOutGoogle: () async {},
      );
      final barrier = Completer<void>();
      original.updateBarrier = barrier.future;
      original.updateStarted = Completer<void>();
      final first = change();
      await original.updateStarted!.future;
      expect(
        (await store.read('customer-a'))?.stage,
        PasswordRecoveryStage.updateDispatched,
      );
      final crashDisk = Map<String, String>.from(disk);
      original.reloadAfterUpdateError = FirebaseAuthException(
        code: 'network-request-failed',
      );
      barrier.complete();
      await expectLater(first, throwsA(isA<CustomerPasswordChangeException>()));
      auth.user = original;
      final restartedStore = PreferencesPasswordRecoveryStore(
        preferences: MemoryRecoveryPreferences(crashDisk),
      );
      final restarted = FirebaseCustomerAccountRepository(
        auth: auth,
        functions: functions,
        recoveryStore: restartedStore,
        signOutGoogle: () async {},
      );
      expect(
        (await restarted.loadPasswordRecovery())?.updateOutcomeUncertain,
        isTrue,
      );
      await expectLater(
        restarted.changePassword(
          currentPassword: 'old-test-password',
          newPassword: 'new-test-password',
        ),
        throwsA(isA<CustomerPasswordChangeException>()),
      );
      expect(original.passwordUpdates, 1);
      await restarted.resumePasswordCleanup(
        currentPassword: 'current-working-password',
      );
      expect(crashDisk, isEmpty);
    },
  );

  test(
    'persistence failure before dispatch prevents native password update',
    () async {
      final preferences = MemoryRecoveryPreferences({}, failWrites: true);
      repository = FirebaseCustomerAccountRepository(
        auth: auth,
        functions: functions,
        recoveryStore: PreferencesPasswordRecoveryStore(
          preferences: preferences,
        ),
        signOutGoogle: () async {},
      );
      await expectLater(change(), throwsStateError);
      expect(original.passwordUpdates, 0);
      expect(functions.targets, isEmpty);
    },
  );

  test(
    'later authentication transition invalidates live cleanup confirmation',
    () async {
      auth.signOutError = StateError('Fake logout failure');
      await expectLater(change(), partial(revoked: true, signedOut: false));
      await AuthOperationCoordinator.shared.transition(() async {});
      final credentialsBeforeRetry = original.credentials.length;
      await expectLater(
        change(),
        throwsA(
          isA<CustomerPasswordChangeException>().having(
            (e) => e.requiresReauthentication,
            'fresh authentication',
            true,
          ),
        ),
      );
      expect(original.credentials.length, credentialsBeforeRetry);
      expect(original.passwordUpdates, 1);
      auth.signOutError = null;
      await repository.resumePasswordCleanup(
        currentPassword: 'current-working-password',
      );
      expect(functions.targets, ['customer-a', 'customer-a']);
    },
  );

  test(
    'queued login waits for native logout to select its original target',
    () async {
      final barrier = Completer<void>();
      auth.signOutBarrier = barrier.future;
      auth.signOutStarted = Completer<void>();
      final first = change();
      await auth.signOutStarted!.future;
      final other = PasswordUser('customer-b', events);
      final login = AuthOperationCoordinator.shared.transition(() async {
        auth.user = other;
      });
      await Future<void>.delayed(Duration.zero);
      expect(auth.currentUser, same(original));
      barrier.complete();
      await first;
      await login;
      expect(events, contains('signout:customer-a'));
      expect(events, isNot(contains('signout:customer-b')));
      expect(auth.currentUser, same(other));
    },
  );

  test(
    'failure clearing a completed recovery record reports an accurate outcome',
    () async {
      recoveryStore.failClears = true;
      await expectLater(change(), partial(revoked: true, signedOut: true));
      expect(recoveryStore.records.containsKey('customer-a'), isTrue);
      expect(
        const CustomerPasswordChangeException(
          sessionsRevoked: true,
          signedOut: true,
        ).friendlyMessage,
        contains('session cleanup completed'),
      );
      expect(auth.currentUser, isNull);
      auth.user = original;
      recoveryStore.failClears = false;
      await repository.resumePasswordCleanup(
        currentPassword: 'current-working-password',
      );
      expect(original.passwordUpdates, 1);
      expect(recoveryStore.records, isEmpty);
    },
  );

  test(
    'Google logout failure still permits authoritative Firebase logout',
    () async {
      googleHook = () => throw StateError('No Google session');
      await change();
      expect(auth.currentUser, isNull);
    },
  );
}

class MemoryRecoveryStore implements PasswordRecoveryStore {
  final Map<String, PasswordRecoveryState> records = {};
  bool failClears = false;
  @override
  Future<PasswordRecoveryState?> read(String uid) async => records[uid];
  @override
  Future<void> write(PasswordRecoveryState state) async {
    records[state.uid] = state;
  }

  @override
  Future<void> clear(String uid) async {
    if (failClears) throw StateError('Fake storage unavailable');
    records.remove(uid);
  }
}

class PasswordUser implements User {
  PasswordUser(this.uid, this.events);
  @override
  final String uid;
  final List<String> events;
  bool passwordProvider = true;
  Object? reauthError;
  Object? updateError;
  Object? reloadAfterUpdateError;
  PasswordAuth? nativeAuth;
  Completer<void>? updateStarted;
  Future<void>? updateBarrier;
  int? failTokenAt;
  int tokenCalls = 0;
  int passwordUpdates = 0;
  String? newPassword;
  final List<AuthCredential> credentials = [];
  final Map<String, void Function()> hooks = {};
  @override
  String get email => 'customer@example.test';
  @override
  List<UserInfo> get providerData =>
      passwordProvider ? [PasswordProvider()] : [];
  @override
  Future<UserCredential> reauthenticateWithCredential(
    AuthCredential credential,
  ) async {
    events.add('reauth:$uid');
    credentials.add(credential);
    if (reauthError != null) throw reauthError!;
    hooks['reauth']?.call();
    return PasswordCredential();
  }

  @override
  Future<String?> getIdToken([bool forceRefresh = false]) async {
    expect(forceRefresh, isTrue);
    tokenCalls++;
    events.add('token:$uid');
    if (failTokenAt == tokenCalls) {
      throw FirebaseAuthException(code: 'user-token-expired');
    }
    hooks['token$tokenCalls']?.call();
    return 'fake-token';
  }

  @override
  Future<void> updatePassword(String password) async {
    updateStarted?.complete();
    if (updateBarrier != null) await updateBarrier;
    final target = nativeAuth?.currentUser as PasswordUser? ?? this;
    events.add('update:${target.uid}');
    if (updateError != null) throw updateError!;
    target.passwordUpdates++;
    target.newPassword = password;
    hooks['update']?.call();
    if (reloadAfterUpdateError != null) throw reloadAfterUpdateError!;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class PasswordAuth implements FirebaseAuth {
  PasswordAuth(this.user, this.events);
  User? user;
  final List<String> events;
  Object? signOutError;
  Future<void>? signOutBarrier;
  Completer<void>? signOutStarted;
  @override
  User? get currentUser => user;
  @override
  Future<void> signOut() async {
    if (signOutStarted != null && !signOutStarted!.isCompleted) {
      signOutStarted!.complete();
    }
    if (signOutBarrier != null) await signOutBarrier;
    events.add('signout:${user?.uid}');
    if (signOutError != null) throw signOutError!;
    user = null;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class PasswordFunctions implements FirebaseFunctions {
  PasswordFunctions(this.auth, this.events);
  final PasswordAuth auth;
  final List<String> events;
  final List<String?> targets = [];
  final List<dynamic> payloads = [];
  Object? error;
  dynamic response = {'success': true};
  void Function()? onRevoke;
  Future<void>? dispatchBarrier;
  Completer<void>? dispatchStarted;
  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) {
    expect(name, 'revokeAllAccountSessions');
    return PasswordCallable(this);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class PasswordCallable implements HttpsCallable {
  PasswordCallable(this.functions);
  final PasswordFunctions functions;
  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    functions.dispatchStarted?.complete();
    if (functions.dispatchBarrier != null) await functions.dispatchBarrier;
    functions.events.add('revoke:${functions.auth.currentUser?.uid}');
    functions.targets.add(functions.auth.currentUser?.uid);
    functions.payloads.add(parameters);
    functions.onRevoke?.call();
    if (functions.error != null) throw functions.error!;
    return PasswordResult<T>(functions.response as T);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class PasswordResult<T> implements HttpsCallableResult<T> {
  PasswordResult(this.data);
  @override
  final T data;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class PasswordProvider implements UserInfo {
  @override
  String get providerId => 'password';
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class PasswordCredential implements UserCredential {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
