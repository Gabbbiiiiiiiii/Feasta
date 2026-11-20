import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/shared/models/customer_event_list.dart';
import 'package:feasta/shared/models/customer_event_list_cloud_contract.dart';

void main() {
  final fixtures =
      jsonDecode(
            File(
              '../../contracts/customer-event-list/fixtures.json',
            ).readAsStringSync(),
          )
          as Map<String, dynamic>;
  const uid = 'customer_A';
  CloudCustomerEventList document() =>
      CloudCustomerEventList.fromJson(fixtures['document'], ownerUid: uid);
  test('identical JSON corpus preserves all kinds and configurations', () {
    final d = document();
    expect(
      CloudCustomerEventList.decode(d.encode(), ownerUid: uid).toJson(),
      fixtures['document'],
    );
    final copy = d.toJson();
    (copy['entries'] as List).clear();
    expect((d.toJson()['entries'] as List).length, 4);
    expect(
      cloudPlanningReadiness((d.toJson()['entries'] as List).first),
      'configured_revalidation_required',
    );
  });
  for (final row in fixtures['invalid'] as List) {
    test(
      'rejects ${row['name']}',
      () => expect(
        () => CloudCustomerEventList.fromJson(
          row['document'],
          ownerUid: row['ownerUid'],
        ),
        throwsFormatException,
      ),
    );
  }
  test(
    'Mobile package and marketplace native conversion preserves full fields',
    () {
      for (final e in (document().toJson()['entries'] as List).sublist(1, 3)) {
        final projection = projectCloudEntryToMobile(e);
        expect(projection.readOnly, false);
        final local = CustomerEventList(
          ownerUid: uid,
          revision: 9,
          updatedAt: DateTime.utc(2030),
          entries: [projection.entry!],
        );
        final canonical = CloudCustomerEventList.fromLocal(local).toJson();
        expect((canonical['entries'] as List).single, e);
        expect(local.revision, 9);
      }
    },
  );
  test('Web configuration and custom menu remain read-only and preserved', () {
    for (final e in [
      (document().toJson()['entries'] as List)[0],
      (document().toJson()['entries'] as List)[3],
    ]) {
      final projection = projectCloudEntryToMobile(e);
      expect(projection.readOnly, true);
      expect(projection.preserved, e);
    }
  });
  test(
    'Web package with representable notes projects and preserves canonical fields',
    () {
      final row =
          (document().toJson()['entries'] as List).first
              as Map<String, dynamic>;
      final config = row['configuration'] as Map<String, dynamic>;
      config['themeInspiration'] = {
        'notes': 'Garden',
        'referenceSetupId': null,
      };
      config['selectedEventServices'] = <Object>[];
      final projection = projectCloudEntryToMobile(row);
      expect(projection.readOnly, false);
      expect(projection.entry!.configuration!.customTheme, 'Garden');
      final incoming =
          (CloudCustomerEventList.fromLocal(
                        CustomerEventList(
                          ownerUid: uid,
                          revision: 0,
                          updatedAt: DateTime.utc(2030),
                          entries: [projection.entry!],
                        ),
                      ).toJson()['entries']
                      as List)
                  .single
              as Map<String, dynamic>;
      final merged = mergeCloudMobileEdit(row, incoming);
      expect(merged, row);
      final edited = incoming['configuration'] as Map<String, dynamic>;
      (edited['event'] as Map)['eventAddress'] = 'New hall';
      edited['customTheme'] = 'Updated garden';
      final saved = mergeCloudMobileEdit(row, incoming);
      expect(saved['href'], row['href']);
      expect(saved['configuration']['themeInspiration'], {
        'notes': 'Updated garden',
        'referenceSetupId': null,
      });
      expect(saved['configuration']['selectedEventServices'], isEmpty);
      expect(saved['configuration'].containsKey('customTheme'), false);
      expect(saved['configuration']['event']['eventAddress'], 'New hall');
      edited['selectedAddOns'] = [
        {'addonId': 'cannot_drop'},
      ];
      expect(() => mergeCloudMobileEdit(row, incoming), throwsFormatException);
    },
  );
  test('unconfigured Web package with a catalog revision is editable', () {
    final row =
        (document().toJson()['entries'] as List).first as Map<String, dynamic>;
    row['configuration'] = null;
    expect(projectCloudEntryToMobile(row).readOnly, false);
    final incoming = {...row, 'expectedRevision': null, 'href': null};
    expect(mergeCloudMobileEdit(row, incoming), row);
  });
  test('exactly 24 entries allowed with typed provider identities', () {
    final d = document().toJson();
    final base = (d['entries'] as List).first as Map<String, dynamic>;
    d['entries'] = List.generate(
      24,
      (i) => {
        ...base,
        'providerId': 'provider_$i',
        'identity': 'catering_package:provider_$i:package_web',
      },
    );
    expect(
      (CloudCustomerEventList.fromJson(d, ownerUid: uid).toJson()['entries']
              as List)
          .length,
      24,
    );
  });
  test(
    'stale and simultaneous revisions fail, including same-account old devices',
    () {
      final before = document();
      final a = before.toJson()..['revision'] = 1;
      final b = before.toJson()..['revision'] = 1;
      (a['entries'] as List).removeAt(0);
      (b['entries'] as List).removeLast();
      final committed = advanceCloudEventList(
        before,
        CloudCustomerEventList.fromJson(a, ownerUid: uid),
        0,
      );
      expect(
        () => advanceCloudEventList(
          committed,
          CloudCustomerEventList.fromJson(b, ownerUid: uid),
          0,
        ),
        throwsFormatException,
      );
      a['revision'] = 3;
      expect(
        () => advanceCloudEventList(
          before,
          CloudCustomerEventList.fromJson(a, ownerUid: uid),
          0,
        ),
        throwsFormatException,
      );
    },
  );
  test(
    'cleared cloud wins migration replay; old local and guests stay separate',
    () {
      final old = document();
      final clear = old.toJson()
        ..['revision'] = 1
        ..['entries'] = [];
      final cloud = advanceCloudEventList(
        old,
        CloudCustomerEventList.fromJson(clear, ownerUid: uid),
        0,
      );
      expect(
        initializeCloudMigration(uid, cloud, old).toJson(),
        cloud.toJson(),
      );
      expect(
        initializeCloudMigration(
          uid,
          initializeCloudMigration(uid, null, old),
          old,
        ).toJson(),
        old.toJson(),
      );
      expect(
        () => initializeCloudMigration('customer_B', cloud, old),
        throwsFormatException,
      );
      expect(
        () => initializeCloudMigration('feasta_guest_device_v1', null, old),
        throwsFormatException,
      );
    },
  );
}
