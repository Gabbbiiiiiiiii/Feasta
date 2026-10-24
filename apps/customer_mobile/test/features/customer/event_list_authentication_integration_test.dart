// SDK values are faked; session generations, queue, repository, authorization
// controller, Event List adapter/controller/store are production implementations.
import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:feasta/core/security/auth_operation_coordinator.dart';
import 'package:feasta/core/security/customer_session_coordinator.dart';
import 'package:feasta/features/authentication/application/customer_auth_controller.dart';
import 'package:feasta/features/authentication/data/repositories/customer_auth_state_repository.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'package:flutter_test/flutter_test.dart';

import '../authentication/customer_auth_state_repository_test.dart'
    show TestAuth, TestUser, TestStore, profile;
import 'customer_event_list_test.dart' show MemoryEventStorage, entry;

class DelayedAuth extends TestAuth {
  final authEvents = StreamController<User?>.broadcast();
  final tokenEvents = StreamController<User?>.broadcast();
  final restored = Completer<void>();
  Object? logoutError;
  @override
  Stream<User?> authStateChanges() async* {
    await restored.future;
    yield currentUser;
    yield* authEvents.stream;
  }

  @override
  Stream<User?> idTokenChanges() async* {
    await restored.future;
    yield currentUser;
    yield* tokenEvents.stream;
  }

  @override
  Future<void> signOut() async {
    if (logoutError != null) throw logoutError!;
    await super.signOut();
    authEvents.add(null);
  }

  Future<void> close() async {
    await authEvents.close();
    await tokenEvents.close();
  }
}

class PendingReloadUser extends TestUser {
  final entered = Completer<void>();
  final release = Completer<void>();
  @override
  Future<void> reload() async {
    if (!entered.isCompleted) entered.complete();
    await release.future;
  }
}

class CountingEventStorage extends MemoryEventStorage {
  int reads = 0;
  @override
  Future<String?> read(String key) {
    reads++;
    return super.read(key);
  }
}

Future<void> settle() => Future<void>.delayed(const Duration(milliseconds: 35));

void main() {
  late DelayedAuth auth;
  late TestStore profiles;
  late FirebaseCustomerAuthStateRepository repository;
  late CustomerAuthenticationController customer;
  late CountingEventStorage memory;
  late EventListController list;
  final sessions = CustomerSessionCoordinator.shared;

  setUp(() {
    auth = DelayedAuth();
    profiles = TestStore()
      ..documents = {
        'users/one': {...profile},
        'customers/one': {},
        'users/two': {...profile},
        'customers/two': {},
      };
    repository = FirebaseCustomerAuthStateRepository(
      auth: auth,
      firestore: profiles,
      callable: (_, _) async {},
      googleSignOut: () async {},
    );
    customer = CustomerAuthenticationController(
      repository: repository,
      sessions: sessions,
    )..start();
    memory = CountingEventStorage();
    list = EventListController(store: EventListStore(storage: memory));
  });
  tearDown(() async {
    list.dispose();
    customer.dispose();
    await settle();
    await auth.close();
  });
  Future<void> restore() async {
    auth.restored.complete();
    await settle();
  }

  Future<void> saved() async {
    await restore();
    expect(sessions.readSnapshot().customerUid, 'one');
    expect(await list.addPackage(entry()), EventListResult.saved);
  }

  test('SDK user alone cannot load while restoration is pending', () async {
    expect(auth.currentUser?.uid, 'one');
    expect(await list.load(), EventListResult.unauthorized);
    expect(memory.reads, 0);
    await restore();
    expect(await list.load(), EventListResult.loaded);
    expect(list.list!.ownerUid, 'one');
  });

  test('initial signed-out startup never reads storage', () async {
    auth.user = null;
    await restore();
    expect(await list.addPackage(entry()), EventListResult.unauthorized);
    expect(memory.reads, 0);
    expect(memory.writes, 0);
  });

  for (final role in ['admin', 'provider']) {
    test('initial $role is not an authorized Event List customer', () async {
      profiles.documents['users/one'] = {...profile, 'role': role};
      await restore();
      expect(await list.load(), EventListResult.unauthorized);
      expect(memory.reads, 0);
    });
  }

  test(
    'identical Auth observations/token refresh retain cache and pending reads',
    () async {
      await saved();
      final before = sessions.readSnapshot();
      final cached = list.list;
      final reads = memory.reads;
      auth.authEvents.add(auth.user);
      auth.tokenEvents.add(auth.user);
      await settle();
      expect(sessions.isCurrent(before), isTrue);
      expect(list.list, same(cached));
      expect(memory.reads, reads);
      memory.readGate = Completer<void>();
      memory.enteredRead = Completer<void>();
      final pending = list.load();
      await memory.enteredRead!.future;
      auth.tokenEvents.add(auth.user);
      await settle();
      memory.readGate!.complete();
      expect(await pending, EventListResult.loaded);
      expect(sessions.isCurrent(before), isTrue);
    },
  );

  for (final uid in ['two', null]) {
    test(
      'visible $uid masks list/error before notification delivery',
      () async {
        await saved();
        memory.failRead = true;
        await list.load();
        expect(list.error, isNotNull);
        auth.user = uid == null ? null : TestUser(id: uid);
        // No Auth event has been emitted.
        expect(list.list, isNull);
        expect(list.error, isNull);
        memory.failRead = false;
        await settle();
        if (uid != null) {
          expect(await list.load(), EventListResult.loaded);
          expect(list.list!.ownerUid, uid);
          expect(list.list!.entries, isEmpty);
        } else {
          expect(await list.load(), EventListResult.unauthorized);
        }
      },
    );
  }

  for (final stage in ['read', 'write']) {
    test(
      'production logout during $stage rejects result; persisted owner survives',
      () async {
        await saved();
        final gate = Completer<void>(), entered = Completer<void>();
        if (stage == 'read') {
          memory.readGate = gate;
          memory.enteredRead = entered;
        } else {
          memory.writeGate = gate;
          memory.enteredWrite = entered;
        }
        final pending = stage == 'read'
            ? list.load()
            : list.addPackage(entry(1));
        await entered.future;
        final logout = repository.signOut(); // Production shared queue hook.
        expect(list.list, isNull); // Before queued Firebase sign-out executes.
        gate.complete();
        expect(await pending, EventListResult.unauthorized);
        await logout;
        expect(memory.values, isNotEmpty);
        memory.readGate = null;
        memory.writeGate = null;
        auth.user = TestUser();
        auth.authEvents.add(auth.user);
        await settle();
        // A late signed-out replay can invalidate a repository load already
        // queued for A. The existing bounded recovery/explicit refresh must
        // complete before loading A's durable list again.
        await customer.refresh(forceTokenRefresh: false);
        expect(await list.load(), EventListResult.loaded);
        expect(list.list!.entries.length, stage == 'write' ? 2 : 1);
      },
    );
  }

  for (final route in <List<String?>>[
    ['two'],
    ['two', 'one'],
    [null, 'one'],
    ['one'],
  ]) {
    test(
      'controlled $route uses fresh authorization and preserves owner records',
      () async {
        await saved();
        final before = sessions.readSnapshot();
        for (final uid in route) {
          final transition = AuthOperationCoordinator.shared.transition(
            () async {
              auth.user = uid == null ? null : TestUser(id: uid);
              // Same-UID replacement deliberately has no special Firebase event.
            },
          );
          expect(list.list, isNull);
          await transition;
        }
        await settle();
        expect(sessions.isCurrent(before), isFalse);
        expect(await list.load(), EventListResult.loaded);
        expect(list.list!.ownerUid, route.last);
        expect(list.list!.entries.length, route.last == 'one' ? 1 : 0);
      },
    );
  }

  test(
    'failed production logout remains closed until successful revalidation',
    () async {
      await saved();
      auth.logoutError = StateError('logout failed');
      await customer.signOut();
      expect(list.list, isNull);
      expect(auth.currentUser?.uid, 'one');
      auth.logoutError = null;
      await customer.refresh();
      expect(await list.load(), EventListResult.loaded);
      expect(list.list!.entries.length, 1);
    },
  );

  test(
    'failed authorization refresh closes access and explicit retry recovers',
    () async {
      await saved();
      profiles.failure = 'permission-denied';
      final refresh = customer.refresh();
      expect(list.list, isNull);
      await refresh;
      expect(await list.load(), EventListResult.unauthorized);
      profiles.failure = null;
      await customer.refresh();
      expect(await list.load(), EventListResult.loaded);
      expect(list.list!.entries.length, 1);
    },
  );

  test(
    'old validation behind blocked queue cannot reopen after controlled switch',
    () async {
      await saved();
      final user = PendingReloadUser();
      auth.user = user;
      final refresh = customer.refresh();
      await user.entered.future;
      final switchAccount = AuthOperationCoordinator.shared.transition(
        () async {
          auth.user = TestUser(id: 'two');
          auth.authEvents.add(auth.user);
        },
      );
      expect(list.list, isNull);
      user.release.complete();
      await refresh;
      await switchAccount;
      await settle();
      expect(await list.load(), EventListResult.loaded);
      expect(list.list!.ownerUid, 'two');
      expect(list.list!.entries, isEmpty);
    },
  );

  test(
    'late historical notification cannot publish historical customer',
    () async {
      await saved();
      await AuthOperationCoordinator.shared.transition(() async {
        auth.user = TestUser(id: 'two');
      });
      await settle();
      auth.authEvents.add(TestUser()); // Payload A; currentUser still B.
      await settle();
      expect(sessions.readSnapshot().customerUid, 'two');
      expect(await list.load(), EventListResult.loaded);
      expect(list.list!.ownerUid, 'two');
    },
  );

  test(
    'lifecycle resume revalidates; no automatic storage read or deletion',
    () async {
      await saved();
      final reads = memory.reads;
      final persisted = Map<String, String>.of(memory.values);
      sessions.suspend();
      expect(list.list, isNull);
      expect(await list.load(), EventListResult.unauthorized);
      sessions.resume();
      await settle();
      expect(memory.reads, reads);
      expect(memory.values, persisted);
      expect(await list.load(), EventListResult.loaded);
    },
  );

  test(
    'controller reconstruction preserves secure record and rejects disposed work',
    () async {
      await saved();
      memory.readGate = Completer<void>();
      memory.enteredRead = Completer<void>();
      final pending = list.load();
      await memory.enteredRead!.future;
      list.dispose();
      memory.readGate!.complete();
      expect(await pending, EventListResult.unauthorized);
      memory.readGate = null;
      list = EventListController(store: EventListStore(storage: memory));
      expect(await list.load(), EventListResult.loaded);
      expect(list.list!.entries.length, 1);
    },
  );

  test(
    'auth-owner restart begins closed and recovers the same persisted list',
    () async {
      await saved();
      final before = sessions.readSnapshot();
      list.dispose();
      customer.dispose();
      customer = CustomerAuthenticationController(
        repository: repository,
        sessions: sessions,
      )..start();
      list = EventListController(store: EventListStore(storage: memory));
      expect(await list.load(), EventListResult.unauthorized);
      await settle();
      expect(sessions.isCurrent(before), isFalse);
      expect(await list.load(), EventListResult.loaded);
      expect(list.list!.entries.length, 1);
    },
  );
}
