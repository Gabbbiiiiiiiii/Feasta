import 'package:flutter/material.dart';

class PromotionFilters extends StatelessWidget {
  const PromotionFilters({super.key, this.onSearch});

  final ValueChanged<String>? onSearch;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: TextField(
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search promotions'),
            onChanged: onSearch,
          ),
        ),
        const SizedBox(width: 12),
        ElevatedButton.icon(onPressed: () {}, icon: const Icon(Icons.filter_list), label: const Text('Filters')),
      ],
    );
  }
}
