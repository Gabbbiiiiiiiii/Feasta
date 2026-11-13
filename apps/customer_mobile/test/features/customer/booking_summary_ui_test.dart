import 'package:feasta/features/customer/booking_attempt_coordinator.dart';
import 'package:feasta/features/customer/event_list/event_list_scope.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'customer_event_list_test.dart' show EventAuth, MemoryEventStorage;
import 'package:feasta/features/customer/customization_session.dart';
import 'package:feasta/shared/models/customer_availability.dart';
import 'booking_attempt_test.dart' show MemoryStore;
import 'provider_discovery_test.dart' show GuestAuth;
import 'package:feasta/shared/models/event_customization_data.dart';
import 'package:feasta/core/theme/app_colors.dart';
import 'package:feasta/features/customer/booking_summary_screen.dart';
import 'package:feasta/features/customer/widgets/package_option_cards.dart';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'booking_preparation_flow_test.dart' show PreparationAuth, reviewData;
import 'booking_preparation_test.dart' show preparationPackage;
import 'provider_discovery_test.dart' show provider;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = PreparationAuth();
  });

  testWidgets(
    'Review Booking saves configuration without preparing a booking identity',
    (tester) async {
      GuestAuth.signedIn = true;
      PreparationAuth.owner = 'customer_A';
      final auth = EventAuth();
      final storage = MemoryEventStorage();
      final controller = EventListController(
        store: EventListStore(storage: storage),
        authentication: auth,
      );
      final attempts = MemoryStore();
      await tester.pumpWidget(
        EventListScope(
          controller: controller,
          child: MaterialApp(
            home: BookingSummaryScreen(
              provider: provider(),
              eventPackage: preparationPackage(),
              customization: reviewData(),
              attempts: BookingAttemptCoordinator(
                store: attempts,
                currentUid: () => 'customer_A',
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add to Event List'));
      await tester.pumpAndSettle();
      expect(find.text('Already in Event List'), findsOneWidget);
      expect(controller.list!.entries.single.configuration!.selectedFoods, [
        'Rice',
      ]);
      expect(attempts.values, isEmpty);
      expect(storage.writes, 1);
      await tester.pumpWidget(const SizedBox());
      controller.dispose();
      auth.dispose();
    },
  );

  for (final failedRestore in [false, true]) {
    testWidgets(
      'footer priority and policy/price wrapping; restore failure=$failedRestore',
      (tester) async {
        tester.view.physicalSize = const Size(320, 800);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        GuestAuth.signedIn = true;
        PreparationAuth.owner = 'customer-1';
        final changes = ChangeNotifier();
        final session = CustomizationSession(
          uid: 'customer-1',
          generation: 1,
          changes: changes,
          isCurrent: () => true,
        );
        final data = reviewData();
        final package = preparationPackage();
        final caterer = provider();
        final store = _SummaryStore(failedRestore);
        final attempts = BookingAttemptCoordinator(
          store: store,
          currentUid: () => 'customer-1',
        );
        final availability = CustomerAvailability.parse(
          {
            'results': [
              {
                'providerId': caterer.id,
                'available': true,
                'reasonCode': null,
                'message': 'Available.',
              },
            ],
          },
          uid: 'customer-1',
          providerId: caterer.id,
          packageId: package.id,
          customization: data,
        );
        await tester.pumpWidget(
          MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: const TextScaler.linear(2)),
              child: child!,
            ),
            home: BookingSummaryScreen(
              provider: caterer,
              eventPackage: package,
              customization: data,
              preparationOnly: false,
              session: session,
              availability: availability,
              attempts: attempts,
            ),
          ),
        );
        await tester.pumpAndSettle();
        if (failedRestore) {
          expect(
            find.text(
              'Previous request needs review before another submission.',
            ),
            findsOneWidget,
          );
        } else {
          expect(find.text('Agreements required'), findsOneWidget);

          // The agreement explanation is collapsed by default.
          expect(
            find.text('Review and acknowledge Booking & Payment Agreement.'),
            findsNothing,
          );

          await tester.tap(find.text('Agreements required'));
          await tester.pumpAndSettle();

          // Expanding only reveals the message. It does not accept an agreement.
          expect(
            find.text('Review and acknowledge Booking & Payment Agreement.'),
            findsOneWidget,
          );
        }
        expect(
          tester
              .widget<ElevatedButton>(
                find.widgetWithText(ElevatedButton, 'Submit booking request'),
              )
              .onPressed,
          isNull,
        );
        for (final title in [
          'Agreements & refund policies',
          'Booking estimate',
        ]) {
          await tester.scrollUntilVisible(
            find.text(title),
            150,
            scrollable: find.byType(Scrollable).first,
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        }
        await tester.scrollUntilVisible(
          find.text('Agreements & refund policies'),
          -150,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pumpAndSettle();
        final reviews = tester
            .widgetList<TextButton>(find.byType(TextButton))
            .where(
              (button) =>
                  button.child is Text &&
                  (button.child as Text).data == 'Review',
            );
        expect(reviews.length, 2);
        for (final button in reviews) {
          expect(button.style!.minimumSize!.resolve({}), const Size(48, 48));
          expect((button.child as Text).semanticsLabel, startsWith('Review '));
        }
        await tester.pumpWidget(const SizedBox());
        session.dispose();
        changes.dispose();
      },
    );
  }

  testWidgets('Steps 2 and 3 share numbered geometry and completion colors', (
    tester,
  ) async {
    for (final step in [1, 2]) {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: CustomizationProgress(step: step)),
        ),
      );
      final circles = tester
          .widgetList<CircleAvatar>(find.byType(CircleAvatar))
          .toList();
      expect(circles.length, 3);
      for (var i = 0; i < circles.length; i++) {
        expect(circles[i].radius, 14);
        expect(
          circles[i].backgroundColor,
          i <= step ? AppColors.primary : AppColors.surfaceMuted,
        );
        expect((circles[i].child! as Text).data, '${i + 1}');
      }
      final lines = tester
          .widgetList<Container>(find.byType(Container))
          .where((c) => c.constraints?.maxHeight == 2)
          .toList();
      expect(lines.length, 2);
      for (var i = 0; i < lines.length; i++) {
        expect(
          lines[i].color,
          i + 1 <= step ? AppColors.primary : AppColors.border,
        );
      }
    }
    expect(find.text('Step 3 of 3 \u2014 Review Booking'), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsNothing);
  });

  for (final empty in [false, true]) {
    testWidgets(
      'five groups preserve ordered selections at 320px and 200% text; empty=$empty',
      (tester) async {
        tester.view.physicalSize = const Size(320, 640);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final base = reviewData();
        final data = EventCustomizationData(
          eventType: base.eventType,
          eventDate: base.eventDate,
          eventTime: base.eventTime,
          eventEndTime: base.eventEndTime,
          guestCount: base.guestCount,
          eventLocation: base.eventLocation,
          eventAddress: base.eventAddress,
          selectedFoods: [],
          selectedDecorations: [],
          selectedFurniture: [],
          selectedAddOns: [],
          willArrangeOwnAddOns: false,
          customerArrangedAddOnsNote: '',
          specialRequest: base.specialRequest,
          serviceTier: 'full_service',
        );
        final groups = [
          'Food selections',
          'Decorations',
          'Furniture and equipment',
          'Service inclusions',
          'Package services',
        ];
        List<String> values(int i) => empty
            ? []
            : List.generate(
                4,
                (j) =>
                    'Selection $i-$j with a long descriptive name that wraps naturally',
              );
        data.selectedFoods
          ..clear()
          ..addAll(values(0));
        data.selectedDecorations
          ..clear()
          ..addAll(values(1));
        data.selectedFurniture
          ..clear()
          ..addAll(values(2));
        final original = [
          List.of(data.selectedFoods),
          List.of(data.selectedDecorations),
          List.of(data.selectedFurniture),
        ];
        final package = preparationPackage({
          'name':
              'A very long celebration package name for a large family gathering',
          'serviceInclusions': values(4),
          'serviceOptions': {
            'full_service': {'price': 15000, 'includedServices': values(3)},
          },
        });
        await tester.pumpWidget(
          MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: const TextScaler.linear(2)),
              child: child!,
            ),
            home: BookingSummaryScreen(
              provider: provider(
                name:
                    'A very long provider business name serving celebrations across the region',
              ),
              eventPackage: package,
              customization: data,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(
          tester
              .widget<CustomizationProgress>(find.byType(CustomizationProgress))
              .step,
          2,
        );
        for (var i = 0; i < groups.length; i++) {
          final title = find.text(groups[i]);
          await tester.scrollUntilVisible(
            title,
            100,
            scrollable: find.byType(Scrollable).first,
          );
          await tester.ensureVisible(title);
          await tester.pumpAndSettle();
          final group = find
              .ancestor(
                of: title,
                matching: find.byWidgetPredicate(
                  (w) => w.runtimeType.toString() == '_SelectionGroup',
                ),
              )
              .first;
          final isEmpty = empty;
          expect(
            find.descendant(
              of: group,
              matching: find.text(isEmpty ? '0' : '4'),
            ),
            findsOneWidget,
          );
          expect(
            find.descendant(of: group, matching: find.text('+2 more')),
            isEmpty ? findsNothing : findsOneWidget,
          );
          if (!isEmpty) {
            expect(find.text(values(i)[2]), findsNothing);
          }
          await tester.tap(title);
          await tester.pumpAndSettle();
          expect(
            find.descendant(
              of: group,
              matching: find.byIcon(Icons.expand_less),
            ),
            findsOneWidget,
          );
          if (!isEmpty) {
            final chips = tester
                .widgetList<Text>(
                  find.descendant(of: group, matching: find.byType(Text)),
                )
                .map((w) => w.data)
                .where((v) => v?.startsWith('Selection') ?? false)
                .toList();
            expect(chips, values(i));
          } else {
            expect(
              find.descendant(of: group, matching: find.text('None selected')),
              findsOneWidget,
            );
          }
          await tester.ensureVisible(title);
          await tester.pumpAndSettle();
          await tester.tap(title);
          await tester.pumpAndSettle();
          expect(
            find.descendant(
              of: group,
              matching: find.byIcon(Icons.expand_more),
            ),
            findsOneWidget,
          );
          expect(tester.takeException(), isNull);
        }
        expect(data.selectedFoods, original[0]);
        expect(data.selectedDecorations, original[1]);
        expect(data.selectedFurniture, original[2]);
        expect(find.text('Submit booking request'), findsNothing);
      },
    );
  }
}

class _SummaryStore extends MemoryStore {
  _SummaryStore(this.failedRestore);
  final bool failedRestore;
  @override
  Future<String?> read(String uid) async {
    if (failedRestore) throw StateError('storage unavailable');
    return super.read(uid);
  }
}
