import 'package:flutter/material.dart';

class SecurityBanner extends StatelessWidget {
  final String? adminEmail;
  final bool isVisible;

  const SecurityBanner({
    super.key,
    this.adminEmail,
    this.isVisible = true,
  });

  @override
  Widget build(BuildContext context) {
    if (!isVisible) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: Colors.red.shade200,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.lock,
            color: Colors.red,
            size: 22,
          ),
          const SizedBox(width: 10),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  "Secure Admin Area",
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                    color: Colors.red,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  "This system is restricted to authorized administrators only. All actions are monitored and logged.",
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.black87,
                  ),
                ),

                if (adminEmail != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    "Logged in as: $adminEmail",
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: Colors.grey.shade700,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}