import 'package:flutter/material.dart';

import '../../models/promotion_model.dart';
import '../../services/promotion_service.dart';
import 'promotion_preview_dialog.dart';
import 'promotion_editor_dialog.dart';

class PromotionActions extends StatelessWidget {
  const PromotionActions({super.key, required this.promotion, required this.service});

  final PromotionModel promotion;
  final PromotionService service;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(
          tooltip: 'Preview',
          onPressed: () => showDialog(context: context, builder: (_) => PromotionPreviewDialog(promotion: promotion)),
          icon: const Icon(Icons.visibility_rounded),
        ),
        IconButton(
          tooltip: 'Edit',
          onPressed: () => PromotionEditorDialog.show(context, promotion: promotion, service: service),
          icon: const Icon(Icons.edit_rounded),
        ),
        IconButton(
          tooltip: promotion.isActive ? 'Disable' : 'Enable',
          onPressed: () async {
            try {
              await service.updatePromotion(id: promotion.id, isActive: !promotion.isActive);
              if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Promotion updated.')));
            } catch (e) {
              if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
            }
          },
          icon: Icon(promotion.isActive ? Icons.toggle_on : Icons.toggle_off),
        ),
        IconButton(
          tooltip: 'Delete',
          onPressed: () async {
            final confirm = await showDialog<bool>(context: context, builder: (c) => AlertDialog(title: const Text('Delete'), content: const Text('Soft-delete this promotion?'), actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Delete'))]));
            if (confirm == true) {
              try {
                await service.deletePromotion(promotion.id);
                if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Promotion removed.')));
              } catch (e) {
                if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
              }
            }
          },
          icon: const Icon(Icons.delete_outline_rounded),
        ),
      ],
    );
  }
}
