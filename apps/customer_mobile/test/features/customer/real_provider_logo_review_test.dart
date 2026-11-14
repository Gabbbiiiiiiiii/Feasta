import 'dart:io';

import 'package:feasta/features/customer/widgets/provider_brand_visual.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'provider_discovery_test.dart' show provider;
import 'provider_profile_layout_test.dart' show LogoTestClient, waitForLogoFit;

// Optional local review: images are downloaded unchanged from public profiles.
// No Firebase credentials, tokenized URLs or uploaded artwork enter the repo.
void main() {
  final directory = Platform.environment['FEASTA_LOGO_REVIEW_DIR'];
  for (final entry in [
    (0, "Sophie's Shot"),
    (1, "Lerie's Photo"),
    (2, 'JS Catering'),
    (3, 'SB'),
  ]) {
    testWidgets('real uploaded logo: ${entry.$2}', (tester) async {
      final bytes = File('$directory/logo-${entry.$1}.img').readAsBytesSync();
      debugNetworkImageHttpClientProvider = () => LogoTestClient(bytes);
      addTearDown(() {
        debugNetworkImageHttpClientProvider = null;
        PaintingBinding.instance.imageCache.clear();
      });
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: RepaintBoundary(
                key: const ValueKey('real-logo'),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: ProviderLogoBadge(
                    provider: provider(
                      name: entry.$2,
                      logo: 'https://example.com/real-${entry.$1}',
                    ),
                    circular: true,
                    size: 80,
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.runAsync(() async {
        await Future<void>.delayed(const Duration(milliseconds: 150));
      });
      await tester.pumpAndSettle();
      await waitForLogoFit(tester);
      final raw = tester.widget<RawImage>(find.byType(RawImage));
      expect(raw.image, isNotNull);
      final imageSize = tester.getSize(find.byType(Image));
      final maskSize = tester.getSize(find.byType(ClipOval));
      debugPrint(
        '${entry.$2}: source=${raw.image!.width}x${raw.image!.height}, rendered=$imageSize, mask=$maskSize',
      );
      if (entry.$1 < 2) {
        expect(imageSize.width, greaterThanOrEqualTo(maskSize.width));
      }
      if (entry.$1 == 2) {
        // Previously the entire padded source was only 63.2 logical pixels wide.
        // A larger source rendering lets the actual lettering fill the mask.
        expect(imageSize.width, greaterThan(maskSize.width * 1.5));
        expect(imageSize.width / imageSize.height, closeTo(2816 / 1536, 0.001));
      }
      await expectLater(
        find.byKey(const ValueKey('real-logo')),
        matchesGoldenFile(Uri.file('$directory/real-logo-${entry.$1}.png')),
      );
      expect(tester.takeException(), isNull);
      debugNetworkImageHttpClientProvider = null;
    }, skip: directory == null);
  }
}
