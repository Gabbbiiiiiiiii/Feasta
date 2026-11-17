import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/event_list/event_list_submission_contract.dart';
import 'package:feasta/features/customer/event_list/event_list_submission_controller.dart';
import 'package:feasta/shared/models/customer_event_list.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'booking_agreement_fixtures.dart';
import 'booking_refund_policy_test.dart' show refundFixture;
import 'event_list_submission_test.dart' show submissionEntry, SubmissionMemory;

void main() {
  final catering = submissionEntry(1);
  Map<String, dynamic> submission(int services) => eventListSubmission(
    [
      catering,
      if (services == 0) submissionEntry(2),
      for (var i = 0; i < services; i++)
        CustomerEventListEntry.marketplaceService(
          providerId: 'provider_photo$i',
          serviceId: 'service_photo$i',
          serviceName: 'Photography',
          providerName: 'Photographer',
          expectedRevision: 4,
          estimatedPrice: 99999,
          configuration: CustomerEventListConfiguration.marketplace(
            event: catering.configuration!.event.toJson(),
            specialRequest: 'Photo instructions $i',
          ),
        ),
    ],
    'original_request_123',
    currentMarketplaceMetadata: [
      for (var i = 0; i < services; i++)
        EventListIdentityRevision(
          providerId: 'provider_photo$i',
          serviceId: 'service_photo$i',
          revision: 4,
        ),
    ],
  );

  late SubmissionMemory memory;
  late EventListSubmissionController controller;
  late List<String> calls;
  String outcome = 'unresolved';
  void save(Map<String, dynamic> payload) {
    memory.values['event_list_v1:customer_123'] = jsonEncode({
      'version': 1,
      'uid': 'customer_123',
      'phase': 'pending',
      'submission': payload,
    });
  }

  setUp(() {
    memory = SubmissionMemory();
    calls = [];
    outcome = 'unresolved';
    controller = EventListSubmissionController(
      uid: 'customer_123',
      isCurrent: () => true,
      store: memory,
      now: () => DateTime.utc(2029),
      refreshMarketplaceService: (_) async =>
          throw StateError('No fresh authority during reconciliation'),
      call: (name, data) async {
        calls.add(name);
        expect(name, 'reconcileBookingSubmission');
        expect(data, {'clientRequestId': 'original_request_123'});
        return {
          'clientRequestId': data['clientRequestId'],
          'outcome': outcome,
          'booking': {
            'bookingId': 'booking_123',
            'mainEventId': 'booking_123',
            'providerRequestIds': [
              for (final row
                  in (jsonDecode(
                        memory.values.values.single,
                      )['submission']['selections']
                      as List))
                'request_${row['providerId']}',
            ],
            'created': true,
          },
        };
      },
    );
  });
  tearDown(() => controller.dispose());
  test(
    'changed metadata after confirmed rejection gets a new identity and fresh provider consent',
    () async {
      save(submission(1));
      final old = memory.values.values.single;
      final updated = CustomerEventListEntry.marketplaceService(
        providerId: 'provider_photo0',
        serviceId: 'service_photo0',
        serviceName: 'Photo',
        providerName: 'Photo',
        expectedRevision: 5,
        configuration: CustomerEventListConfiguration.marketplace(
          event: catering.configuration!.event.toJson(),
          specialRequest: 'Updated instructions',
        ),
      );
      await controller.prepare([catering, updated]);
      expect(controller.requestId, 'original_request_123');
      expect(memory.values.values.single, old);
      outcome = 'confirmed_rejected';
      await controller.reconcile();
      controller.dispose();
      final dispatches = <Map<String, dynamic>>[];
      controller = EventListSubmissionController(
        uid: 'customer_123',
        isCurrent: () => true,
        store: memory,
        now: () => DateTime.utc(2029),
        refreshMarketplaceService: (id) async => AddonModel(
          id: id,
          providerId: updated.providerId,
          revision: 5,
          name: 'Photo',
          description: '',
          category: 'Photography',
          price: 99999,
          isAvailable: true,
          isActive: true,
          providerBusinessName: 'Photo',
          providerType: 'addon_provider',
        ),
        call: (name, data) async {
          if (name == 'getMultiProviderBookingDisclosures') {
            return {
              'agreements': [
                agreementFixture(),
                agreementFixture(
                  provider: updated.providerId,
                  keyCharacter: 'b',
                ),
              ],
              'refundPolicies': {
                'rolloutMode': 'required',
                'acknowledgementsRequired': true,
                'policies': [
                  refundFixture(),
                  refundFixture(provider: updated.providerId),
                ],
              },
            };
          }
          dispatches.add(jsonDecode(jsonEncode(data)) as Map<String, dynamic>);
          throw StateError('uncertain network result');
        },
      );
      await controller.prepare([catering, updated]);
      expect(controller.requestId, isNot('original_request_123'));
      expect(controller.agreements, hasLength(2));
      expect(controller.ready, isFalse);
      await controller.submit();
      expect(dispatches, isEmpty);
      for (final agreement in controller.agreements) {
        controller.acceptAgreement(agreement, true);
      }
      for (final policy in controller.policies) {
        controller.acceptPolicy(policy, true);
      }
      final id = controller.requestId;
      await controller.submit();
      expect(dispatches, hasLength(1));
      expect(controller.pending, isTrue);
      expect(controller.requestId, id);
      final payload = dispatches.single;
      expect(
        (payload['submission']['selections'] as List).firstWhere(
          (r) => r['kind'] == 'marketplace_service',
        )['expectedRevision'],
        5,
      );
      expect(
        (payload['agreementAcknowledgements'] as List)
            .map((r) => r['providerId'])
            .toSet(),
        {catering.providerId, updated.providerId},
      );
      expect(
        (payload['policyAcknowledgements'] as List)
            .map((r) => r['providerId'])
            .toSet(),
        {catering.providerId, updated.providerId},
      );
      await controller.submit();
      expect(dispatches, hasLength(1));
    },
  );
  for (final services in [0, 1, 2]) {
    test(
      'schema restoration with $services services preserves uncertain evidence and never dispatches',
      () async {
        final payload = submission(services);
        save(payload);
        final raw = memory.values.values.single;
        await controller.prepare([]);
        expect(calls, ['reconcileBookingSubmission']);
        expect(controller.requestId, 'original_request_123');
        expect(controller.pending, isTrue);
        expect(controller.ready, isFalse);
        expect(controller.result, isNull);
        expect(controller.agreements, isEmpty);
        expect(controller.policies, isEmpty);
        expect(memory.values.values.single, raw);
        await controller.submit();
        await controller.prepare([submissionEntry(2)]);
        expect(calls, [
          'reconcileBookingSubmission',
          'reconcileBookingSubmission',
        ]);
        expect(memory.values.values.single, raw);
        outcome = 'confirmed_created';
        await controller.reconcile();
        expect(
          controller.result!.providerRequestIds,
          hasLength(services == 0 ? 2 : services + 1),
        );
        expect(jsonDecode(memory.values.values.single)['submission'], payload);
        expect(controller.pending, isFalse);
        if (services > 0) {
          final row = (payload['selections'] as List).lastWhere(
            (row) => row['kind'] == 'marketplace_service',
          );
          expect(row.containsKey('packageId'), isFalse);
          expect(
            row['configuration']['specialRequest'],
            'Photo instructions ${services - 1}',
          );
          expect(jsonEncode(row), isNot(contains('99999')));
        }
      },
    );
  }
  for (final defect in [
    'missing revision',
    'string revision',
    'zero revision',
    'fractional revision',
    'duplicate provider',
    'package identity',
    'extra price',
    'missing instructions',
    'unknown kind',
    'changed event',
    'missing configuration',
    'wrong schema',
  ]) {
    test('$defect blocks reconciliation and preserves evidence', () async {
      final payload = submission(1);
      final rows = payload['selections'] as List;
      final row =
          rows.firstWhere((row) => row['kind'] == 'marketplace_service') as Map;
      switch (defect) {
        case 'missing revision':
          row.remove('expectedRevision');
        case 'string revision':
          row['expectedRevision'] = '4';
        case 'zero revision':
          row['expectedRevision'] = 0;
        case 'fractional revision':
          row['expectedRevision'] = 4.5;
        case 'duplicate provider':
          row['providerId'] = catering.providerId;
        case 'package identity':
          row['packageId'] = 'fabricated_package';
        case 'extra price':
          row['configuration']['price'] = 123;
        case 'missing instructions':
          row['configuration'].remove('specialRequest');
        case 'unknown kind':
          row['kind'] = 'unknown_service';
        case 'changed event':
          payload['event']['eventAddress'] = 'Tampered address';
        case 'missing configuration':
          row.remove('configuration');
        case 'wrong schema':
          payload['schemaVersion'] = 3;
      }
      save(payload);
      final raw = memory.values.values.single;
      await controller.prepare([]);
      expect(calls, isEmpty);
      expect(controller.pending, isTrue);
      expect(controller.ready, isFalse);
      expect(controller.result, isNull);
      expect(controller.message, isNotEmpty);
      expect(memory.values.values.single, raw);
    });
  }
}
