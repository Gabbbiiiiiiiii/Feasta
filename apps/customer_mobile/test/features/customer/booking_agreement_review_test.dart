import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
// ignore: depend_on_referenced_packages, implementation_imports
import 'package:cloud_functions_platform_interface/src/pigeon/messages.pigeon.dart'
    as functions_host;
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/booking_agreement_review_screen.dart';
import 'package:feasta/features/authentication/data/repositories/feasta_repository.dart';
import 'package:feasta/shared/models/booking_agreement.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'booking_agreement_fixtures.dart';
import 'booking_preparation_flow_test.dart' show PreparationAuth;
import 'provider_discovery_test.dart' show GuestAuth;

class OwnershipRepository extends FeastaRepository {
  String? owner = 'provider_456';
  final lookups = <String>[];
  @override
  Future<AddonModel?> getEligiblePreparationAddon(String id) async {
    lookups.add(id);
    final current = owner;
    if (current == null) return null;
    return AddonModel(
      id: id,
      providerId: current,
      name: 'Music',
      description: '',
      category: 'music',
      price: 1,
      isAvailable: true,
      isActive: true,
      providerBusinessName: 'Music Provider',
      providerType: 'addon_provider',
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = BasicMessageChannel<Object?>(
    'dev.flutter.pigeon.cloud_functions_platform_interface.CloudFunctionsHostApi.call',
    functions_host.CloudFunctionsHostApi.pigeonChannelCodec,
  );
  final calls = <Map>[];
  Object? response;
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = PreparationAuth();
  });
  setUp(() {
    GuestAuth.signedIn = true;
    calls.clear();
    response = disclosureFixture();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockDecodedMessageHandler<Object?>(channel, (message) async {
          final args = (message as List).single as Map;
          calls.add(args);
          expect(args['functionName'], 'getBookingPaymentAgreementDisclosures');
          return [response];
        });
  });
  tearDown(() {
    expect(
      calls.any(
        (c) => [
          'submitBookingRequest',
          'createPaymentSession',
        ].contains(c['functionName']),
      ),
      isFalse,
    );
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockDecodedMessageHandler<Object?>(channel, null);
    GuestAuth.signedIn = false;
  });
  test(
    'repository uses disclosure callable, original region and exact M4.1 payload',
    () async {
      final request = BookingAgreementRequest(
        agreementSelection(
          addons: [
            {
              'addonId': 'addon_123',
              'latitude': 11,
              'quantity': 2,
              'price': 999,
            },
          ],
        ),
        'review_request_123',
      );
      final agreements = await FeastaRepository()
          .getBookingPaymentAgreementDisclosures(request);
      expect(agreements.single.providerName, 'Ana Catering');
      expect(calls.single['region'], 'asia-southeast1');
      expect(calls.single['timeout'], 30000);
      expect(calls.single['parameters'], request.toJson());
      expect((calls.single['parameters'] as Map)['addonIds'], ['addon_123']);
      final copy = request.toJson()..clear();
      expect(copy, isEmpty);
      expect(request.toJson(), isNotEmpty);
      response = {...disclosureFixture()}..remove('agreements');
      await expectLater(
        FeastaRepository().getBookingPaymentAgreementDisclosures(request),
        throwsA(
          isA<AgreementReviewFailure>().having(
            (e) => e.reconciliation,
            'reconciliation',
            isTrue,
          ),
        ),
      );
    },
  );
  test('unauthenticated review fails before making a callable', () async {
    GuestAuth.signedIn = false;
    await expectLater(
      FeastaRepository().getBookingPaymentAgreementDisclosures(
        BookingAgreementRequest(agreementSelection(), 'review_request_123'),
      ),
      throwsA(isA<AgreementReviewFailure>()),
    );
    expect(calls, isEmpty);
  });
  test(
    'repository refreshes each selected add-on and rejects changed ownership',
    () async {
      final repo = OwnershipRepository();
      final request = BookingAgreementRequest(
        agreementSelection(
          addons: [
            marketplaceFixture(),
            marketplaceFixture(id: 'addon_789'),
          ],
        ),
        'review_request_123',
      );
      expect(await repo.resolveBookingAgreementProviders(request), {
        'provider_123',
        'provider_456',
      });
      expect(repo.lookups, ['addon_456', 'addon_789']);
      repo.owner = 'provider_789';
      await expectLater(
        repo.resolveBookingAgreementProviders(request),
        throwsA(isA<AgreementReviewFailure>()),
      );
      repo.owner = null;
      await expectLater(
        repo.resolveBookingAgreementProviders(request),
        throwsA(isA<AgreementReviewFailure>()),
      );
      expect(repo.lookups, [
        'addon_456',
        'addon_789',
        'addon_456',
        'addon_456',
      ]);
      expect(calls, isEmpty);
    },
  );

  testWidgets(
    'partial agreements show refresh error; retry requires fresh consent',
    (tester) async {
      final selection = agreementSelection(addons: [marketplaceFixture()]);
      await tester.pumpWidget(
        MaterialApp(
          home: BookingAgreementReviewScreen(
            selection: selection,
            resolveProviders: fixtureProviders,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Provider agreements need to be refreshed'),
        findsOneWidget,
      );
      expect(find.byType(CheckboxListTile), findsNothing);
      expect(
        selection.customization.selectedAddOns.single['providerId'],
        'provider_456',
      );
      response = disclosureFixture([
        agreementFixture(),
        agreementFixture(provider: 'provider_456', deposit: false),
      ]);
      await tester.tap(find.text('Reload current agreements'));
      await tester.pumpAndSettle();
      for (final provider in ['provider_123', 'provider_456']) {
        final box = find.byKey(ValueKey('agreement-$provider'));
        await tester.scrollUntilVisible(box.hitTestable(), 250);
        expect(tester.widget<CheckboxListTile>(box).value, isFalse);
      }
      expect(calls.length, 2);
      expect(calls[0]['parameters'], calls[1]['parameters']);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  for (final scale in [1.5, 2.0]) {
    testWidgets(
      'agreement review remains readable on mobile at text scale $scale',
      (tester) async {
        tester.view.physicalSize = const Size(320, 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(
          MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(scale)),
              child: child!,
            ),
            home: BookingAgreementReviewScreen(selection: agreementSelection()),
          ),
        );
        await tester.pumpAndSettle();
        final checkbox = find.byType(CheckboxListTile);
        await tester.scrollUntilVisible(
          checkbox.hitTestable(),
          300,
          maxScrolls: 60,
        );
        expect(tester.widget<CheckboxListTile>(checkbox).value, isFalse);
        await tester.tap(checkbox);
        await tester.pump();
        expect(tester.widget<CheckboxListTile>(checkbox).value, isTrue);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }
  testWidgets(
    'server multi-provider amounts, deadlines and unchecked explicit consent',
    (tester) async {
      response = disclosureFixture([
        agreementFixture(),
        agreementFixture(provider: 'provider_456', deposit: false),
      ]);
      await tester.pumpWidget(
        MaterialApp(
          home: BookingAgreementReviewScreen(
            selection: agreementSelection(addons: [marketplaceFixture()]),
            resolveProviders: fixtureProviders,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Ana Catering'), findsOneWidget);
      expect(find.text('PHP 300.01'), findsOneWidget);
      expect(find.text('Deposit option available'), findsOneWidget);
      final first = find.byKey(const ValueKey('agreement-provider_123'));
      await tester.scrollUntilVisible(first.hitTestable(), 250);
      expect(tester.widget<CheckboxListTile>(first).value, isFalse);
      await tester.tap(first);
      await tester.pump();
      expect(tester.widget<CheckboxListTile>(first).value, isTrue);
      final second = find.byKey(const ValueKey('agreement-provider_456'));
      await tester.scrollUntilVisible(second.hitTestable(), 250);
      expect(tester.widget<CheckboxListTile>(second).value, isFalse);
      await tester.tap(second);
      await tester.pump();
      await tester.scrollUntilVisible(
        find.textContaining('All displayed agreements acknowledged'),
        150,
      );
      expect(
        find.textContaining('All displayed agreements acknowledged'),
        findsOneWidget,
      );
      expect(find.text('Submit Booking Request'), findsNothing);
      expect(calls.length, 1);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets('loading, disposal and later async completion are safe', (
    tester,
  ) async {
    final pending = Completer<List<BookingAgreement>>();
    await tester.pumpWidget(
      MaterialApp(
        home: BookingAgreementReviewScreen(
          selection: agreementSelection(),
          loader: (_) => pending.future,
        ),
      ),
    );
    await tester.pump();
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
    expect(find.byType(CheckboxListTile), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    pending.complete([BookingAgreement.fromJson(agreementFixture())]);
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'selection updates replace in-flight terms and consent; late replies ignored',
    (tester) async {
      final pending = <Completer<List<BookingAgreement>>>[];
      Future<List<BookingAgreement>> loader(BookingAgreementRequest _) {
        final p = Completer<List<BookingAgreement>>();
        pending.add(p);
        return p.future;
      }

      Widget page(String theme) => MaterialApp(
        home: BookingAgreementReviewScreen(
          key: const ValueKey('review'),
          selection: agreementSelection(theme: theme),
          loader: loader,
        ),
      );
      await tester.pumpWidget(page('garden'));
      await tester.pump();
      await tester.pumpWidget(page('classic'));
      await tester.pump();
      pending[1].complete([
        BookingAgreement.fromJson(agreementFixture(keyCharacter: 'b')),
      ]);
      await tester.pumpAndSettle();
      final checkbox = find.byType(CheckboxListTile);
      await tester.scrollUntilVisible(checkbox.hitTestable(), 250);
      await tester.tap(checkbox);
      await tester.pump();
      expect(tester.widget<CheckboxListTile>(checkbox).value, isTrue);
      pending[0].completeError(StateError('old request'));
      await tester.pumpAndSettle();
      expect(tester.widget<CheckboxListTile>(checkbox).value, isTrue);
      await tester.pumpWidget(page('another'));
      await tester.pump();
      expect(find.byType(CheckboxListTile), findsNothing);
      pending[2].complete([
        BookingAgreement.fromJson(agreementFixture(keyCharacter: 'c')),
      ]);
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(checkbox.hitTestable(), 250);
      expect(tester.widget<CheckboxListTile>(checkbox).value, isFalse);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'malformed response shows actionable error and reload; no consent',
    (tester) async {
      response = disclosureFixture([]);
      await tester.pumpWidget(
        MaterialApp(
          home: BookingAgreementReviewScreen(selection: agreementSelection()),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('incomplete'), findsOneWidget);
      expect(find.byType(CheckboxListTile), findsNothing);
      response = disclosureFixture();
      await tester.tap(find.text('Reload current agreements'));
      await tester.pumpAndSettle();
      expect(find.text('Ana Catering'), findsOneWidget);
      expect(calls.length, 2);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
