import 'dart:async';

import 'package:feasta/core/security/auth_operation_coordinator.dart';
import 'package:feasta/core/security/customer_session_coordinator.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late String? uid;
  late CustomerSessionCoordinator sessions;
  late AuthOperationCoordinator operations;
  late Object owner;
  late int refreshes;
  setUp(() {
    uid = 'A';
    refreshes = 0;
    owner = Object();
    sessions = CustomerSessionCoordinator(currentUid: () => uid);
    operations = AuthOperationCoordinator(sessions: sessions);
    sessions.attach(
      owner: owner,
      currentUid: () => uid,
      revalidate: () => refreshes++,
    );
  });
  tearDown(() => sessions.dispose());

  bool validate({bool allowed = true}) => sessions.completeValidation(
    sessions.beginValidation(),
    validatedUid: uid!,
    authorizedCustomer: allowed,
  );
  void ready() {
    sessions.observeIdentity(uid);
    expect(validate(), isTrue);
    expect(sessions.readSnapshot().customerUid, uid);
  }

  test(
    'restoration pending cannot authorize from SDK identity or validation',
    () {
      expect(
        sessions.readSnapshot().phase,
        CustomerAuthorizationPhase.restoring,
      );
      expect(validate(), isFalse);
      expect(sessions.readSnapshot().customerUid, isNull);
      ready();
    },
  );

  test('signed-out initial replay remains closed', () {
    uid = null;
    sessions.observeIdentity(null);
    expect(sessions.readSnapshot().customerUid, isNull);
    expect(sessions.readSnapshot().phase, CustomerAuthorizationPhase.closed);
  });

  test('unauthorized validation stays closed; later valid recovery opens', () {
    sessions.observeIdentity(uid);
    expect(validate(allowed: false), isFalse);
    expect(sessions.readSnapshot().customerUid, isNull);
    expect(validate(), isTrue);
  });

  test(
    'duplicate Auth/token observations preserve generation and snapshots',
    () {
      ready();
      final captured = sessions.readSnapshot();
      for (var i = 0; i < 5; i++) {
        sessions.observeIdentity('A');
        expect(validate(), isTrue);
      }
      expect(sessions.isCurrent(captured), isTrue);
      expect(sessions.readSnapshot().generation, captured.generation);
    },
  );

  test(
    'SDK mismatch closes synchronously before notification; A cannot revive',
    () {
      ready();
      final captured = sessions.readSnapshot();
      uid = 'B';
      expect(sessions.readSnapshot().customerUid, isNull);
      uid = 'A';
      expect(sessions.readSnapshot().customerUid, isNull);
      expect(sessions.isCurrent(captured), isFalse);
      expect(validate(), isTrue);
    },
  );

  for (final route in <List<String?>>[
    ['B'],
    ['B', 'A'],
    [null, 'A'],
    ['A'],
  ]) {
    test('controlled route $route invalidates even same UID', () async {
      ready();
      final captured = sessions.readSnapshot();
      for (final next in route) {
        final transition = operations.transition(() async {
          uid = next;
        });
        expect(sessions.readSnapshot().customerUid, isNull);
        expect(sessions.isCurrent(captured), isFalse);
        await transition;
      }
      expect(sessions.readSnapshot().customerUid, isNull);
      expect(validate(), isTrue);
    });
  }

  test(
    'invalidation precedes blocked queue; legacy epoch timing is preserved',
    () async {
      ready();
      final gate = Completer<void>();
      final blocked = operations.run(() => gate.future);
      var dispatched = false;
      final transition = operations.transition(() async {
        dispatched = true;
      });
      expect(sessions.readSnapshot().customerUid, isNull);
      expect(dispatched, isFalse);
      expect(operations.epoch, 0);
      gate.complete();
      await blocked;
      await transition;
      expect(dispatched, isTrue);
      expect(operations.epoch, 1);
    },
  );

  test(
    'competing tickets and old validation cannot reopen a newer session',
    () {
      ready();
      final oldValidation = sessions.beginValidation();
      final first = sessions.beginTransition();
      final second = sessions.beginTransition();
      sessions.finishTransition(first);
      expect(validate(), isFalse);
      final duringTransition = sessions.beginValidation();
      sessions.finishTransition(second);
      for (final stale in [oldValidation, duringTransition]) {
        expect(
          sessions.completeValidation(
            stale,
            validatedUid: 'A',
            authorizedCustomer: true,
          ),
          isFalse,
        );
      }
      expect(validate(), isTrue);
      final fresh = sessions.readSnapshot();
      sessions.finishTransition(first); // Replayed completion is inert.
      expect(sessions.isCurrent(fresh), isTrue);
    },
  );

  test('old validation after A-B-A is rejected', () {
    sessions.observeIdentity(uid);
    final captured = sessions.beginValidation();
    uid = 'B';
    sessions.observeIdentity('B');
    uid = 'A';
    sessions.observeIdentity('A');
    expect(
      sessions.completeValidation(
        captured,
        validatedUid: 'A',
        authorizedCustomer: true,
      ),
      isFalse,
    );
    expect(validate(), isTrue);
  });

  for (final label in ['login', 'logout']) {
    test('failed $label stays closed until fresh validation', () async {
      ready();
      final old = sessions.readSnapshot();
      final operation = operations.transition<void>(() async {
        throw StateError(label);
      });
      expect(sessions.readSnapshot().customerUid, isNull);
      await expectLater(operation, throwsStateError);
      expect(sessions.isCurrent(old), isFalse);
      expect(validate(), isTrue);
    });
  }

  test('password-style protection leaves legacy epoch unchanged', () async {
    ready();
    await operations.protectSession(
      () => operations.run(() async {
        expect(sessions.readSnapshot().customerUid, isNull);
        expect(operations.epoch, 0);
      }),
    );
    expect(operations.epoch, 0);
    expect(sessions.readSnapshot().customerUid, isNull);
    expect(validate(), isTrue);
  });

  test(
    'lifecycle closes once; resume requests validation without reopening',
    () async {
      ready();
      final old = sessions.readSnapshot();
      sessions.suspend();
      final generation = sessions.readSnapshot().generation;
      sessions.suspend();
      expect(sessions.readSnapshot().generation, generation);
      expect(validate(), isFalse);
      sessions.resume();
      await Future<void>.delayed(Duration.zero);
      expect(refreshes, 1);
      expect(sessions.readSnapshot().customerUid, isNull);
      expect(sessions.isCurrent(old), isFalse);
      expect(validate(), isTrue);
    },
  );

  test('late historical notification closes; never authorizes its payload', () {
    ready();
    sessions.observeIdentity('B'); // SDK remains A.
    expect(sessions.readSnapshot().customerUid, isNull);
    expect(sessions.readSnapshot().sdkUid, 'A');
    expect(validate(), isTrue);
  });

  test('new required check rejects older in-flight validation', () {
    sessions.observeIdentity(uid);
    final older = sessions.beginValidation();
    sessions.requireValidation();
    expect(
      sessions.completeValidation(
        older,
        validatedUid: 'A',
        authorizedCustomer: true,
      ),
      isFalse,
    );
    expect(validate(), isTrue);
  });

  test('detach prevents pending validation from publishing', () {
    sessions.observeIdentity(uid);
    final captured = sessions.beginValidation();
    sessions.detach(owner);
    expect(
      sessions.completeValidation(
        captured,
        validatedUid: 'A',
        authorizedCustomer: true,
      ),
      isFalse,
    );
    expect(sessions.readSnapshot().customerUid, isNull);
  });

  test(
    'disposal prevents pending validation and scheduled publication',
    () async {
      final other = CustomerSessionCoordinator(currentUid: () => 'A');
      other.observeIdentity('A');
      final pending = other.beginValidation();
      var notifications = 0;
      other.addListener(() => notifications++);
      other.dispose();
      expect(
        other.completeValidation(
          pending,
          validatedUid: 'A',
          authorizedCustomer: true,
        ),
        isFalse,
      );
      await Future<void>.delayed(Duration.zero);
      expect(notifications, 0);
      expect(other.readSnapshot().customerUid, isNull);
    },
  );

  test(
    'LIMITATION: invisible native same-UID replacement is indistinguishable',
    () {
      ready();
      final before = sessions.readSnapshot();
      // Native A -> signed out -> A happens entirely before bridge delivery.
      // Dart still sees A and has received no boundary signal. This assertion
      // demonstrates the accepted limitation, NOT a detection guarantee.
      expect(sessions.isCurrent(before), isTrue);
      sessions.observeIdentity(null); // Once evidence arrives, access closes.
      expect(sessions.isCurrent(before), isFalse);
    },
  );
}
