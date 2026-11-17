import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/booking_attempt_coordinator.dart';
import 'package:feasta/features/customer/event_list/event_list_submission_contract.dart';
import 'package:feasta/features/customer/event_list/event_list_submission_controller.dart';
import 'package:feasta/shared/models/customer_event_list.dart';
import 'booking_agreement_fixtures.dart';
import 'booking_refund_policy_test.dart' show refundFixture;

CustomerEventListEntry submissionEntry(
  int n, {
  String? note,
  String address = 'Main Street',
}) => CustomerEventListEntry(
  providerId: n == 1 ? 'provider_123' : 'provider_456',
  packageId: n == 1 ? 'package_123' : 'package_456',
  packageName: 'Package $n',
  providerName: 'Provider $n',
  estimatedPrice: 1,
  configuration: CustomerEventListConfiguration.fromJson({
    'event': {
      'eventType': 'wedding',
      'eventDate': '2030-01-05',
      'eventTime': '14:00',
      'eventEndTime': '18:00',
      'guestCount': 50,
      'eventLocation': 'Ormoc City',
      'eventAddress': address,
      'specialRequest': note ?? 'Instructions $n',
    },
    'sharedContractVersion': 2,
    'expectedPackageRevision': n + 1,
    'serviceTier': 'full_service',
    'packageThemeId': null,
    'themeChoice': 'none',
    'customTheme': '',
    'selectedFoods': <String>[],
    'selectedDecorations': <String>[],
    'selectedFurniture': <String>[],
    'foodChoiceSelections': <Object>[],
    'selectedAddOns': <Object>[],
    'willArrangeOwnAddOns': false,
    'customerArrangedAddOnsNote': '',
    'estimatedTotal': 100.0 * n,
    'pricingContext': null,
  }),
);

class SubmissionMemory implements BookingAttemptStore {
  final values = <String, String>{};
  bool failWrite = false;
  @override
  Future<String?> read(String uid) async => values[uid];
  @override
  Future<void> write(String uid, String value) async {
    if (failWrite) throw StateError('write failed');
    values[uid] = value;
  }
}

void main() {
  final entries = [submissionEntry(1), submissionEntry(2)];
  final result = {
    'bookingId': 'booking_123',
    'mainEventId': 'booking_123',
    'providerRequestIds': ['request_123', 'request_456'],
    'created': true,
  };
  late SubmissionMemory memory;
  late EventListSubmissionController controller;
  late List<(String, Map<String, dynamic>)> calls;
  late Map<String, Object?> disclosures;
  bool authorized = true;
  Object? submitError;
  String outcome = 'unresolved';
  Completer<Object?>? submitCompleter;
  setUp(() {
    authorized = true;
    submitError = null;
    submitCompleter = null;
    outcome = 'unresolved';
    memory = SubmissionMemory();
    calls = [];
    disclosures = {
      'agreements': [
        agreementFixture(),
        agreementFixture(
          provider: 'provider_456',
          keyCharacter: 'b',
          deposit: false,
        ),
      ],
      'refundPolicies': {
        'rolloutMode': 'required',
        'acknowledgementsRequired': true,
        'policies': [
          refundFixture(source: 'package_override'),
          refundFixture(provider: 'provider_456'),
        ],
      },
    };
    controller = EventListSubmissionController(
      uid: 'customer_123',
      isCurrent: () => authorized,
      store: memory,
      now: () => DateTime.utc(2029),
      call: (name, data) async {
        calls.add((name, jsonDecode(jsonEncode(data)) as Map<String, dynamic>));
        if (name == 'getMultiProviderBookingDisclosures') return disclosures;
        if (name == 'reconcileBookingSubmission') {
          return {
            'clientRequestId': data['clientRequestId'],
            'outcome': outcome,
            'booking': result,
          };
        }
        expect(
          memory.values.values.single,
          contains('pending'),
          reason: 'pending must be persisted before dispatch',
        );
        if (submitCompleter != null) return submitCompleter!.future;
        if (submitError != null) throw submitError!;
        return result;
      },
    );
  });
  tearDown(() => controller.dispose());
  void acknowledge() {
    for (final a in controller.agreements) {
      controller.acceptAgreement(a, true);
    }
    for (final p in controller.policies) {
      controller.acceptPolicy(p, true);
    }
  }

  test(
    'complete stable envelope preserves identities, notes and configurations',
    () {
      final plan = eventListSubmission(entries, 'request_123');
      final reversed = eventListSubmission(
        entries.reversed.toList(),
        'request_123',
      );
      expect(plan, reversed);
      expect((plan['event'] as Map)['specialRequest'], '');
      final selections = plan['selections'] as List;
      expect(
        selections.map((s) => s['configuration']['expectedPackageRevision']),
        [2, 3],
      );
      expect(
        selections.map((s) => s['configuration']['event']['specialRequest']),
        ['Instructions 1', 'Instructions 2'],
      );
      expect(
        sameEventListEvent(
          entries[0].configuration!.event,
          entries[1].configuration!.event,
        ),
        isTrue,
      );
    },
  );
  test(
    'conflicting schedule, unconfigured entries, duplicate provider and unsupported count fail closed',
    () {
      for (final invalid in [
        <CustomerEventListEntry>[],
        [entries[0]],
        [entries[0], entries[0]],
        [entries[0], submissionEntry(2, address: 'Other Street')],
        [
          entries[0],
          CustomerEventListEntry(
            providerId: 'provider_456',
            packageId: 'package_456',
            packageName: 'Package',
            providerName: 'Provider',
          ),
        ],
      ]) {
        expect(
          () => eventListSubmission(invalid, 'request_123'),
          throwsFormatException,
        );
      }
    },
  );
  test(
    'prepare is read-only and all provider acknowledgements gate one dispatch',
    () async {
      await controller.prepare(entries);
      expect(calls.map((c) => c.$1), ['getMultiProviderBookingDisclosures']);
      expect(memory.values, isEmpty);
      expect(controller.ready, isFalse);
      controller.acceptAgreement(controller.agreements.first, true);
      await controller.submit();
      expect(calls.length, 1);
      acknowledge();
      expect(controller.ready, isTrue);
      await controller.submit();
      expect(
        calls.where((c) => c.$1 == 'submitMultiProviderBookingRequest').length,
        1,
      );
      final payload = calls.last.$2;
      expect((payload['submission'] as Map)['selections'], hasLength(2));
      expect(payload['agreementAcknowledgements'], hasLength(2));
      expect(payload['policyAcknowledgements'], hasLength(2));
      expect(controller.result!.mainEventId, 'booking_123');
      expect(
        controller.confirmedEntries.map((e) => e.identity.key),
        entries.map((e) => e.identity.key),
      );
      expect(
        memory.values.values.single,
        isNot(contains('agreementAcknowledgements')),
      );
      await controller.submit();
      expect(calls.length, 2);
    },
  );
  test('concurrent submit taps cannot create duplicate dispatches', () async {
    await controller.prepare(entries);
    acknowledge();
    submitCompleter = Completer<Object?>();
    final sending = controller.submit();
    await Future<void>.delayed(Duration.zero);
    await controller.submit();
    expect(
      calls.where((c) => c.$1 == 'submitMultiProviderBookingRequest'),
      hasLength(1),
    );
    submitCompleter!.complete(result);
    await sending;
  });
  test(
    'unknown outcome survives reopening and changed list; no new identity is issued',
    () async {
      await controller.prepare(entries);
      acknowledge();
      final id = controller.requestId;
      submitError = TimeoutException('unknown');
      await controller.submit();
      expect(controller.pending, isTrue);
      expect(controller.ready, isFalse);
      await controller.prepare([submissionEntry(1)]);
      expect(controller.requestId, id);
      expect(controller.pending, isTrue);
      expect(
        calls.where((c) => c.$1 == 'submitMultiProviderBookingRequest'),
        hasLength(1),
      );
      outcome = 'confirmed_created';
      await controller.reconcile();
      expect(controller.result!.providerRequestIds, hasLength(2));
      expect(
        controller.confirmedEntries.map((e) => e.identity.key),
        entries.map((e) => e.identity.key),
      );
      expect(controller.pending, isFalse);
    },
  );
  test(
    'confirmed rejection permits a new request only after fresh review',
    () async {
      await controller.prepare(entries);
      acknowledge();
      final id = controller.requestId;
      submitError = StateError('terminal rejection');
      await controller.submit();
      outcome = 'confirmed_rejected';
      await controller.reconcile();
      expect(controller.ready, isFalse);
      expect(controller.pending, isFalse);
      await controller.prepare(entries);
      expect(controller.requestId, isNot(id));
      expect(controller.ready, isFalse);
    },
  );
  test('failed persistence prevents dispatch', () async {
    await controller.prepare(entries);
    acknowledge();
    memory.failWrite = true;
    await controller.submit();
    expect(calls, hasLength(1));
    expect(controller.pending, isTrue);
    expect(controller.result, isNull);
    expect(controller.confirmedEntries, isEmpty);
  });
  test(
    'corrupt persisted request blocks preparation without overwriting evidence',
    () async {
      memory.values['event_list_v1:customer_123'] = '{bad';
      await controller.prepare(entries);
      expect(calls, isEmpty);
      expect(controller.pending, isTrue);
      expect(memory.values.values.single, '{bad');
    },
  );
  test(
    'account or list generation changes prevent dispatch and disclosure reuse',
    () async {
      await controller.prepare(entries);
      acknowledge();
      authorized = false;
      await controller.submit();
      expect(calls, hasLength(1));
      expect(controller.ready, isFalse);
    },
  );
  test(
    'missing, duplicate and foreign agreements never enable submission',
    () async {
      for (final rows in [
        [],
        [agreementFixture(), agreementFixture()],
        [agreementFixture(), agreementFixture(provider: 'foreign_123')],
      ]) {
        disclosures['agreements'] = rows;
        await controller.prepare(entries);
        expect(controller.agreements, isEmpty);
        expect(controller.ready, isFalse);
      }
    },
  );
  test(
    'refund package overrides must belong to the exact provider package',
    () async {
      disclosures['refundPolicies'] = {
        'rolloutMode': 'required',
        'acknowledgementsRequired': true,
        'policies': [
          refundFixture(),
          refundFixture(provider: 'provider_456', source: 'package_override'),
        ],
      };
      await controller.prepare(entries);
      expect(controller.ready, isFalse);
      expect(controller.agreements, isEmpty);
    },
  );
  test(
    'server rollout off permits empty policies without inventing acknowledgements',
    () async {
      disclosures['refundPolicies'] = {
        'rolloutMode': 'off',
        'acknowledgementsRequired': false,
        'policies': [],
      };
      await controller.prepare(entries);
      acknowledge();
      expect(controller.ready, isTrue);
      await controller.submit();
      expect(calls.last.$2['policyAcknowledgements'], isEmpty);
    },
  );
  test(
    'reload requires renewed consent and retains package snapshots',
    () async {
      await controller.prepare(entries);
      acknowledge();
      expect(controller.ready, isTrue);
      await controller.prepare(entries);
      expect(controller.ready, isFalse);
      expect(
        (calls.last.$2['submission'] as Map)['selections'],
        (calls.first.$2['submission'] as Map)['selections'],
      );
    },
  );

  test(
    'fresh controller restores uncertain identity without a second dispatch',
    () async {
      await controller.prepare(entries);
      acknowledge();
      final id = controller.requestId;
      submitError = TimeoutException('lost response');
      await controller.submit();
      final gateway = controller.call;
      controller.dispose();
      controller = EventListSubmissionController(
        uid: 'customer_123',
        isCurrent: () => authorized,
        store: memory,
        call: gateway,
        now: () => DateTime.utc(2029),
      );
      await controller.prepare(entries);
      expect(controller.requestId, id);
      expect(controller.pending, isTrue);
      expect(
        calls.where((c) => c.$1 == 'submitMultiProviderBookingRequest'),
        hasLength(1),
      );
      expect(calls.last.$1, 'reconcileBookingSubmission');
    },
  );
  test('event mismatched disclosures cannot enable submission', () async {
    final rows = disclosures['agreements'] as List;
    final wrong = Map<String, dynamic>.from(rows.last as Map);
    for (final field in [
      'eventStartAt',
      'depositEligibilityCutoffAt',
      'remainingBalanceDueAt',
      'hardPaymentDeadlineAt',
      'preparationStartsAt',
    ]) {
      wrong[field] = DateTime.parse(
        wrong[field] as String,
      ).add(const Duration(days: 1)).toIso8601String();
    }
    disclosures['agreements'] = [rows.first, wrong];
    await controller.prepare(entries);
    expect(controller.agreements, isEmpty);
    expect(controller.ready, isFalse);
  });
  testWidgets('deposit cutoff clears consent and disables dispatch', (
    tester,
  ) async {
    controller.dispose();
    controller = EventListSubmissionController(
      uid: 'customer_123',
      isCurrent: () => true,
      store: memory,
      call: (name, data) async => disclosures,
      now: () => DateTime.utc(2030, 1, 2, 5, 59, 59),
    );
    await controller.prepare(entries);
    acknowledge();
    expect(controller.ready, isTrue);
    await tester.pump(const Duration(seconds: 2));
    expect(controller.agreements, isEmpty);
    expect(controller.ready, isFalse);
  });

  test(
    'legacy display event labels and revision metadata normalize only in transport',
    () {
      final original = entries[0].configuration!.toJson();
      original['sharedContractVersion'] = null;
      original['expectedPackageRevision'] = 3;
      original['event']['eventType'] = 'Wedding';
      original['event']['eventAddress'] = ' Main Street ';
      final legacy = CustomerEventListEntry(
        providerId: entries[0].providerId,
        packageId: entries[0].packageId,
        packageName: 'Legacy',
        providerName: 'Legacy provider',
        configuration: CustomerEventListConfiguration.fromJson(original),
      );
      final submission = eventListSubmission([
        legacy,
        entries[1],
      ], 'request_123');
      expect(submission['event']['eventType'], 'wedding');
      expect(submission['event']['eventAddress'], 'Main Street');
      expect(
        submission['selections'][0]['configuration']['event']['eventType'],
        'wedding',
      );
      expect(
        submission['selections'][0]['configuration']['expectedPackageRevision'],
        isNull,
      );
      expect(legacy.configuration!.event.eventType, 'Wedding');
      expect(legacy.configuration!.expectedPackageRevision, 3);
    },
  );
}
