// SDK types are mocked only in isolated tests.
// ignore_for_file: subtype_of_sealed_class

import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:feasta/features/authentication/application/customer_auth_controller.dart';
import 'package:feasta/features/authentication/data/repositories/customer_auth_state_repository.dart';
import 'package:feasta/features/authentication/domain/auth_account_state.dart';
import 'package:flutter_test/flutter_test.dart';

const identity = CustomerAuthIdentity(
  uid: 'one',
  email: null,
  emailVerified: true,
);
const profile = <String, dynamic>{
  'role': 'customer',
  'accountStatus': 'active',
  'isActive': true,
  'isBlocked': false,
  'isPhoneVerified': false,
};

class TestAuth extends Fake implements FirebaseAuth {
  User? user = TestUser();
  StreamController<User?>? events;
  int signOutCalls = 0;
  @override
  User? get currentUser => user;
  @override
  Stream<User?> authStateChanges() => events?.stream ?? Stream.value(user);
  @override
  Stream<User?> idTokenChanges() => Stream.value(user);
  @override
  Future<void> signOut() async {
    signOutCalls++;
    user = null;
  }
}

class TestUser extends Fake implements User {
  TestUser({this.id = 'one', this.failure});
  final String id;
  final String? failure;
  @override
  String get uid => id;
  @override
  String? get email => null;
  @override
  bool get emailVerified => true;
  @override
  Future<void> reload() async {
    if (failure != null) throw FirebaseAuthException(code: failure!);
  }

  @override
  Future<String?> getIdToken([bool forceRefresh = false]) async => 'test';
}

class TestStore extends Fake implements FirebaseFirestore {
  Map<String, Map<String, dynamic>> documents = {};
  final reads = <String>[];
  String? failure;
  @override
  CollectionReference<Map<String, dynamic>> collection(String path) =>
      TestCollection(this, path);
}

class TestCollection extends Fake
    implements CollectionReference<Map<String, dynamic>> {
  TestCollection(this.store, this.path);
  final TestStore store;
  @override
  final String path;
  @override
  DocumentReference<Map<String, dynamic>> doc([String? id]) =>
      TestDocument(store, '$path/$id');
}

class TestDocument extends Fake
    implements DocumentReference<Map<String, dynamic>> {
  TestDocument(this.store, this.path);
  final TestStore store;
  @override
  final String path;
  @override
  Stream<DocumentSnapshot<Map<String, dynamic>>> snapshots({
    bool includeMetadataChanges = false,
    ListenSource source = ListenSource.defaultSource,
  }) => const Stream.empty();
  @override
  Future<DocumentSnapshot<Map<String, dynamic>>> get([
    GetOptions? options,
  ]) async {
    store.reads.add(path);
    if (store.failure != null) {
      throw FirebaseException(plugin: 'cloud_firestore', code: store.failure!);
    }
    return TestSnapshot(store.documents[path]);
  }
}

class TestSnapshot extends Fake
    implements DocumentSnapshot<Map<String, dynamic>> {
  TestSnapshot(this.value);
  final Map<String, dynamic>? value;
  @override
  bool get exists => value != null;
  @override
  Map<String, dynamic>? data() => value;
}

void main() {
  for (final entry in [
    (
      'failed-precondition',
      'policy-version-outdated',
      CustomerAuthLoadFailureKind.policyVersionOutdated,
    ),
    (
      'failed-precondition',
      'consent-required',
      CustomerAuthLoadFailureKind.consentRequired,
    ),
    (
      'failed-precondition',
      'policy-unavailable',
      CustomerAuthLoadFailureKind.policyUnavailable,
    ),
    (
      'invalid-argument',
      'invalid-policy-version',
      CustomerAuthLoadFailureKind.invalidPolicyVersion,
    ),
    (
      'failed-precondition',
      'invalid-policy-version',
      CustomerAuthLoadFailureKind.configuration,
    ),
    (
      'invalid-argument',
      'policy-unavailable',
      CustomerAuthLoadFailureKind.server,
    ),
    (
      'invalid-argument',
      'policy-version-outdated',
      CustomerAuthLoadFailureKind.server,
    ),
    (
      'invalid-argument',
      'consent-required',
      CustomerAuthLoadFailureKind.server,
    ),
    (
      'failed-precondition',
      'unrecognized-reason',
      CustomerAuthLoadFailureKind.configuration,
    ),
    (
      'invalid-argument',
      'unrecognized-reason',
      CustomerAuthLoadFailureKind.server,
    ),
  ]) {
    test(
      'consent callable maps ${entry.$1}/${entry.$2} before generic preconditions',
      () async {
        final store = TestStore();
        final repository = FirebaseCustomerAuthStateRepository(
          auth: TestAuth(),
          firestore: store,
          callable: (name, data) async {
            expect(name, 'ensureUserProfile');
            expect(data, {
              'acceptedTerms': true,
              'acceptedPrivacy': true,
              'termsPolicyVersion': '1.1',
              'privacyPolicyVersion': '1.2',
            });
            throw FirebaseFunctionsException(
              code: entry.$1,
              message: 'Mock rejection',
              details: {'reason': entry.$2},
            );
          },
        );
        await expectLater(
          repository.acceptConsent(
            'one',
            termsPolicyVersion: '1.1',
            privacyPolicyVersion: '1.2',
          ),
          throwsA(
            isA<CustomerAuthLoadFailure>().having(
              (e) => e.kind,
              'kind',
              entry.$3,
            ),
          ),
        );
        expect(store.reads, isEmpty);
      },
    );
  }

  test(
    'initial restored-session replay does not cancel legitimate sign-out',
    () async {
      final auth = TestAuth()..events = StreamController<User?>();
      final started = Completer<void>();
      final released = Completer<void>();
      final repository = FirebaseCustomerAuthStateRepository(
        auth: auth,
        firestore: TestStore(),
        callable: (_, _) async {},
        googleSignOut: () async {
          started.complete();
          await released.future;
        },
      );
      final subscription = repository.authStateChanges().listen((_) {});
      final signingOut = repository.signOut();
      await started.future;
      auth.events!.add(auth.user);
      await Future<void>.delayed(Duration.zero);
      released.complete();
      await signingOut;
      expect(auth.currentUser, isNull);
      expect(auth.signOutCalls, 1);
      await subscription.cancel();
      await auth.events!.close();
    },
  );
  test(
    'same UID in a replacement session is protected by operation generation',
    () async {
      final auth = TestAuth()..events = StreamController<User?>();
      final started = Completer<void>();
      final released = Completer<void>();
      final repository = FirebaseCustomerAuthStateRepository(
        auth: auth,
        firestore: TestStore(),
        callable: (_, _) async {},
        googleSignOut: () async {
          started.complete();
          await released.future;
        },
      );
      final subscription = repository.authStateChanges().listen((_) {});
      auth.events!.add(auth.user);
      await Future<void>.delayed(Duration.zero);
      final signingOut = repository.signOut();
      await started.future;
      auth.events!.add(null);
      auth.user = TestUser();
      auth.events!.add(auth.user);
      await Future<void>.delayed(Duration.zero);
      released.complete();
      await signingOut;
      expect(auth.currentUser?.uid, 'one');
      expect(auth.signOutCalls, 0);
      await subscription.cancel();
      await auth.events!.close();
    },
  );
  test(
    'identity switch during pending Google sign-out preserves replacement Firebase account',
    () async {
      final auth = TestAuth();
      final started = Completer<void>();
      final released = Completer<void>();
      final repository = FirebaseCustomerAuthStateRepository(
        auth: auth,
        firestore: TestStore(),
        callable: (_, _) async {},
        googleSignOut: () async {
          started.complete();
          await released.future;
        },
      );
      final signingOut = repository.signOut();
      await started.future;
      auth.user = TestUser(id: 'replacement');
      released.complete();
      await signingOut;
      expect(auth.currentUser?.uid, 'replacement');
      expect(auth.signOutCalls, 0);
    },
  );

  test(
    'unchanged identity signs out Firebase after Google completion',
    () async {
      final auth = TestAuth();
      final started = Completer<void>();
      final released = Completer<void>();
      final repository = FirebaseCustomerAuthStateRepository(
        auth: auth,
        firestore: TestStore(),
        callable: (_, _) async {},
        googleSignOut: () async {
          started.complete();
          await released.future;
        },
      );
      final signingOut = repository.signOut();
      await started.future;
      expect(auth.signOutCalls, 0);
      released.complete();
      await signingOut;
      expect(auth.currentUser, isNull);
      expect(auth.signOutCalls, 1);
    },
  );
  for (final change in [
    {'isBlocked': true},
    {'isActive': false, 'accountStatus': 'disabled'},
    {'role': 'provider'},
  ]) {
    test(
      'restricted prerequisite prevents customer reads and repair: $change',
      () async {
        final store = TestStore()
          ..documents = {'users/one': profile, 'customers/one': {}};
        final calls = <String>[];
        final repository = FirebaseCustomerAuthStateRepository(
          auth: TestAuth(),
          firestore: store,
          callable: (name, _) async {
            calls.add(name);
          },
        );
        await repository.loadAccount(
          identity: identity,
          forceTokenRefresh: false,
        );
        store.reads.clear();
        store.documents = {
          'users/one': {...profile, ...change},
        };
        final result = await repository.loadAccount(
          identity: identity,
          forceTokenRefresh: false,
        );
        expect(result.userProfile, isNotNull);
        expect(store.reads, ['users/one']);
        expect(calls, ['syncUserAuthState']);
      },
    );
  }

  for (final entry in {
    'blocked': CustomerAuthLoadFailureKind.blocked,
    'disabled': CustomerAuthLoadFailureKind.disabledAuthAccount,
    'unsupported-role': CustomerAuthLoadFailureKind.unsupportedRole,
  }.entries) {
    test(
      'explicit ${entry.key} callable restriction never provisions',
      () async {
        final store = TestStore();
        final calls = <String>[];
        final repository = FirebaseCustomerAuthStateRepository(
          auth: TestAuth(),
          firestore: store,
          callable: (name, _) async {
            calls.add(name);
            throw FirebaseFunctionsException(
              code: 'permission-denied',
              message: 'Restricted',
              details: {'reason': entry.key},
            );
          },
        );
        await expectLater(
          repository.loadAccount(identity: identity, forceTokenRefresh: false),
          throwsA(
            isA<CustomerAuthLoadFailure>().having(
              (e) => e.kind,
              'kind',
              entry.value,
            ),
          ),
        );
        expect(calls, ['syncUserAuthState']);
        expect(store.reads, isEmpty);
      },
    );
  }

  test(
    'unauthenticated callable rejection is not proof of an expired Firebase session',
    () async {
      final store = TestStore();
      final repository = FirebaseCustomerAuthStateRepository(
        auth: TestAuth(),
        firestore: store,
        callable: (_, _) async {
          throw FirebaseFunctionsException(
            code: 'unauthenticated',
            message: 'Request rejected',
          );
        },
      );
      await expectLater(
        repository.loadAccount(identity: identity, forceTokenRefresh: false),
        throwsA(
          isA<CustomerAuthLoadFailure>().having(
            (e) => e.kind,
            'kind',
            CustomerAuthLoadFailureKind.callableAccess,
          ),
        ),
      );
      expect(store.reads, isEmpty);
    },
  );

  test(
    'restored session and duplicate Auth/token events wait for one bootstrap',
    () async {
      final store = TestStore()
        ..documents = {'users/one': profile, 'customers/one': {}};
      final started = Completer<void>();
      final released = Completer<void>();
      final calls = <String>[];
      final repository = FirebaseCustomerAuthStateRepository(
        auth: TestAuth(),
        firestore: store,
        callable: (name, _) async {
          calls.add(name);
          started.complete();
          await released.future;
        },
      );
      final controller = CustomerAuthenticationController(
        repository: repository,
      )..start();
      await started.future;
      expect(store.reads, isEmpty);
      expect(controller.state.gate.kind, AuthenticationGateKind.loading);
      released.complete();
      await controller.refresh(forceTokenRefresh: false);
      expect(calls, ['syncUserAuthState']);
      expect(
        controller.state.gate.kind,
        AuthenticationGateKind.customerPhoneVerificationRequired,
      );
      controller.dispose();
    },
  );

  test(
    'sign-out during provisioning prevents subsequent profile reads',
    () async {
      final auth = TestAuth();
      final store = TestStore();
      final pending = Completer<void>();
      final started = Completer<void>();
      final repository = FirebaseCustomerAuthStateRepository(
        auth: auth,
        firestore: store,
        callable: (_, _) async {
          started.complete();
          await pending.future;
        },
      );
      final loading = repository.loadAccount(
        identity: identity,
        forceTokenRefresh: false,
      );
      final assertion = expectLater(
        loading,
        throwsA(isA<CustomerAuthLoadFailure>()),
      );
      await started.future;
      final signingOut = repository.signOut();
      pending.complete();
      await assertion;
      await signingOut;
      expect(store.reads, isEmpty);
      expect(auth.currentUser, isNull);
    },
  );

  test(
    'interrupted bootstrap retries sync before any protected read',
    () async {
      final store = TestStore()
        ..documents = {'users/one': profile, 'customers/one': {}};
      var calls = 0;
      final repository = FirebaseCustomerAuthStateRepository(
        auth: TestAuth(),
        firestore: store,
        callable: (_, _) async {
          calls++;
          if (calls == 1) {
            throw FirebaseFunctionsException(
              code: 'unavailable',
              message: 'Offline',
            );
          }
        },
      );
      await expectLater(
        repository.loadAccount(identity: identity, forceTokenRefresh: false),
        throwsA(
          isA<CustomerAuthLoadFailure>().having(
            (e) => e.kind,
            'kind',
            CustomerAuthLoadFailureKind.network,
          ),
        ),
      );
      expect(store.reads, isEmpty);
      await repository.loadAccount(
        identity: identity,
        forceTokenRefresh: false,
      );
      expect(calls, 2);
    },
  );

  for (final missing in ['customer', 'neither']) {
    test('$missing profiles: bootstrap before protected reads', () async {
      final auth = TestAuth();
      final store = TestStore();
      store.documents['users/one'] = profile;
      if (missing == 'neither') store.documents['customers/one'] = {};
      final calls = <String>[];
      final repository = FirebaseCustomerAuthStateRepository(
        auth: auth,
        firestore: store,
        callable: (name, data) async {
          calls.add(name);
          if (name == 'syncUserAuthState') {
            expect(store.reads, isEmpty);
          } else {
            expect(name, 'ensureUserProfile');
            expect(
              data,
              isEmpty,
            ); // Ordinary synchronization carries no consent.
            store.documents['users/one'] = profile;
            store.documents['customers/one'] = {};
          }
        },
      );
      final result = await repository.loadAccount(
        identity: identity,
        forceTokenRefresh: false,
      );
      expect(result.userProfile, isNotNull);
      expect(
        calls,
        missing == 'neither'
            ? ['syncUserAuthState']
            : ['syncUserAuthState', 'ensureUserProfile'],
      );
    });
  }

  test(
    'first-time consent pauses all protected reads and explicit acceptance resumes',
    () async {
      final store = TestStore();
      var accepted = false;
      final calls = <String>[];
      final repository = FirebaseCustomerAuthStateRepository(
        auth: TestAuth(),
        firestore: store,
        callable: (name, data) async {
          calls.add(name);
          if (name == 'syncUserAuthState') {
            throw FirebaseFunctionsException(
              message: 'User profile was not found.',
              code: 'not-found',
            );
          }
          if (data?['acceptedTerms'] != true ||
              data?['acceptedPrivacy'] != true) {
            throw FirebaseFunctionsException(
              message: 'Test failure',
              code: 'failed-precondition',
              details: {'reason': 'consent-required'},
            );
          }
          accepted = true;
          expect(data?['termsPolicyVersion'], '1.1');
          expect(data?['privacyPolicyVersion'], '1.2');
          store.documents = {'users/one': profile, 'customers/one': {}};
        },
      );
      await expectLater(
        repository.loadAccount(identity: identity, forceTokenRefresh: false),
        throwsA(
          isA<CustomerAuthLoadFailure>().having(
            (e) => e.kind,
            'kind',
            CustomerAuthLoadFailureKind.consentRequired,
          ),
        ),
      );
      expect(accepted, false);
      expect(store.reads, isEmpty);
      expect(calls, ['syncUserAuthState', 'ensureUserProfile']);
      await repository.acceptConsent(
        'one',
        termsPolicyVersion: '1.1',
        privacyPolicyVersion: '1.2',
      );
      expect(accepted, true);
      expect(
        (await repository.loadAccount(
          identity: identity,
          forceTokenRefresh: false,
        )).userProfile,
        isNotNull,
      );
      expect(calls, [
        'syncUserAuthState',
        'ensureUserProfile',
        'ensureUserProfile',
      ]);
    },
  );

  for (final callableFailure in [true, false]) {
    test(
      '${callableFailure ? 'App Check/callable' : 'Firestore'} permission failure stays retryable',
      () async {
        final store = TestStore()
          ..documents = {'users/one': profile, 'customers/one': {}};
        if (!callableFailure) store.failure = 'permission-denied';
        final repository = FirebaseCustomerAuthStateRepository(
          auth: TestAuth(),
          firestore: store,
          callable: (_, _) async {
            if (callableFailure) {
              throw FirebaseFunctionsException(
                message: 'Test failure',
                code: 'permission-denied',
              );
            }
          },
        );
        await expectLater(
          repository.loadAccount(identity: identity, forceTokenRefresh: false),
          throwsA(
            isA<CustomerAuthLoadFailure>().having(
              (e) => e.kind,
              'kind',
              callableFailure
                  ? CustomerAuthLoadFailureKind.callableAccess
                  : CustomerAuthLoadFailureKind.accountAccess,
            ),
          ),
        );
        if (callableFailure) expect(store.reads, isEmpty);
      },
    );
  }

  test('genuine expired token is classified as session expired', () async {
    final auth = TestAuth()..user = TestUser(failure: 'id-token-revoked');
    final repository = FirebaseCustomerAuthStateRepository(
      auth: auth,
      firestore: TestStore(),
      callable: (_, _) async {
        fail('Must not call');
      },
    );
    await expectLater(
      repository.loadAccount(identity: identity, forceTokenRefresh: false),
      throwsA(
        isA<CustomerAuthLoadFailure>().having(
          (e) => e.kind,
          'kind',
          CustomerAuthLoadFailureKind.sessionExpired,
        ),
      ),
    );
  });

  test(
    'switching identity during bootstrap prevents protected reads',
    () async {
      final auth = TestAuth();
      final store = TestStore();
      final pending = Completer<void>();
      final started = Completer<void>();
      final repository = FirebaseCustomerAuthStateRepository(
        auth: auth,
        firestore: store,
        callable: (_, _) async {
          started.complete();
          await pending.future;
        },
      );
      final loading = repository.loadAccount(
        identity: identity,
        forceTokenRefresh: false,
      );
      final assertion = expectLater(
        loading,
        throwsA(isA<CustomerAuthLoadFailure>()),
      );
      await started.future;
      auth.user = TestUser(id: 'two');
      pending.complete();
      await assertion;
      expect(store.reads, isEmpty);
    },
  );
}
