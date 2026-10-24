import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/event_draft_persistence.dart';
import 'event_draft_persistence_test.dart' show DraftStore, form;

void main() {
  for (final operation in ['write', 'delete']) {
    test(
      'queued $operation rejects old generation before dispatch with same UID',
      () async {
        final store = DraftStore();
        final persistence = EventDraftPersistence(store);
        await persistence.save('u', 'p', 'other', form(), () => 'u');
        final other = store.values[persistence.key('u', 'p', 'other')];
        final gate = Completer<void>();
        store.gate = gate;
        final dispatched = persistence.save(
          'u',
          'p',
          'original',
          form(),
          () => 'u',
        );
        await Future<void>.delayed(Duration.zero);
        bool authorized = true;
        final queued = operation == 'write'
            ? persistence.save(
                'u',
                'p',
                'other',
                {...form(), 'notes': 'stale'},
                () => 'u',
                authorize: () => authorized,
              )
            : persistence.delete(
                'u',
                'p',
                'other',
                () => 'u',
                authorize: () => authorized,
              );
        final observed = operation == 'delete'
            ? expectLater(queued, throwsStateError)
            : expectLater(queued, completion(isFalse));
        authorized = false;
        gate.complete();
        await dispatched;
        await observed;
        expect(store.values[persistence.key('u', 'p', 'other')], other);
        expect(store.deleteCalls, 0);
        expect(store.writes, 2);
        expect(
          store.values.containsKey(persistence.key('u', 'p', 'original')),
          isTrue,
        );
        expect(
          store.values.containsKey(persistence.key('another', 'p', 'original')),
          isFalse,
        );
      },
    );
  }
}
