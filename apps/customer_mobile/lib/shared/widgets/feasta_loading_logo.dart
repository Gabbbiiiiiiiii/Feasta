import 'package:flutter/material.dart';

import '../../core/theme/app_sizes.dart';
import 'feasta_brand.dart';

class FeastaLoadingLogo extends StatelessWidget {
  const FeastaLoadingLogo({super.key});

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Loading',
    liveRegion: true,
    child: const ExcludeSemantics(
      child: FeastaBrand(iconOnly: true, width: AppSizes.avatarLarge),
    ),
  );
}
