import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'adaptive white F stays within mask safe zone without a second inset',
    () async {
      final codec = await ui.instantiateImageCodec(
        File('assets/branding/feasta_icon_foreground.png').readAsBytesSync(),
      );
      final image = (await codec.getNextFrame()).image;
      final pixels = (await image.toByteData(
        format: ui.ImageByteFormat.rawStraightRgba,
      ))!.buffer.asUint8List();
      var whitePixels = 0;
      var isWhite = true;
      var furthestPixel = 0.0;
      for (var y = 0; y < image.height; y++) {
        for (var x = 0; x < image.width; x++) {
          final offset = (y * image.width + x) * 4;
          if (pixels[offset + 3] < 128) continue;
          whitePixels++;
          if (pixels[offset] != 255 ||
              pixels[offset + 1] != 255 ||
              pixels[offset + 2] != 255) {
            isWhite = false;
          }
          final distance = math.sqrt(
            math.pow(x + .5 - 512, 2) + math.pow(y + .5 - 512, 2),
          );
          if (distance > furthestPixel) furthestPixel = distance;
        }
      }
      expect(whitePixels, greaterThan(50000));
      expect(isWhite, isTrue);
      expect(furthestPixel, lessThanOrEqualTo(1024 * 66 / 108 / 2 + 1));
      final xml = File(
        'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
      ).readAsStringSync();
      expect(xml, contains('@drawable/ic_launcher_background'));
      expect(xml, contains('android:inset="0%"'));
      image.dispose();
      codec.dispose();
    },
  );

  test(
    'every configured iOS launcher icon is opaque at its required resolution',
    () async {
      const folder = 'ios/Runner/Assets.xcassets/AppIcon.appiconset';
      final catalog =
          jsonDecode(File('$folder/Contents.json').readAsStringSync())
              as Map<String, dynamic>;
      for (final entry
          in (catalog['images'] as List).cast<Map<String, dynamic>>()) {
        final codec = await ui.instantiateImageCodec(
          File('$folder/${entry['filename']}').readAsBytesSync(),
        );
        final image = (await codec.getNextFrame()).image;
        final size = double.parse((entry['size'] as String).split('x').first);
        final scale = double.parse(
          (entry['scale'] as String).replaceAll('x', ''),
        );
        expect(image.width, (size * scale).round());
        expect(image.height, image.width);
        final pixels = (await image.toByteData())!.buffer.asUint8List();
        var opaque = true;
        for (var i = 3; i < pixels.length; i += 4) {
          if (pixels[i] != 255) {
            opaque = false;
            break;
          }
        }
        expect(opaque, isTrue, reason: entry['filename'] as String);
        // All four corners remain emerald for iOS to apply its own corner mask.
        expect(pixels[1], greaterThan(pixels[0]));
        image.dispose();
        codec.dispose();
      }
    },
  );
}
