import 'package:flutter/material.dart';

import '../../../services/promotion_service.dart';
import '../widgets/promotion/promotion_list_widget.dart';

class PromotionsPage extends StatelessWidget {
  const PromotionsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Promotions',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 8),
                  Text('Manage promotional banners and campaigns.', style: Theme.of(context).textTheme.bodyMedium),
                ],
              ),
            ),
            FilledButton.icon(
              onPressed: () {
                PromotionListWidget.showCreateDialog(context, service: PromotionService());
              },
              icon: const Icon(Icons.add_rounded),
              label: const Text('New Promotion'),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Expanded(child: PromotionListWidget(service: PromotionService()),),
      ],
    );
  }
}
