import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/features/authentication/data/repositories/feasta_repository.dart',
  ).readAsStringSync();

  test('chat mutations use backend callables', () {
    expect(source, contains("httpsCallable('openProviderRequestChat')"));
    expect(source, contains("httpsCallable('sendChatMessage')"));
    expect(source, contains("httpsCallable('markChatRoomRead')"));
  });

  test('send no longer creates messages or notifications directly', () {
    final sendStart = source.indexOf('Future<void> sendMessage({');
    final sendEnd = source.indexOf('Future<void> submitReview(', sendStart);
    final sendBlock = source.substring(sendStart, sendEnd);

    expect(sendBlock, isNot(contains('_db.batch()')));
    expect(sendBlock, isNot(contains('NotificationType.chat')));
    expect(sendBlock, isNot(contains('senderRole')));
    expect(sendBlock, isNot(contains('attachmentUrl')));
    expect(sendBlock, isNot(contains('messageType')));
  });

  test('real-time message reads stay bounded', () {
    final streamStart = source.indexOf(
      'Stream<QuerySnapshot<Map<String, dynamic>>> chatMessages',
    );
    final streamEnd = source.indexOf(
      'Future<void> markChatAsRead',
      streamStart,
    );
    final streamBlock = source.substring(streamStart, streamEnd);

    expect(streamBlock, contains('.snapshots()'));
    expect(streamBlock, contains('.limit(20)'));
    expect(streamBlock, contains(".collection(FirestoreCollections.messages)"));
  });
}
