// ignore_for_file: subtype_of_sealed_class
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:feasta/features/authentication/data/repositories/auth_repository.dart';
import 'package:feasta/features/authentication/domain/customer_registration.dart';
import 'package:flutter_test/flutter_test.dart';

class RegistrationAuth extends Fake implements FirebaseAuth {
  User? user;
  int creates = 0;
  bool rollbackFails = false;
  @override
  User? get currentUser => user;
  @override
  Future<UserCredential> createUserWithEmailAndPassword({
    required String email,
    required String password,
  }) async {
    creates++;
    user = RegistrationUser(this);
    return RegistrationCredential(user!);
  }
}

class RegistrationCredential extends Fake implements UserCredential {
  RegistrationCredential(this.identity);
  final User identity;
  @override
  User get user => identity;
}

class RegistrationUser extends Fake implements User {
  RegistrationUser(this.auth, {this.address = 'a@b.test'});
  final RegistrationAuth auth;
  final String address;
  int deletes = 0;
  @override
  String get uid => 'registration-user';
  @override
  String get email => address;
  @override
  bool get emailVerified => false;
  @override
  Future<void> sendEmailVerification([ActionCodeSettings? settings]) async {}
  @override
  Future<void> delete() async {
    deletes++;
    if (auth.rollbackFails) {
      throw FirebaseAuthException(code: 'network-request-failed');
    }
    auth.user = null;
  }
}

class RegistrationFunctions extends Fake implements FirebaseFunctions {
  final payloads = <Map<String, dynamic>>[];
  FirebaseFunctionsException? failure;
  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) =>
      RegistrationCallable(this);
}

class RegistrationCallable extends Fake implements HttpsCallable {
  RegistrationCallable(this.functions);
  final RegistrationFunctions functions;
  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    functions.payloads.add(Map<String, dynamic>.from(parameters as Map));
    if (functions.failure != null) throw functions.failure!;
    return RegistrationResponse<T>();
  }
}

class RegistrationResponse<T> extends Fake implements HttpsCallableResult<T> {}

class RegistrationStore extends Fake implements FirebaseFirestore {}

CustomerRegistrationInput input({
  String terms = '1.1',
  String privacy = '1.1',
}) => CustomerRegistrationInput(
  firstName: 'A',
  lastName: 'B',
  email: 'a@b.test',
  password: 'test-password',
  acceptedTerms: true,
  acceptedPrivacy: true,
  termsPolicyVersion: terms,
  privacyPolicyVersion: privacy,
);
void main() {
  for (final versions in [
    ['1.1', '1.1'],
    ['2', '3'],
    ['future-8', 'future-9'],
  ]) {
    for (final recover in [false, true]) {
      test(
        'callable receives exact versions $versions recovery=$recover',
        () async {
          final auth = RegistrationAuth();
          if (recover) auth.user = RegistrationUser(auth);
          final functions = RegistrationFunctions();
          final repository = AuthRepository(
            auth: auth,
            firestore: RegistrationStore(),
            functions: functions,
          );
          final result = await repository.registerCustomer(
            input(terms: versions[0], privacy: versions[1]),
          );
          expect(auth.creates, recover ? 0 : 1);
          expect(result.recoveredExistingIdentity, recover);
          expect(functions.payloads.single, {
            'firstName': 'A',
            'lastName': 'B',
            'acceptedTerms': true,
            'acceptedPrivacy': true,
            'termsPolicyVersion': versions[0],
            'privacyPolicyVersion': versions[1],
          });
        },
      );
    }
  }
  for (final rollbackFails in [false, true]) {
    test(
      'policy rejection rolls back new identity; failure recovers same identity ($rollbackFails)',
      () async {
        final auth = RegistrationAuth()..rollbackFails = rollbackFails;
        final functions = RegistrationFunctions()
          ..failure = FirebaseFunctionsException(
            code: 'failed-precondition',
            message: 'Policy changed',
            details: {'reason': 'policy-version-outdated'},
          );
        final repository = AuthRepository(
          auth: auth,
          firestore: RegistrationStore(),
          functions: functions,
        );
        await expectLater(
          repository.registerCustomer(input()),
          throwsA(
            isA<CustomerRegistrationException>().having(
              (e) => e.kind,
              'kind',
              CustomerRegistrationFailureKind.policyOutdated,
            ),
          ),
        );
        expect(auth.creates, 1);
        expect(auth.user == null, !rollbackFails);
        if (rollbackFails) {
          functions.failure = null;
          expect(
            (await repository.registerCustomer(
              input(terms: '2', privacy: '3'),
            )).recoveredExistingIdentity,
            isTrue,
          );
          expect(auth.creates, 1);
        }
      },
    );
  }
  test('different signed-in identity never creates or calls backend', () async {
    final auth = RegistrationAuth();
    auth.user = RegistrationUser(auth, address: 'other@b.test');
    final functions = RegistrationFunctions();
    await expectLater(
      AuthRepository(
        auth: auth,
        firestore: RegistrationStore(),
        functions: functions,
      ).registerCustomer(input()),
      throwsA(isA<CustomerRegistrationException>()),
    );
    expect(auth.creates, 0);
    expect(functions.payloads, isEmpty);
  });
  test('missing versions are rejected before Authentication', () async {
    final auth = RegistrationAuth();
    final functions = RegistrationFunctions();
    await expectLater(
      AuthRepository(
        auth: auth,
        firestore: RegistrationStore(),
        functions: functions,
      ).registerCustomer(input(terms: '')),
      throwsA(isA<CustomerRegistrationException>()),
    );
    expect(auth.creates, 0);
    expect(functions.payloads, isEmpty);
  });
}
