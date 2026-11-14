import 'package:feasta/core/theme/app_theme.dart';
import 'package:feasta/core/theme/app_sizes.dart';
import 'package:feasta/core/widgets/widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget harness(
    Widget child, {
    double textScaleFactor = 1,
    Size size = const Size(800, 600),
    bool disableAnimations = false,
  }) {
    return MaterialApp(
      theme: AppTheme.light,
      home: MediaQuery(
        data: MediaQueryData(
          size: size,
          textScaler: TextScaler.linear(textScaleFactor),
          disableAnimations: disableAnimations,
        ),
        child: Scaffold(body: Center(child: child)),
      ),
    );
  }

  group('buttons', () {
    testWidgets(
      'enabled button invokes callback and disabled button does not',
      (tester) async {
        var enabledTaps = 0;
        var disabledTaps = 0;
        await tester.pumpWidget(
          harness(
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                FeastaPrimaryButton(
                  label: 'Continue',
                  onPressed: () => enabledTaps++,
                ),
                FeastaSecondaryButton(label: 'Unavailable', onPressed: null),
              ],
            ),
          ),
        );

        await tester.tap(find.text('Continue'));
        await tester.tap(find.text('Unavailable'));
        expect(enabledTaps, 1);
        expect(disabledTaps, 0);
      },
    );

    testWidgets('loading button disables action and announces progress', (
      tester,
    ) async {
      var taps = 0;
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        harness(
          FeastaPrimaryButton(
            label: 'Save changes',
            loadingLabel: 'Saving',
            isLoading: true,
            onPressed: () => taps++,
          ),
        ),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Saving'), findsOneWidget);
      expect(find.bySemanticsLabel('Save changes, Saving'), findsOneWidget);
      await tester.tap(find.text('Saving'));
      expect(taps, 0);
      semantics.dispose();
    });
  });

  group('inputs', () {
    testWidgets('field exposes its label, required marker, and error', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        harness(
          const SizedBox(
            width: 320,
            child: FeastaTextField(
              label: 'Email address',
              isRequired: true,
              errorText: 'Enter a valid email address',
              keyboardType: TextInputType.emailAddress,
              autofillHints: [AutofillHints.email],
            ),
          ),
        ),
      );

      expect(find.text('Email address *'), findsOneWidget);
      expect(find.text('Enter a valid email address'), findsOneWidget);
      final fieldSemantics = tester.widget<Semantics>(
        find.byWidgetPredicate(
          (widget) =>
              widget is Semantics &&
              widget.properties.label == 'Email address, required',
        ),
      );
      expect(
        fieldSemantics.properties.hint,
        'Error: Enter a valid email address',
      );
      semantics.dispose();
    });

    testWidgets('password visibility can be toggled', (tester) async {
      await tester.pumpWidget(
        harness(
          const SizedBox(
            width: 320,
            child: FeastaTextField(label: 'Password', isPassword: true),
          ),
        ),
      );

      expect(
        tester.widget<EditableText>(find.byType(EditableText)).obscureText,
        isTrue,
      );
      await tester.tap(find.byTooltip('Show password'));
      await tester.pump();
      expect(
        tester.widget<EditableText>(find.byType(EditableText)).obscureText,
        isFalse,
      );
      expect(find.byTooltip('Hide password'), findsOneWidget);
    });

    testWidgets('search field submits and exposes its clear action', (
      tester,
    ) async {
      final controller = TextEditingController(text: 'catering');
      addTearDown(controller.dispose);
      String? submitted;
      var clears = 0;
      await tester.pumpWidget(
        harness(
          SizedBox(
            width: 320,
            child: FeastaSearchField(
              label: 'Search providers',
              controller: controller,
              onSubmitted: (value) => submitted = value,
              onClear: () => clears++,
            ),
          ),
        ),
      );

      await tester.tap(find.byType(TextFormField));
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.tap(find.byTooltip('Clear search'));

      expect(submitted, 'catering');
      expect(clears, 1);
      expect(find.bySemanticsLabel('Search providers'), findsWidgets);
    });
  });

  testWidgets('loading indicator announces its progress label', (tester) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      harness(const FeastaLoadingIndicator(label: 'Loading providers')),
    );

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.bySemanticsLabel('Loading providers'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('empty state action invokes callback', (tester) async {
    var taps = 0;
    await tester.pumpWidget(
      harness(
        FeastaEmptyState(
          title: 'No saved providers',
          actionLabel: 'Browse providers',
          onAction: () => taps++,
        ),
      ),
    );

    await tester.tap(find.text('Browse providers'));
    expect(taps, 1);
  });

  testWidgets('error state retry invokes callback', (tester) async {
    var retries = 0;
    await tester.pumpWidget(
      harness(
        FeastaErrorState(
          title: 'Could not load bookings',
          onRetry: () => retries++,
        ),
      ),
    );

    await tester.tap(find.text('Try again'));
    expect(retries, 1);
  });

  group('confirmation dialog', () {
    testWidgets('confirm invokes callback', (tester) async {
      var confirms = 0;
      await tester.pumpWidget(
        harness(
          FeastaConfirmationDialog(
            title: 'Submit request?',
            message: 'You can review the details before submitting.',
            onConfirm: () => confirms++,
            onCancel: () {},
          ),
        ),
      );

      await tester.tap(find.text('Confirm'));
      expect(confirms, 1);
    });

    testWidgets('cancel invokes callback', (tester) async {
      var cancels = 0;
      await tester.pumpWidget(
        harness(
          FeastaConfirmationDialog(
            title: 'Delete item?',
            message: 'This action cannot be undone.',
            isDestructive: true,
            onConfirm: () {},
            onCancel: () => cancels++,
          ),
        ),
      );

      await tester.tap(find.text('Cancel'));
      expect(cancels, 1);
    });
  });

  testWidgets('status badge exposes text and color-independent semantics', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      harness(
        const FeastaStatusBadge(
          label: 'Approved',
          tone: FeastaStatusTone.success,
        ),
      ),
    );

    expect(find.text('Approved'), findsOneWidget);
    expect(find.bySemanticsLabel('Status: Approved'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('price display formats Philippine pesos and announces value', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      harness(const FeastaPriceText(amount: 125000, decimalDigits: 0)),
    );

    expect(find.text('₱125,000'), findsOneWidget);
    expect(find.bySemanticsLabel('Price: ₱125,000'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('image placeholder exposes its accessible description', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      harness(
        const SizedBox(
          width: 200,
          height: 120,
          child: FeastaImagePlaceholder(label: 'Package image unavailable'),
        ),
      ),
    );

    expect(find.text('Package image unavailable'), findsOneWidget);
    expect(find.bySemanticsLabel('Package image unavailable'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('image shows a fallback when loading fails', (tester) async {
    await tester.pumpWidget(
      harness(
        const SizedBox(
          width: 200,
          height: 120,
          child: FeastaImage.network(
            imageUrl: 'https://invalid.invalid/feasta-image.png',
            description: 'Provider cover',
            fallbackLabel: 'Provider image unavailable',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Provider image unavailable'), findsOneWidget);
  });

  testWidgets('snackbar helper displays friendly semantic feedback', (
    tester,
  ) async {
    await tester.pumpWidget(
      harness(
        Builder(
          builder: (context) => FeastaPrimaryButton(
            label: 'Show update',
            onPressed: () => FeastaSnackbars.show(
              context,
              message: 'Package saved',
              tone: FeastaSnackbarTone.success,
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Show update'));
    await tester.pump();

    expect(find.text('Package saved'), findsOneWidget);
    expect(find.byType(SnackBar), findsOneWidget);
  });

  testWidgets('long state content supports large text without overflow', (
    tester,
  ) async {
    await tester.pumpWidget(
      harness(
        const FeastaEmptyState(
          title: 'There are no matching providers available for this event yet',
          message:
              'Try changing your filters or come back when more providers are available.',
        ),
        textScaleFactor: 2,
        size: const Size(360, 700),
      ),
    );
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(
      find.textContaining('There are no matching providers'),
      findsOneWidget,
    );
  });

  group('standardized application states', () {
    testWidgets('maps errors to friendly actionable copy', (tester) async {
      await tester.pumpWidget(
        harness(
          const FeastaApplicationErrorState(kind: FeastaErrorKind.connectivity),
        ),
      );
      expect(find.text('You appear to be offline'), findsOneWidget);
      expect(find.textContaining('Check your connection'), findsOneWidget);
      expect(find.textContaining('Exception'), findsNothing);
    });

    testWidgets('list skeleton approximates rows and announces loading', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        harness(
          const SizedBox(
            height: 500,
            child: FeastaListSkeleton(itemCount: 3, showImage: true),
          ),
        ),
      );
      expect(find.byType(FeastaSkeleton), findsAtLeastNWidgets(4));
      expect(find.bySemanticsLabel('Loading list'), findsOneWidget);
      semantics.dispose();
    });

    testWidgets('busy confirmation disables cancel and confirm actions', (
      tester,
    ) async {
      var cancels = 0;
      var confirms = 0;
      await tester.pumpWidget(
        harness(
          FeastaConfirmationDialog(
            title: 'Cancel booking?',
            message: 'This booking will be cancelled.',
            isDestructive: true,
            isLoading: true,
            onConfirm: () => confirms++,
            onCancel: () => cancels++,
          ),
        ),
      );
      await tester.tap(find.text('Cancel'));
      await tester.tap(find.text('Submitting'));
      expect(cancels, 0);
      expect(confirms, 0);
    });
  });

  group('accessibility hardening', () {
    testWidgets('field error is associated and exposed as a live region', (
      tester,
    ) async {
      await tester.pumpWidget(
        harness(
          const FeastaTextField(
            label: 'Business email',
            errorText: 'Enter a valid business email',
          ),
        ),
      );
      final semantics = tester.widget<Semantics>(
        find.byWidgetPredicate(
          (widget) =>
              widget is Semantics &&
              widget.properties.label == 'Business email',
        ),
      );
      expect(semantics.properties.liveRegion, isTrue);
      expect(semantics.properties.hint, 'Error: Enter a valid business email');
    });

    testWidgets('form submission moves focus in logical order', (tester) async {
      final firstFocus = FocusNode();
      final secondFocus = FocusNode();
      addTearDown(firstFocus.dispose);
      addTearDown(secondFocus.dispose);
      await tester.pumpWidget(
        harness(
          Column(
            children: [
              FeastaTextField(
                label: 'First name',
                focusNode: firstFocus,
                nextFocusNode: secondFocus,
                textInputAction: TextInputAction.next,
              ),
              FeastaTextField(label: 'Last name', focusNode: secondFocus),
            ],
          ),
        ),
      );
      await tester.tap(find.byType(TextFormField).first);
      await tester.pump();
      await tester.testTextInput.receiveAction(TextInputAction.next);
      await tester.pump();
      expect(secondFocus.hasFocus, isTrue);
    });

    testWidgets('buttons retain minimum touch targets at large text scale', (
      tester,
    ) async {
      await tester.pumpWidget(
        harness(
          FeastaTextButton(label: 'Clear', onPressed: () {}),
          textScaleFactor: 2,
          size: const Size(320, 300),
        ),
      );
      final size = tester.getSize(find.byType(TextButton));
      expect(size.width, greaterThanOrEqualTo(AppSizes.minimumTouchTarget));
      expect(size.height, greaterThanOrEqualTo(AppSizes.minimumTouchTarget));
      expect(tester.takeException(), isNull);
    });

    testWidgets('buttons respect reduced-motion preference', (tester) async {
      await tester.pumpWidget(
        harness(
          FeastaPrimaryButton(label: 'Continue', onPressed: () {}),
          disableAnimations: true,
        ),
      );
      expect(
        tester.widget<AnimatedSwitcher>(find.byType(AnimatedSwitcher)).duration,
        Duration.zero,
      );
    });

    testWidgets('dialog exposes route semantics and ordered actions', (
      tester,
    ) async {
      await tester.pumpWidget(
        harness(
          FeastaConfirmationDialog(
            title: 'Delete package?',
            message: 'The package will no longer be visible to customers.',
            onConfirm: () {},
          ),
        ),
      );
      final routeSemantics = tester.widget<Semantics>(
        find
            .byWidgetPredicate(
              (widget) =>
                  widget is Semantics &&
                  widget.properties.label == 'Delete package?' &&
                  widget.properties.scopesRoute == true,
            )
            .first,
      );
      expect(routeSemantics.properties.namesRoute, isTrue);
      expect(find.byType(FocusTraversalOrder), findsNWidgets(2));
    });

    testWidgets('cards expose a grouped semantic container', (tester) async {
      await tester.pumpWidget(
        harness(
          FeastaCard(
            semanticLabel: 'Provider: Sample Catering',
            onTap: () {},
            child: const Text('Sample Catering'),
          ),
        ),
      );
      final card = tester.widget<Semantics>(
        find.bySemanticsLabel('Provider: Sample Catering'),
      );
      expect(card.properties.button, isTrue);
      expect(card.explicitChildNodes, isTrue);
    });
  });
}
