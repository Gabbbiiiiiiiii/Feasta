import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Official artwork, with its original aspect ratio and gradients.
class FeastaBrand extends StatelessWidget {
  const FeastaBrand({this.iconOnly = false, this.width = 200, super.key});

  final bool iconOnly;
  final double width;

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
    'assets/branding/${iconOnly ? 'feasta_assembled_f' : 'feasta_full_wordmark'}.svg',
    width: width,
    height: width * 159 / (iconOnly ? 177 : 417),
    semanticsLabel: 'FEASTA logo',
  );
}
