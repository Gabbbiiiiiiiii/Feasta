import 'package:flutter/material.dart';

import '../../models/promotion_model.dart';
import '../../services/promotion_service.dart';
import 'promotion_actions.dart';
import 'promotion_filters.dart';

class PromotionListWidget extends StatefulWidget {
  const PromotionListWidget({super.key, this.service});

  final PromotionService? service;

  static void showCreateDialog(BuildContext context, {PromotionService? service}) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => Scaffold(body: Center(child: Text('Create dialog placeholder')))));
  }

  @override
  State<PromotionListWidget> createState() => _PromotionListWidgetState();
}

class _PromotionListWidgetState extends State<PromotionListWidget> {
  late final PromotionService _service = widget.service ?? PromotionService();
  late final Stream<List<PromotionModel>> _stream = _service.watchPromotions();

  String _search = '';

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        PromotionFilters(onSearch: (s) => setState(() => _search = s)),
        const SizedBox(height: 12),
        Expanded(
          child: StreamBuilder<List<PromotionModel>>(
            stream: _stream,
            initialData: const <PromotionModel>[],
            builder: (context, snapshot) {
              final items = snapshot.data ?? [];
              if (snapshot.connectionState == ConnectionState.waiting) return const Center(child: CircularProgressIndicator());

              final filtered = items.where((p) {
                if (_search.isEmpty) return true;
                final s = _search.toLowerCase();
                return p.title.toLowerCase().contains(s) || p.description.toLowerCase().contains(s);
              }).toList();

              if (filtered.isEmpty) return Card(child: Padding(padding: const EdgeInsets.all(24), child: Text('No promotions found.')));

              return ListView.separated(
                itemCount: filtered.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, index) {
                  final p = filtered[index];
                  return Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          if (p.imageUrl != null && p.imageUrl!.isNotEmpty)
                            ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.network(p.imageUrl!, width: 140, height: 80, fit: BoxFit.cover),
                            )
                          else
                            Container(width: 140, height: 80, color: const Color(0xFFF4F4F4)),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(child: Text(p.title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
                                    Text(p.promotionType.toUpperCase(), style: Theme.of(context).textTheme.bodySmall),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Text(p.subtitle ?? p.description, maxLines: 2, overflow: TextOverflow.ellipsis),
                                const SizedBox(height: 8),
                                Row(children: [Text('Priority ${p.order}'), const SizedBox(width: 12), Text(p.isActive ? 'Active' : 'Inactive')]),
                              ],
                            ),
                          ),
                          PromotionActions(promotion: p, service: _service),
                        ],
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}
