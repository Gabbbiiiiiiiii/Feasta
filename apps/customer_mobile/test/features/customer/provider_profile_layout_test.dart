import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:feasta/features/customer/provider_profile_screen.dart';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:feasta/core/theme/app_theme.dart';
import 'package:flutter_test/flutter_test.dart';
import 'provider_discovery_test.dart'
    show provider, ProfileRepository, GuestAuth;

class _Headers implements HttpHeaders {
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class _Response extends StreamView<List<int>> implements HttpClientResponse {
  _Response(Uint8List bytes)
    : byteLength = bytes.length,
      super(Stream.value(bytes));
  final int byteLength;
  @override
  int get statusCode => HttpStatus.ok;
  @override
  int get contentLength => byteLength;
  @override
  HttpClientResponseCompressionState get compressionState =>
      HttpClientResponseCompressionState.notCompressed;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Request implements HttpClientRequest {
  _Request(this.bytes);
  final Uint8List bytes;
  @override
  HttpHeaders get headers => _Headers();
  @override
  Future<HttpClientResponse> close() async => _Response(bytes);
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class LogoTestClient implements HttpClient {
  LogoTestClient(this.bytes);
  final Uint8List bytes;
  @override
  Future<HttpClientRequest> getUrl(Uri url) async => _Request(bytes);
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

Future<Uint8List> logoBytes(int width, int height) async {
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  canvas.drawRect(
    Rect.fromLTWH(0, 0, width.toDouble(), height.toDouble()),
    Paint()..color = Colors.orange,
  );
  canvas.drawRect(
    Rect.fromLTWH(4, 4, width - 8.0, height - 8.0),
    Paint()..color = Colors.teal,
  );
  final picture = recorder.endRecording();
  final image = await picture.toImage(width, height);
  final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  picture.dispose();
  return bytes!.buffer.asUint8List();
}

Future<void> waitForLogoFit(WidgetTester tester) async {
  for (var attempt = 0; attempt < 150; attempt++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 20)),
    );
    await tester.pump();
    if (find
        .byKey(const ValueKey('logo-fitted-artwork'))
        .evaluate()
        .isNotEmpty) {
      return;
    }
  }
  fail('Logo fitting did not complete');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = GuestAuth();
  });
  for (final rectangular in [false, true]) {
    for (final scale in [1.0, 1.3, 2.0]) {
      testWidgets(
        'C55 profile overlap ${rectangular ? "rectangle" : "square"} at $scale',
        (tester) async {
          tester.view.physicalSize = const Size(1080, 2400);
          tester.view.devicePixelRatio = 3;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final bytes = (await tester.runAsync(
            () => logoBytes(rectangular ? 240 : 120, rectangular ? 80 : 120),
          ))!;
          debugNetworkImageHttpClientProvider = () => LogoTestClient(bytes);
          addTearDown(() {
            debugNetworkImageHttpClientProvider = null;
            PaintingBinding.instance.imageCache.clear();
          });
          final selected = provider(
            name: "Lerie's Photo",
            category: 'photographer',
            serviceType: 'addon',
            location: 'A long venue street address, Ormoc City, Leyte',
            cover: 'https://example.com/cover-$rectangular-$scale.png',
            logo: 'https://example.com/logo-$rectangular-$scale.png',
            rating: 4.8,
            reviews: 12,
          );
          await tester.pumpWidget(
            MaterialApp(
              theme: AppTheme.light,
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: TextScaler.linear(scale)),
                child: child!,
              ),
              home: RepaintBoundary(
                key: const ValueKey('profile-visual'),
                child: ProviderProfileScreen(
                  provider: selected,
                  repository: ProfileRepository(),
                ),
              ),
            ),
          );
          await tester.runAsync(() async {
            await Future<void>.delayed(const Duration(milliseconds: 80));
          });
          await waitForLogoFit(tester);
          await tester.pumpAndSettle();
          final avatar = find.byKey(const ValueKey('profile-avatar'));
          final avatarRect = tester.getRect(avatar);
          final cardRect = tester.getRect(
            find.byKey(const ValueKey('profile-card-background')),
          );
          final headerRect = tester.getRect(
            find.byKey(const ValueKey('profile-header')),
          );
          expect(avatarRect.top, lessThan(cardRect.top));
          expect(avatarRect.bottom, greaterThan(cardRect.top));
          final coverRect = tester.getRect(
            find.byKey(const ValueKey('profile-cover')),
          );
          expect(cardRect.top, lessThan(coverRect.bottom));
          expect(avatarRect.top, lessThan(coverRect.bottom));
          expect(avatarRect.bottom, greaterThan(coverRect.bottom));
          expect(headerRect.contains(avatarRect.topLeft), isTrue);
          expect(headerRect.contains(avatarRect.bottomRight), isTrue);
          final identity = tester.getRect(
            find.byKey(const ValueKey('profile-name-category')),
          );
          expect(identity.left, greaterThan(avatarRect.right));
          expect(identity.top, lessThan(avatarRect.bottom));
          expect(
            find.ancestor(of: avatar, matching: find.byType(Card)),
            findsNothing,
          );
          for (final key in ['profile-header', 'profile-identity-stack']) {
            expect(
              tester.widget<Stack>(find.byKey(ValueKey(key))).clipBehavior,
              Clip.none,
            );
          }
          final logo = tester.widget<Image>(
            find.byWidgetPredicate(
              (w) =>
                  w is Image &&
                  w.semanticLabel == '${selected.businessName} logo',
            ),
          );
          expect((logo.image as NetworkImage).url, selected.logoUrl);
          expect(logo.fit, BoxFit.contain);
          final decoded = tester.widget<RawImage>(
            find.descendant(of: avatar, matching: find.byType(RawImage)),
          );
          expect(decoded.image!.width, rectangular ? 240 : 120);
          expect(decoded.image!.height, rectangular ? 80 : 120);
          expect(
            find.descendant(of: avatar, matching: find.byType(ClipOval)),
            findsOneWidget,
          );
          expect(find.text('4.8 (12 reviews)'), findsOneWidget);
          expect(tester.takeException(), isNull);
          await expectLater(
            find.byKey(const ValueKey('profile-visual')),
            matchesGoldenFile(
              'goldens/profile_${rectangular ? "rectangle" : "square"}_$scale.png',
            ),
          );
          await tester.drag(
            find.byType(CustomScrollView),
            const Offset(0, -500),
          );
          await tester.pumpAndSettle();
          await tester.ensureVisible(find.text('Chat'));
          await tester.pumpAndSettle();
          await tester.tap(find.text('Chat'));
          await tester.pumpAndSettle();
          expect(
            find.text(
              'Please log in or create an account to message this provider.',
            ),
            findsOneWidget,
          );
          await tester.binding.handlePopRoute();
          await tester.pumpAndSettle();
          // Drain the existing policy loader's three timeouts and retry delays.
          for (var attempt = 0; attempt < 6; attempt++) {
            await tester.pump(const Duration(seconds: 11));
          }
          expect(find.text('Book Now'), findsOneWidget);
          await tester.scrollUntilVisible(
            find.widgetWithText(ChoiceChip, 'Portfolio'),
            200,
            scrollable: find.byType(Scrollable).first,
          );
          await tester.tap(find.widgetWithText(ChoiceChip, 'Portfolio'));
          await tester.pumpAndSettle();
          expect(find.widgetWithText(ChoiceChip, 'Menu'), findsNothing);
          expect(tester.takeException(), isNull);
          debugNetworkImageHttpClientProvider = null;
        },
      );
    }
  }
}
