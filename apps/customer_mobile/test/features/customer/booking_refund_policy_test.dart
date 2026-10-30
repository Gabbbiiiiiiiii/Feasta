import 'package:cloud_functions/cloud_functions.dart';
import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/shared/models/booking_agreement.dart';
import 'package:feasta/shared/models/booking_refund_policy.dart';
import 'package:feasta/features/customer/booking_refund_policy_controller.dart';
import 'booking_agreement_fixtures.dart';

Map<String, dynamic> refundFixture({
  String provider = 'provider_123',
  String source = 'provider_default',
  int version = 1,
}) => {
  'providerId': provider,
  'providerName': 'Ana Catering',
  'effectivePolicyKey':
      '$source:${source == 'provider_default' ? provider : 'package_123'}:v$version',
  'sourceKind': source,
  'policyVersion': version,
  'rules': [
    for (final stage in refundStages)
      {'stage': stage, 'refundBasisPoints': 5000},
  ],
  'terms': 'Subject to the applicable cancellation stage.',
};
Map<String, dynamic> refundResponse({
  String mode = 'required',
  List<Object?>? policies,
}) => {
  'rolloutMode': mode,
  'acknowledgementsRequired': mode == 'required',
  'policies': policies ?? [refundFixture()],
};
void main() {
  test('valid modes, sources and basis points', () {
    for (final mode in ['off', 'required']) {
      for (final source in ['provider_default', 'package_override']) {
        final d = RefundDisclosures.fromJson(
          refundResponse(
            mode: mode,
            policies: [refundFixture(source: source)],
          ),
        );
        expect(d.acknowledgementsRequired, mode == 'required');
        expect(d.policies.single.sourceKind, source);
      }
    }
    expect([0, 1, 5000, 5555, 10000].map(refundPercentage), [
      '0%',
      '0.01%',
      '50%',
      '55.55%',
      '100%',
    ]);
  });
  test('malformed responses fail closed', () {
    final bad = <Object?>[
      null,
      {},
      {...refundResponse(), 'acknowledgementsRequired': false},
      refundResponse(policies: []),
      refundResponse(policies: [refundFixture(), refundFixture()]),
      refundResponse(mode: 'unknown'),
      for (final entry in <String, Object?>{
        'providerId': 'bad/id',
        'providerName': '',
        'effectivePolicyKey': 'invented',
        'policyVersion': 0,
        'sourceKind': 'unknown',
        'terms': 42,
        'rules': [
          {'stage': refundStages.first, 'refundBasisPoints': 10001},
        ],
      }.entries)
        refundResponse(
          policies: [
            {...refundFixture(), entry.key: entry.value},
          ],
        ),
      refundResponse(
        policies: [
          {...refundFixture(), 'extra': true},
        ],
      ),
      refundResponse(
        policies: [
          {
            ...refundFixture(),
            'rules': [
              for (var i = 0; i < 3; i++)
                {'stage': refundStages.first, 'refundBasisPoints': 1},
            ],
          },
        ],
      ),
    ];
    for (final response in bad) {
      expect(
        () => RefundDisclosures.fromJson(response),
        throwsA(isA<RefundReviewFailure>()),
      );
    }
  });
  test('backend reasons and transport failures give recovery messages', () {
    for (final reason in [
      'REFUND_POLICY_REQUIRED',
      'REFUND_POLICY_INVALID',
      'REFUND_POLICY_CHANGED',
      'REFUND_POLICY_ACKNOWLEDGEMENT_REQUIRED',
      'REFUND_POLICY_ACKNOWLEDGEMENT_INVALID',
    ]) {
      expect(
        refundReviewFailure(
          FirebaseFunctionsException(
            message: 'Mock failure',
            code: 'failed-precondition',
            details: {'reason': reason},
          ),
        ).message,
        isNotEmpty,
      );
    }
    for (final code in [
      'unauthenticated',
      'permission-denied',
      'not-found',
      'deadline-exceeded',
      'unavailable',
      'resource-exhausted',
    ]) {
      expect(
        refundReviewFailure(
          FirebaseFunctionsException(code: code, message: 'Mock failure'),
        ).message,
        isNotEmpty,
      );
    }
  });
  test(
    'ownership changes during callable cannot become accepted disclosure',
    () async {
      var reads = 0;
      final c = BookingRefundPolicyController(
        resolveProviders: (r) async {
          reads++;
          return r.expectedProviderIds(
            lookupOwner: (_) async =>
                reads == 1 ? 'provider_456' : 'provider_789',
          );
        },
        loader: (_) async => RefundDisclosures.fromJson(
          refundResponse(
            policies: [
              refundFixture(),
              refundFixture(provider: 'provider_456'),
            ],
          ),
        ),
      );
      c.select(agreementSelection(addons: [marketplaceFixture()]));
      await c.load();
      expect(c.status, RefundReviewStatus.failed);
      expect(c.disclosures, null);
      c.dispose();
    },
  );
  test('account switch and invalid selection revoke accepted review', () async {
    final c = BookingRefundPolicyController(
      resolveProviders: fixtureProviders,
      loader: (_) async => RefundDisclosures.fromJson(refundResponse()),
    );
    c.select(agreementSelection(), ownerId: 'a');
    await c.load();
    c.acknowledge('provider_123', 'provider_default:provider_123:v1', true);
    expect(c.allAcknowledged, true);
    c.select(agreementSelection(), ownerId: 'b');
    expect(c.allAcknowledged, false);
    await c.load();
    c.acknowledge('provider_123', 'provider_default:provider_123:v1', true);
    c.select(agreementSelection(guests: 0), ownerId: 'b');
    expect(c.disclosures, null);
    expect(c.allAcknowledged, false);
    c.dispose();
  });
  test('transport is narrow and snapshot immutable', () {
    final selection = agreementSelection(addons: [marketplaceFixture()]);
    final request = BookingAgreementRequest(selection, 'snapshot_request');
    selection.customization.selectedAddOns.clear();
    expect(refundDisclosureRequest(request), {
      'providerId': 'provider_123',
      'packageId': 'package_123',
      'addonIds': ['addon_456'],
      'cateringSelectionType': 'package',
    });
  });
  for (final mode in ['required', 'off']) {
    test(
      '$mode explicit complete acknowledgments, refresh and failure clear consent',
      () async {
        var version = 1;
        var fail = false;
        final c = BookingRefundPolicyController(
          resolveProviders: fixtureProviders,
          loader: (_) async {
            if (fail) throw Exception('network');
            return RefundDisclosures.fromJson(
              refundResponse(
                mode: mode,
                policies: [refundFixture(version: version)],
              ),
            );
          },
        );
        addTearDown(c.dispose);
        c.select(agreementSelection(), ownerId: 'customer1');
        await c.load();
        expect(c.allAcknowledged, false);
        expect(() => c.acknowledgements, throwsA(isA<RefundReviewFailure>()));
        final p = c.disclosures!.policies.single;
        c.acknowledge(p.providerId, p.effectivePolicyKey, true);
        expect(c.acknowledgements, [
          {
            'providerId': 'provider_123',
            'effectivePolicyKey': 'provider_default:provider_123:v1',
          },
        ]);
        version++;
        await c.load();
        expect(c.allAcknowledged, false);
        c.acknowledge('provider_123', 'provider_default:provider_123:v1', true);
        expect(c.allAcknowledged, false);
        final current = c.disclosures!.policies.single;
        c.acknowledge(current.providerId, current.effectivePolicyKey, true);
        fail = true;
        await c.load();
        expect(c.status, RefundReviewStatus.failed);
        expect(c.disclosures, null);
        expect(c.allAcknowledged, false);
      },
    );
  }
  test(
    'shared addon ownership gives one policy per provider, incomplete consent rejected',
    () async {
      final c = BookingRefundPolicyController(
        resolveProviders: fixtureProviders,
        loader: (_) async => RefundDisclosures.fromJson(
          refundResponse(
            policies: [
              refundFixture(),
              refundFixture(provider: 'provider_456'),
            ],
          ),
        ),
      );
      addTearDown(c.dispose);
      c.select(
        agreementSelection(
          addons: [
            marketplaceFixture(),
            marketplaceFixture(id: 'addon_789'),
            {
              'addonId': 'addon_123',
              'providerId': 'provider_123',
              'source': 'catering_provider',
            },
          ],
        ),
      );
      await c.load();
      expect(c.status, RefundReviewStatus.ready);
      c.acknowledge('provider_123', 'provider_default:provider_123:v1', true);
      expect(c.allAcknowledged, false);
      c.acknowledge('provider_456', 'provider_default:provider_456:v1', true);
      expect(c.acknowledgements.length, 2);
      c.select(agreementSelection(), ownerId: 'customer2');
      expect(c.allAcknowledged, false);
      expect(c.disclosures, null);
    },
  );
  test('missing unexpected and unresolved providers fail closed', () async {
    for (final providers in [
      ['provider_123'],
      ['provider_123', 'provider_789'],
    ]) {
      final c = BookingRefundPolicyController(
        resolveProviders: fixtureProviders,
        loader: (_) async => RefundDisclosures.fromJson(
          refundResponse(
            policies: providers.map((p) => refundFixture(provider: p)).toList(),
          ),
        ),
      );
      c.select(agreementSelection(addons: [marketplaceFixture()]));
      await c.load();
      expect(c.status, RefundReviewStatus.failed);
      c.dispose();
    }
    final c = BookingRefundPolicyController(
      resolveProviders: (r) =>
          r.expectedProviderIds(lookupOwner: (_) async => null),
      loader: (_) async => throw StateError('must not load'),
    );
    c.select(agreementSelection(addons: [marketplaceFixture()]));
    await c.load();
    expect(c.status, RefundReviewStatus.failed);
    c.dispose();
  });
  test(
    'duplicates deduplicate, account/selection changes reject old responses, disposal safe',
    () async {
      final responses = <Completer<RefundDisclosures>>[];
      final c = BookingRefundPolicyController(
        resolveProviders: fixtureProviders,
        loader: (_) {
          final r = Completer<RefundDisclosures>();
          responses.add(r);
          return r.future;
        },
      );
      c.select(agreementSelection(), ownerId: 'a');
      final first = c.load();
      expect(identical(first, c.load()), true);
      await Future<void>.delayed(Duration.zero);
      c.select(agreementSelection(), ownerId: 'b');
      final second = c.load();
      await Future<void>.delayed(Duration.zero);
      responses[1].complete(RefundDisclosures.fromJson(refundResponse()));
      await second;
      c.acknowledge('provider_123', 'provider_default:provider_123:v1', true);
      responses[0].completeError(Exception('old failure'));
      await first;
      expect(c.allAcknowledged, true);
      c.select(agreementSelection(guests: 75), ownerId: 'b');
      expect(c.allAcknowledged, false);
      final last = c.load();
      await Future<void>.delayed(Duration.zero);
      c.dispose();
      responses[2].complete(RefundDisclosures.fromJson(refundResponse()));
      await last;
      expect(c.disclosures, null);
    },
  );
}
