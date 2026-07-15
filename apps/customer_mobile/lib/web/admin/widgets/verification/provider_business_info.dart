import 'package:flutter/material.dart';

import '../../models/verification/provider_verification.dart';

class ProviderBusinessInfo extends StatelessWidget {
  final ProviderVerificationApplication application;

  const ProviderBusinessInfo({
    super.key,
    required this.application,
  });

  @override
  Widget build(BuildContext context) {
    final items = [
      _BusinessInfoData(
        label: 'Provider Type',
        value: application.providerType,
        icon: Icons.category_outlined,
      ),
      _BusinessInfoData(
        label: 'Owner',
        value: application.ownerName,
        icon: Icons.person_outline_rounded,
      ),
      _BusinessInfoData(
        label: 'Phone Number',
        value: application.phone,
        icon: Icons.phone_outlined,
      ),
      _BusinessInfoData(
        label: 'Email Address',
        value: application.email,
        icon: Icons.email_outlined,
      ),
      _BusinessInfoData(
        label: 'Location',
        value: application.location,
        icon: Icons.location_on_outlined,
      ),
      _BusinessInfoData(
        label: 'Business Since',
        value: application.businessSince,
        icon: Icons.calendar_month_outlined,
      ),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = _columnCount(constraints.maxWidth);
        const spacing = 12.0;

        final itemWidth =
            (constraints.maxWidth - ((columns - 1) * spacing)) /
                columns;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(
                  Icons.business_outlined,
                  size: 19,
                  color: Color(0xFF374151),
                ),
                SizedBox(width: 8),
                Text(
                  'Business Information',
                  style: TextStyle(
                    color: Color(0xFF111827),
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: spacing,
              runSpacing: 12,
              children: items.map((item) {
                return SizedBox(
                  width: itemWidth,
                  child: _BusinessInfoCard(data: item),
                );
              }).toList(),
            ),
          ],
        );
      },
    );
  }

  int _columnCount(double width) {
    if (width >= 1100) {
      return 6;
    }

    if (width >= 850) {
      return 3;
    }

    if (width >= 560) {
      return 2;
    }

    return 1;
  }
}

class _BusinessInfoCard extends StatelessWidget {
  final _BusinessInfoData data;

  const _BusinessInfoCard({
    required this.data,
  });

  @override
  Widget build(BuildContext context) {
    final displayValue =
        data.value.trim().isEmpty ? 'Not provided' : data.value;

    return Container(
      constraints: const BoxConstraints(
        minHeight: 104,
      ),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF9FAFB),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: const Color(0xFFE5E7EB),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF1EC),
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Icon(
                  data.icon,
                  size: 17,
                  color: const Color(0xFFFF6333),
                ),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Text(
                  data.label,
                  style: const TextStyle(
                    color: Color(0xFF6B7280),
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 11),
          SelectableText(
            displayValue,
            maxLines: 3,
            style: TextStyle(
              color: data.value.trim().isEmpty
                  ? const Color(0xFF9CA3AF)
                  : const Color(0xFF1F2937),
              fontSize: 13,
              fontWeight: FontWeight.w600,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _BusinessInfoData {
  final String label;
  final String value;
  final IconData icon;

  const _BusinessInfoData({
    required this.label,
    required this.value,
    required this.icon,
  });
}