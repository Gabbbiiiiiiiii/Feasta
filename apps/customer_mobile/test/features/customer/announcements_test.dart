import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/notifications/announcements_screen.dart';

void main() {
  final notice = <String, dynamic>{
    'title': 'Booking reminder',
    'content': 'Review event details.',
    'status': 'published',
    'audience': 'customers',
    'isDeleted': false,
    'publishedAt': Timestamp.fromDate(DateTime.utc(2026, 11, 16, 18, 30)),
  };
  test('customers see published customer and everyone announcements', () {
    expect(isCustomerAnnouncement(notice), isTrue);
    expect(isCustomerAnnouncement({...notice, 'audience': 'everyone'}), isTrue);
  });
  test(
    'drafts, archives, other audiences, deleted and malformed records are hidden',
    () {
      for (final change in <Map<String, dynamic>>[
        {'status': 'draft'},
        {'status': 'archived'},
        {'status': 'scheduled'},
        {'audience': 'providers'},
        {'audience': 'admins'},
        {'isDeleted': true},
        {'publishedAt': null},
        {'title': ''},
        {'content': ''},
      ]) {
        expect(
          isCustomerAnnouncement({...notice, ...change}),
          isFalse,
          reason: '$change',
        );
      }
    },
  );
  test(
    'publication date is explicitly in Manila time including date rollover',
    () {
      expect(
        announcementManilaDate(notice['publishedAt'] as Timestamp),
        '2026-11-17 02:30',
      );
    },
  );
}
