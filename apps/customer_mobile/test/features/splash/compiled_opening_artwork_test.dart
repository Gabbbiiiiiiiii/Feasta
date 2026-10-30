import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vector_graphics/vector_graphics.dart' show AssetBytesLoader;
import 'package:vector_graphics_compiler/vector_graphics_compiler.dart'
    as compiler;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final name in [
    'feasta_spoon',
    'feasta_knife',
    'feasta_assembled_f',
    'feasta_easta_only_aligned',
    'feasta_full_wordmark',
  ]) {
    test(
      '$name compiled artifact stays current and renders identical gradients/paths',
      () async {
        final source = 'assets/branding/$name.svg';
        final expected = compiler.encodeSvg(
          xml: File(source).readAsStringSync(),
          debugName: 'Svg loader',
          enableClippingOptimizer: false,
          enableMaskingOptimizer: false,
          enableOverdrawOptimizer: false,
        );
        expect(
          listEquals(File('$source.vec').readAsBytesSync(), expected),
          isTrue,
          reason: 'Regenerate with dart run tool/compile_opening_vectors.dart',
        );
        final svg = await vg.loadPicture(SvgAssetLoader(source), null);
        final compiled = await vg.loadPicture(
          AssetBytesLoader('$source.vec'),
          null,
        );
        expect(compiled.size, svg.size);
        final width = svg.size.width.ceil();
        final height = svg.size.height.ceil();
        final originalImage = await svg.picture.toImage(width, height);
        final compiledImage = await compiled.picture.toImage(width, height);
        final originalPixels = await originalImage.toByteData(
          format: ui.ImageByteFormat.rawRgba,
        );
        final compiledPixels = await compiledImage.toByteData(
          format: ui.ImageByteFormat.rawRgba,
        );
        expect(
          listEquals(
            originalPixels!.buffer.asUint8List(),
            compiledPixels!.buffer.asUint8List(),
          ),
          isTrue,
          reason:
              'The opening artwork must retain its supplied geometry and gradients.',
        );
        originalImage.dispose();
        compiledImage.dispose();
        svg.picture.dispose();
        compiled.picture.dispose();
      },
    );
  }
}
