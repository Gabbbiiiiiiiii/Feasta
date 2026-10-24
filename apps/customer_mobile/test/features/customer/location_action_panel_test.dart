import 'package:feasta/features/customer/location_picker_screen.dart';
import 'package:feasta/shared/models/customer_address_model.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  for (final scale in [1.0, 1.3, 2.0]) {
    testWidgets('location panel scrolls without overflow at $scale', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var manual = false;
      var confirmed = false;
      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(
              size: const Size(360, 640),
              padding: const EdgeInsets.only(bottom: 24),
              textScaler: TextScaler.linear(scale),
            ),
            child: Scaffold(
              body: Align(
                alignment: Alignment.bottomCenter,
                child: LocationActionPanel(
                  address: CustomerAddressModel.defaultOrmoc,
                  errorMessage:
                      'Map unavailable. Enter your event address manually.',
                  accuracyWarning:
                      'Please verify the exact event venue before confirming.',
                  isResolvingAddress: false,
                  isSaving: false,
                  isLocating: false,
                  onConfirm: () => confirmed = true,
                  onUseCurrentLocation: () {},
                  onDismiss: () {},
                  onManualEntry: () => manual = true,
                  onEditAddress: (_) {},
                ),
              ),
            ),
          ),
        ),
      );
      expect(tester.takeException(), isNull);
      await tester.ensureVisible(find.text('Enter address manually'));
      await tester.tap(find.text('Enter address manually'));
      expect(manual, isTrue);
      await tester.ensureVisible(find.text('Confirm Event Location'));
      expect(
        tester.widget<ElevatedButton>(find.byType(ElevatedButton)).onPressed,
        isNull,
      );
      expect(confirmed, isFalse);
      expect(tester.takeException(), isNull);
    });
  }
}
