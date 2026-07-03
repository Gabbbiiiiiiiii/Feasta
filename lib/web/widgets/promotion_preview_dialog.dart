import 'package:flutter/material.dart';

import '../../models/promotion_model.dart';

class PromotionPreviewDialog extends StatelessWidget {
  const PromotionPreviewDialog({super.key, required this.promotion});

  final PromotionModel promotion;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: SizedBox(
        width: 360,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (promotion.imageUrl != null)
              Image.network(promotion.imageUrl!, width: 360, height: 200, fit: BoxFit.cover)
            else
              Container(height: 200, color: const Color(0xFFF4F4F4)),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(promotion.title, style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  Text(promotion.subtitle ?? promotion.description),
                  const SizedBox(height: 12),
                  ElevatedButton(onPressed: () {}, child: Text(promotion.buttonText)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
