// Run: dart run tool/compile_opening_vectors.dart
// Same compiler/options as flutter_svg's runtime loader, moved out of startup.
import 'dart:io';

import 'package:vector_graphics_compiler/vector_graphics_compiler.dart';

void main() {
  for (final name in [
    'feasta_spoon',
    'feasta_knife',
    'feasta_assembled_f',
    'feasta_easta_only_aligned',
    'feasta_full_wordmark',
  ]) {
    final source = File('assets/branding/$name.svg');
    final bytes = encodeSvg(
      xml: source.readAsStringSync(),
      debugName: 'Svg loader',
      enableClippingOptimizer: false,
      enableMaskingOptimizer: false,
      enableOverdrawOptimizer: false,
    );
    File('${source.path}.vec').writeAsBytesSync(bytes);
  }
}
