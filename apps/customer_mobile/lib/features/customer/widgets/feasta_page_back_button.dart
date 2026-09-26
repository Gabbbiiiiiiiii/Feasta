import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';

class FeastaPageBackButton extends StatelessWidget {
  const FeastaPageBackButton({
    required this.onPressed,
    this.semanticLabel = 'Go back',
    super.key,
  });

  final VoidCallback onPressed;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semanticLabel,
      child: SizedBox(
        width: 44,
        height: 44,
        child: Material(
          color: Colors.transparent,
          shape: const CircleBorder(),
          child: InkWell(
            onTap: onPressed,
            customBorder: const CircleBorder(),
            child: const Center(
              child: Icon(
                Icons.arrow_back_rounded,
                size: 24,
                color: AppColors.mainText,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
