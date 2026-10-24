import 'package:flutter/material.dart';

import '../../shared/widgets/feasta_brand.dart';
import 'opening_animation.dart';

/// Static secure-startup placeholder, also used during auth restoration.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: feastaOpeningBackground,
    body: Semantics(
      label: 'FEASTA is starting securely',
      child: const Center(child: FeastaBrand()),
    ),
  );
}
